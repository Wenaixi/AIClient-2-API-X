/**
 * Kimi (Moonshot AI) API 核心实现
 * 基于 OpenAI 兼容的 API 格式
 */

import axios from 'axios';
import logger from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';
import os from 'os';
import { configureAxiosProxy, configureTLSSidecar } from '../../utils/proxy-utils.js';
import { isRetryableNetworkError, MODEL_PROVIDER } from '../../utils/common.js';
import { KimiTokenStorage, refreshKimiToken, getHostname, getDeviceModel } from '../../auth/kimi-oauth.js';
import { normalizeKimiToolMessageLinks } from './kimi-message-normalizer.js';

const KIMI_API_BASE_URL = 'https://api.kimi.com/coding';

// Kimi 版本常量
const KIMI_VERSION = '1.10.6';
let _sharedHttpAgent = null;
let _sharedHttpsAgent = null;
function getSharedAgents() {
    if (!_sharedHttpAgent) {
        _sharedHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 5, timeout: 120000 });
    }
    if (!_sharedHttpsAgent) {
        _sharedHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 5, timeout: 120000 });
    }
    return { httpAgent: _sharedHttpAgent, httpsAgent: _sharedHttpsAgent };
}

/**
 * 清理共享 HTTP agents
 */
function cleanupSharedAgents() {
    if (_sharedHttpAgent) {
        _sharedHttpAgent.destroy();
        _sharedHttpAgent = null;
    }
    if (_sharedHttpsAgent) {
        _sharedHttpsAgent.destroy();
        _sharedHttpsAgent = null;
    }
}

// 注册进程信号处理，在进程退出时清理共享 agent
process.on('SIGTERM', cleanupSharedAgents);
process.on('SIGINT', cleanupSharedAgents);
process.on('exit', cleanupSharedAgents);

/**
 * 构建请求体（标准化模型名和消息格式）
 */
function buildRequestBody(body, normalizeModelName) {
    const reqBody = { ...body };
    if (reqBody.model) {
        reqBody.model = normalizeModelName(reqBody.model);
    }
    return normalizeKimiToolMessageLinks(reqBody);
}

/**
 * Kimi API 服务类
 */
export class KimiApiService {
    constructor(config) {
        this.config = config;
        this.baseUrl = KIMI_API_BASE_URL;
        this.tokenStorage = null;
        this.useSystemProxy = config?.USE_SYSTEM_PROXY_KIMI ?? false;
        this._refreshPromise = null; // 用于防止并发刷新 token

        logger.info(`[Kimi] System proxy ${this.useSystemProxy ? 'enabled' : 'disabled'}`);

        // 配置 HTTP/HTTPS agent（使用共享 agent 避免重复创建连接池）
        const { httpAgent, httpsAgent } = getSharedAgents();

        const axiosConfig = {
            baseURL: this.baseUrl,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
        };

        if (!this.useSystemProxy) {
            axiosConfig.proxy = false;
        }

        configureAxiosProxy(axiosConfig, config, MODEL_PROVIDER.KIMI);

        this.axiosInstance = axios.create(axiosConfig);
    }

    /**
     * 设置认证 Token
     */
    setTokenStorage(tokenStorage) {
        if (tokenStorage instanceof KimiTokenStorage) {
            this.tokenStorage = tokenStorage;
        } else if (typeof tokenStorage === 'object') {
            this.tokenStorage = KimiTokenStorage.fromJSON(tokenStorage);
        } else {
            throw new Error('Invalid token storage format');
        }
    }

    /**
     * 获取访问令牌
     */
    async getAccessToken() {
        if (!this.tokenStorage) {
            throw new Error('No token storage configured');
        }

        // 检查是否需要刷新
        if (this.tokenStorage.needsRefresh()) {
            logger.info('[Kimi] Token expired, refreshing...');
            try {
                await this._refreshTokenSafe();
                logger.info('[Kimi] Token refreshed successfully');
            } catch (error) {
                logger.error('[Kimi] Failed to refresh token:', error.message);
                throw new Error('Failed to refresh Kimi token: ' + error.message);
            }
        }

        if (!this.tokenStorage.access_token) {
            throw new Error('Kimi token refresh response missing access_token field');
        }

        return this.tokenStorage.access_token;
    }

    /**
     * 线程安全的 token 刷新（防止并发刷新）
     * @returns {Promise<void>}
     */
    async _refreshTokenSafe() {
        if (this._refreshPromise) {
            return this._refreshPromise;
        }
        if (!this.tokenStorage?.refresh_token) {
            throw new Error('No refresh token available');
        }
        this._refreshPromise = refreshKimiToken(this.tokenStorage, this.config)
            .then(newStorage => {
                this.tokenStorage = newStorage;
            })
            .finally(() => {
                this._refreshPromise = null;
            });
        return this._refreshPromise;
    }

