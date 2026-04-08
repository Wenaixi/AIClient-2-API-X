/**
 * Kimi (Moonshot AI) OAuth 设备流认证
 * 实现 RFC 8628 OAuth2 Device Authorization Grant 流程
 */

import axios from 'axios';
import os from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// Kimi OAuth 常量
// 内置默认值，支持通过环境变量覆盖
const KIMI_CLIENT_ID = process.env.KIMI_CLIENT_ID || 'kimi-device-client';
const KIMI_OAUTH_HOST = 'https://auth.kimi.com';
const KIMI_DEVICE_CODE_URL = `${KIMI_OAUTH_HOST}/api/oauth/device_authorization`;
const KIMI_TOKEN_URL = `${KIMI_OAUTH_HOST}/api/oauth/token`;
const KIMI_API_BASE_URL = 'https://api.kimi.com/coding';
const KIMI_DEVICE_ID_FILE = 'configs/.kimi_device_id';

// 设备 ID 持久化（模块级单例）
let _cachedDeviceId = null;

// 轮询配置
const DEFAULT_POLL_INTERVAL = 5000; // 5秒
const MAX_POLL_DURATION = 15 * 60 * 1000; // 15分钟
const REFRESH_THRESHOLD_SECONDS = 300; // 5分钟

/**
 * 获取设备模型信息
 */
function getDeviceModel() {
    const platform = os.platform();
    const arch = os.arch();

    switch (platform) {
        case 'darwin':
            return `macOS ${arch}`;
        case 'win32':
            return `Windows ${arch}`;
        case 'linux':
            return `Linux ${arch}`;
        default:
            return `${platform} ${arch}`;
    }
}

/**
 * 获取主机名
 */
function getHostname() {
    try {
        return os.hostname();
    } catch (error) {
        return 'unknown';
    }
}

/**
 * 获取或创建设备 ID
 * 使用模块级缓存，确保同一进程内所有客户端实例使用相同的设备 ID
 * 持久化到磁盘，避免进程重启后生成新设备 ID 导致 OAuth token 失效
 */
function getOrCreateDeviceId() {
    if (_cachedDeviceId) {
        return _cachedDeviceId;
    }

    const configDir = process.cwd();
    const deviceFile = resolve(configDir, KIMI_DEVICE_ID_FILE);

    // 尝试从磁盘加载
    try {
        const existingId = readFileSync(deviceFile, 'utf-8').trim();
        if (existingId) {
            _cachedDeviceId = existingId;
            return _cachedDeviceId;
        }
    } catch {
        // 文件不存在或读取失败，继续生成新 ID
    }

    // 生成并持久化
    _cachedDeviceId = crypto.randomUUID();
    try {
        const dir = dirname(deviceFile);
        mkdirSync(dir, { recursive: true });
        writeFileSync(deviceFile, _cachedDeviceId, 'utf-8');
    } catch (err) {
        logger.warn('[Kimi OAuth] Failed to persist device ID:', err.message);
    }

    return _cachedDeviceId;
}

/**
 * Kimi OAuth 客户端
 */
export class KimiOAuthClient {
    constructor(config = {}) {
        this.config = config;
        // 优先使用配置的 deviceId，否则从 kimi-cli 存储位置读取或生成
        this.deviceId = config.deviceId || getOrCreateDeviceId();

        // 配置 axios，支持代理和 TLS
        const axiosConfig = {
            timeout: 30000,
            // 允许处理 400-499 响应（OAuth 错误如 authorization_pending 返回 400）
            validateStatus: (status) => status < 500
        };

        // 如果配置了代理，使用代理；否则使用系统默认代理（避免直连）
        if (config.proxy === false) {
            // 不禁用代理，让 axios 使用系统默认代理
            // axios 默认会使用环境变量 HTTP_PROXY / HTTPS_PROXY
            delete axiosConfig.proxy;
        } else if (config.proxy) {
            axiosConfig.proxy = config.proxy;
        }

        this.httpClient = axios.create(axiosConfig);
    }

    /**
     * 获取通用请求头（与参考项目 cli-proxy-api 保持一致）
     */
    getCommonHeaders() {
        return {
            'X-Msh-Platform': 'cli-proxy-api',
            'X-Msh-Version': '1.0.0',
            'X-Msh-Device-Name': getHostname(),
            'X-Msh-Device-Model': getDeviceModel(),
            'X-Msh-Device-Id': this.deviceId
        };
    }

    /**
     * 获取设备ID
     */
    getDeviceId() {
        return this.deviceId;
    }

    /**
     * 请求设备码
     * 返回 DeviceCodeResponse 格式（与参考项目一致）
     */
    async requestDeviceCode() {
        logger.debug('[Kimi OAuth] Requesting device code from:', KIMI_DEVICE_CODE_URL);
        try {
            const response = await this.httpClient.post(
                KIMI_DEVICE_CODE_URL,
                new URLSearchParams({
                    client_id: KIMI_CLIENT_ID
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        ...this.getCommonHeaders()
                    }
                }
            );

            logger.debug('[Kimi OAuth] Device code response received');

            if (response.status !== 200) {
                throw new Error(`Device code request failed with status ${response.status}`);
            }

            const data = response.data;

            // 转换为与参考项目一致的字段命名
            const result = {
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri,
                verification_uri_complete: data.verification_uri_complete,
                expires_in: data.expires_in,
                interval: data.interval
            };
            return result;
        } catch (error) {
            logger.error('[Kimi OAuth] Failed to request device code:', error.message);
            throw new Error(`Failed to request device code: ${error.message}`);
        }
    }

    /**
     * 轮询获取 Token
     * 完全复刻参考项目的 PollForToken 实现
     */
    async pollForToken(deviceCodeResponse) {
        // 计算轮询间隔（秒转毫秒）
        const interval = deviceCodeResponse.interval || 5;
        const expiresIn = deviceCodeResponse.expires_in || 0;
        const pollInterval = Math.max(interval * 1000, DEFAULT_POLL_INTERVAL);

        // 计算截止时间
        const now = Date.now();
        let deadline = now + MAX_POLL_DURATION;
        if (expiresIn > 0) {
            const codeDeadline = now + expiresIn * 1000;
            if (codeDeadline < deadline) {
                deadline = codeDeadline;
            }
        }
        logger.info('[Kimi OAuth] Polling for token (interval: ' + pollInterval + 'ms, expires in: ' + expiresIn + 's)');

        // 轮询循环（与Go一致：先等待再执行）
        let pollCount = 0;
        let currentPollInterval = pollInterval;
        while (Date.now() < deadline) {
            // 先等待（Go的ticker行为）
            await new Promise(resolve => setTimeout(resolve, currentPollInterval));

            pollCount++;
            logger.debug('[Kimi OAuth] Poll attempt #' + pollCount);

            const { token, error, shouldContinue, increaseInterval } = await this.exchangeDeviceCode(deviceCodeResponse.device_code);

            if (token) {
                logger.info('[Kimi OAuth] Token received on attempt #' + pollCount);
                return token;
            }

            // slow_down 时增加轮询间隔（按RFC 8628规范要求）
            if (increaseInterval) {
                currentPollInterval = Math.min(currentPollInterval * 2, MAX_POLL_INTERVAL);
                logger.debug('[Kimi OAuth] Increased poll interval to ' + currentPollInterval + 'ms');
            }

            if (!shouldContinue) {
                logger.error('[Kimi OAuth] Terminal error on attempt #' + pollCount + ': ' + error.message);
                throw error;
            }
            logger.debug('[Kimi OAuth] Still waiting for authorization...');
            // 继续轮询
        }

        logger.error('[Kimi OAuth] Device code expired, deadline reached');
        throw new Error('Device code expired');
    }

    /**
     * 交换设备码获取 Token
     * 完全复刻参考项目的 exchangeDeviceCode 实现
     * 返回 {token, error, shouldContinue} 三元组
     */
    async exchangeDeviceCode(deviceCode) {
        try {
            const response = await this.httpClient.post(
                KIMI_TOKEN_URL,
                new URLSearchParams({
                    client_id: KIMI_CLIENT_ID,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        ...this.getCommonHeaders()
                    }
                }
            );

            // Kimi 返回 200 表示成功或 pending
            const data = response.data;

            // 处理 OAuth 错误
            if (data.error) {
                switch (data.error) {
                    case 'authorization_pending':
                        logger.debug('[Kimi OAuth] Authorization pending...');
                        return { token: null, error: null, shouldContinue: true, increaseInterval: false };
                    case 'slow_down':
                        logger.warn('[Kimi OAuth] Slow down signal, increasing polling interval');
                        return { token: null, error: null, shouldContinue: true, increaseInterval: true };
                    case 'expired_token':
                        return { token: null, error: new Error('Device code expired'), shouldContinue: false, increaseInterval: false };
                    case 'access_denied':
                        return { token: null, error: new Error('Access denied by user'), shouldContinue: false, increaseInterval: false };
                    default:
                        return { token: null, error: new Error(`OAuth error: ${data.error} - ${data.error_description || ''}`), shouldContinue: false, increaseInterval: false };
                }
            }

            // 验证 Token
            if (!data.access_token) {
                logger.error('[Kimi OAuth] Empty access token in response');
                return { token: null, error: new Error('Empty access token in response'), shouldContinue: false };
            }

            // 计算过期时间
            const expiresAt = data.expires_in > 0
                ? Math.floor(Date.now() / 1000) + data.expires_in
                : 0;

            const token = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                token_type: data.token_type || 'Bearer',
                expires_at: expiresAt,
                scope: data.scope,
                device_id: this.deviceId
            };
            logger.info('[Kimi OAuth] Successfully obtained token, expires_at: ' + expiresAt);

            return { token, error: null, shouldContinue: false, increaseInterval: false };
        } catch (error) {
            logger.debug('[Kimi OAuth] exchangeDeviceCode error:', error.message);
            // 检查是否是 OAuth 错误响应（Kimi 返回 400 但 body 中有 error 信息）
            if (error.response?.data) {
                const oauthError = error.response.data;
                logger.debug('[Kimi OAuth] OAuth error response:', oauthError.error);
                if (oauthError.error) {
                    return {
                        token: null,
                        error: new Error(`${oauthError.error}: ${oauthError.error_description || 'Unknown error'}`),
                        shouldContinue: oauthError.error === 'authorization_pending' || oauthError.error === 'slow_down'
                    };
                }
            }
            // 网络错误等，返回错误并停止轮询
            return { token: null, error, shouldContinue: false };
        }
    }

    /**
     * 刷新 Token
     */
    async refreshToken(refreshToken) {
        try {
            const response = await this.httpClient.post(
                KIMI_TOKEN_URL,
                new URLSearchParams({
                    client_id: KIMI_CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        ...this.getCommonHeaders()
                    }
                }
            );

            if (response.status === 401 || response.status === 403) {
                throw new Error(`Refresh token rejected (status ${response.status})`);
            }

            if (response.status !== 200) {
                throw new Error(`Refresh failed with status ${response.status}`);
            }

            const data = response.data;

            if (!data.access_token) {
                throw new Error('Empty access token in refresh response');
            }

            const expiresAt = data.expires_in > 0
                ? Math.floor(Date.now() / 1000) + data.expires_in
                : 0;

            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
                token_type: data.token_type || 'Bearer',
                expires_at: expiresAt,
                scope: data.scope
            };
        } catch (error) {
            logger.error('[Kimi OAuth] Failed to refresh token:', error.message);
            throw new Error(`Failed to refresh token: ${error.message}`);
        }
    }
}