    /**
     * 应用 TLS Sidecar
     */
    _applySidecar(axiosConfig) {
        return configureTLSSidecar(axiosConfig, this.config, MODEL_PROVIDER.KIMI, this.baseUrl);
    }

    /**
     * 标准化模型名称
     *
     * 注意：Kimi API 内部使用统一的端点处理 thinking 和非 thinking 模型，
     * thinking 模式通过请求参数（如 temperature 等）控制，而非模型名称。
     * 因此 kimi-k2.5-thinking 和 kimi-k2.5 都映射到 k2.5。
     *
     * 映射规则：
     * - kimi-k2.5-thinking -> k2.5 (thinking 模型映射到基础模型)
     * - kimi-k2.5 -> k2.5
     * - kimi-k2-thinking -> k2-thinking
     * - 其他以 kimi- 开头 -> 移除前缀
     *
     * @param {string} model - 原始模型名称
     * @returns {string} 标准化后的模型名称
     */
    normalizeModelName(model) {
        // thinking 模型映射到基础模型，因为 Kimi API 使用相同端点
        if (model === 'kimi-k2.5-thinking') {
            return 'k2.5';
        }
        if (model && model.startsWith('kimi-')) {
            return model.substring(5);
        }
        return model;
    }

    /**
     * 获取 Kimi API 请求头（匹配参考项目的 CLI Proxy API）
     */
    getKimiHeaders(accessToken, stream = false) {
        // 优先从 tokenStorage 获取 device_id
        const deviceId = this.tokenStorage?.device_id || 'cli-proxy-api-device';

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            // 与 kimi-cli 客户端完全一致
            'User-Agent': `KimiCLI/${KIMI_VERSION}`,
            'X-Msh-Platform': 'kimi_cli',
            'X-Msh-Version': KIMI_VERSION,
            'X-Msh-Device-Name': getHostname(),
            'X-Msh-Device-Model': getDeviceModel(),
            'X-Msh-Device-Id': deviceId
        };

        if (stream) {
            headers['Accept'] = 'text/event-stream';
        } else {
            headers['Accept'] = 'application/json';
        }

        return headers;
    }

    /**
     * 通用请求执行方法
     * @param {string} endpoint - API 端点
     * @param {Object} body - 请求体
     * @param {Object} options - 选项 { stream, isRetry, retryCount }
     * @returns {Promise|AsyncGenerator} 响应数据
     */
    async _executeRequest(endpoint, body, options = {}) {
        const { stream = false, isRetry = false, retryCount = 0 } = options;
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        // 获取访问令牌
        const accessToken = await this.getAccessToken();

        // 构建请求体
        const requestBody = stream
            ? { ...body, stream: true, stream_options: { include_usage: true } }
            : body;
        const normalizedBody = buildRequestBody(requestBody, this.normalizeModelName.bind(this));

        // 构建 axios 配置
        const axiosConfig = {
            method: 'post',
            url: endpoint,
            data: normalizedBody,
            headers: this.getKimiHeaders(accessToken, stream)
        };

        if (stream) {
            axiosConfig.responseType = 'stream';
        }

        this._applySidecar(axiosConfig);
        const response = await this.axiosInstance.request(axiosConfig);
        return response;
    }

    /**
     * 统一重试处理
     * @param {Object} error - 错误对象
     * @param {Object} config - { endpoint, body, options }
     * @returns {boolean} 是否需要调用者重新发起请求
     */
    async _handleErrorRetry(error, config) {
        const { endpoint, body, options } = config;
        const { stream = false, isRetry = false, retryCount = 0 } = options;
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        const status = error.response?.status;
        const errorCode = error.code;
        const errorMessage = error.message || '';
        const isNetworkError = isRetryableNetworkError(error);

        // 401/403 尝试刷新 token
        if ((status === 401 || status === 403) && !isRetry && this.tokenStorage?.refresh_token) {
            logger.info('[Kimi API] Token expired, refreshing and retrying...');
            try {
                await this._refreshTokenSafe();
                return true; // 调用者重试
            } catch (refreshError) {
                logger.error('[Kimi API] Token refresh failed:', refreshError.message);
                return false;
            }
        }

        // 流式请求已产出数据后不再重试
        if (stream && options.hasYielded) {
            return false;
        }

        const canRetry = retryCount < maxRetries;

        const retryReasons = {
            429: `Rate limited (429)`,
            500: `Server error (500)`,
            network: `Network error (${errorCode || errorMessage.substring(0, 50)})`
        };

        let reason = null;
        if (status === 429 && canRetry) {
            reason = retryReasons[429];
        } else if (status >= 500 && status < 600 && canRetry) {
            reason = retryReasons[500];
        } else if (isNetworkError && canRetry) {
            reason = retryReasons.network;
        }

        if (reason) {
            const delay = baseDelay * Math.pow(2, retryCount);
            const suffix = stream ? ' in stream' : '';
            logger.info(`[Kimi API] ${reason}${suffix}. Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return true;
        }

        const prefix = stream ? 'Stream error' : 'Error';
        logger.error(`[Kimi API] ${prefix} (Status: ${status}, Code: ${errorCode}):`, errorMessage);
        return false;
    }

    /**
     * 调用 Kimi API（非流式）
     */
    async callApi(endpoint, body, isRetry = false, retryCount = 0) {
        try {
            const response = await this._executeRequest(endpoint, body, { isRetry, retryCount });
            return response.data;
        } catch (error) {
            const shouldRetry = await this._handleErrorRetry(error, {
                endpoint,
                body,
                options: { isRetry, retryCount }
            });
            if (shouldRetry) {
                return this.callApi(endpoint, body, true, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * 调用 Kimi API（流式）
     */
    async *streamApi(endpoint, body, isRetry = false, retryCount = 0) {
        let hasYielded = false;

        try {
            const response = await this._executeRequest(endpoint, body, {
                stream: true,
                isRetry,
                retryCount
            });

            const stream = response.data;
            let buffer = '';
            const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB limit

            for await (const chunk of stream) {
                buffer += chunk.toString();
                if (buffer.length > MAX_BUFFER_SIZE) {
                    throw new Error('SSE buffer exceeded maximum size limit of 10MB');
                }
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.startsWith('data: ')) {
                        const jsonData = line.substring(6).trim();
                        if (jsonData === '[DONE]') {
                            return;
                        }
                        try {
                            const parsedChunk = JSON.parse(jsonData);
                            hasYielded = true;
                            yield parsedChunk;
                        } catch (parseError) {
                            logger.warn('[Kimi API] Failed to parse SSE chunk:', parseError.message);
                        }
                    }
                }
            }
        } catch (error) {
            const shouldRetry = await this._handleErrorRetry(error, {
                endpoint,
                body,
                options: { stream: true, isRetry, retryCount, hasYielded }
            });
            if (shouldRetry) {
                yield* this.streamApi(endpoint, body, true, retryCount + 1);
                return;
            }
            throw error;
        }
    }

    /**
     * 聊天补全（非流式）
     */
    async chatCompletion(body) {
        return this.callApi('/v1/chat/completions', body);
    }

    /**
     * 聊天补全（流式）
     */
    async *chatCompletionStream(body) {
        yield* this.streamApi('/v1/chat/completions', body);
    }

    /**
     * 获取模型列表
     * 与参考项目一致，返回硬编码的模型列表（不调用 Kimi API）
     */
    async listModels() {
        return {
            object: "list",
            data: [
                {
                    id: "kimi-k2",
                    object: "model",
                    created: 1700000000,
                    owned_by: "kimi",
                    permission: [],
                    root: "kimi-k2",
                    parent: null
                },
                {
                    id: "kimi-k2-thinking",
                    object: "model",
                    created: 1700000000,
                    owned_by: "kimi",
                    permission: [],
                    root: "kimi-k2-thinking",
                    parent: null
                },
                {
                    id: "kimi-k2.5",
                    object: "model",
                    created: 1700000000,
                    owned_by: "kimi",
                    permission: [],
                    root: "kimi-k2.5",
                    parent: null
                }
            ]
        };
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        const accessToken = await this.getAccessToken();

        try {
            const axiosConfig = {
                method: 'get',
                url: '/v1/user/me',
                headers: this.getKimiHeaders(accessToken, false)
            };

            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);
            logger.info('[Kimi] Usage limits fetched successfully');
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const errorMessage = error.message || '';

            // 404 端点不存在，返回基本信息
            if (status === 404) {
                logger.warn(`[Kimi] Usage endpoint not found (404). Returning basic account info.`);
                return {
                    raw: error.response?.data || null,
                    status,
                    error: null
                };
            }

            // 其他错误，记录并返回错误信息
            logger.warn(`[Kimi] Usage query returned ${status}: ${errorMessage}. Returning basic account info.`);
            return {
                raw: error.response?.data || null,
                status,
                error: errorMessage
            };
        }
    }
}

export default KimiApiService;