/**
 * Kimi Token 存储
 */
export class KimiTokenStorage {
    constructor(tokenData) {
        this.access_token = tokenData.access_token;
        this.refresh_token = tokenData.refresh_token;
        this.token_type = tokenData.token_type || 'Bearer';
        this.scope = tokenData.scope || '';
        this.device_id = tokenData.device_id || '';
        this.expired = tokenData.expires_at
            ? new Date(tokenData.expires_at * 1000).toISOString()
            : '';
        this.type = 'kimi';
        this.last_refresh = tokenData.last_refresh || new Date().toISOString();
    }

    /**
     * 检查 Token 是否过期
     */
    isExpired() {
        // 无过期时间信息时视为已过期，需要刷新
        if (!this.expired) {
            return true;
        }

        try {
            const expiryTime = new Date(this.expired).getTime();
            const now = Date.now();
            const threshold = REFRESH_THRESHOLD_SECONDS * 1000;

            return (now + threshold) >= expiryTime;
        } catch (error) {
            return true;
        }
    }

    /**
     * 检查是否需要刷新
     */
    needsRefresh() {
        return this.refresh_token && this.isExpired();
    }

    /**
     * 转换为 JSON 对象
     */
    toJSON() {
        return {
            access_token: this.access_token,
            refresh_token: this.refresh_token,
            token_type: this.token_type,
            scope: this.scope,
            device_id: this.device_id,
            expired: this.expired,
            type: this.type,
            last_refresh: this.last_refresh || new Date().toISOString()
        };
    }

    /**
     * 从 JSON 对象创建
     */
    static fromJSON(json) {
        return new KimiTokenStorage({
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            token_type: json.token_type,
            scope: json.scope,
            device_id: json.device_id,
            expires_at: json.expired ? Math.floor(new Date(json.expired).getTime() / 1000) : 0,
            last_refresh: json.last_refresh
        });
    }
}

/**
 * 启动 Kimi OAuth 设备流认证
 */
export async function startKimiDeviceFlow(config = {}) {
    const client = new KimiOAuthClient(config);

    logger.info('[Kimi OAuth] Starting device flow authentication...');

    // 请求设备码
    const deviceCodeResponse = await client.requestDeviceCode();

    logger.info('[Kimi OAuth] Device code received');
    logger.info('[Kimi OAuth] Please visit:', deviceCodeResponse.verification_uri_complete || deviceCodeResponse.verification_uri);
    logger.info('[Kimi OAuth] User code: [REDACTED]');
    logger.info('[Kimi OAuth] Waiting for authorization...');

    // 轮询获取 Token
    const tokenData = await client.pollForToken(deviceCodeResponse);

    logger.info('[Kimi OAuth] Authorization successful!');

    return new KimiTokenStorage(tokenData);
}

/**
 * 刷新 Kimi Token
 */
export async function refreshKimiToken(tokenStorage, config = {}) {
    if (!tokenStorage.refresh_token) {
        throw new Error('No refresh token available');
    }

    logger.info('[Kimi OAuth] Refreshing token...');

    const client = new KimiOAuthClient({
        ...config,
        deviceId: tokenStorage.device_id
    });

    const newTokenData = await client.refreshToken(tokenStorage.refresh_token);

    logger.info('[Kimi OAuth] Token refreshed successfully');

    return new KimiTokenStorage({
        ...newTokenData,
        device_id: tokenStorage.device_id,
        last_refresh: new Date().toISOString()
    });
}

export default {
    KimiOAuthClient,
    KimiTokenStorage,
    startKimiDeviceFlow,
    refreshKimiToken,
    KIMI_API_BASE_URL
};
