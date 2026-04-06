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
import { KimiTokenStorage, refreshKimiToken } from '../../auth/kimi-oauth.js';
import { normalizeKimiToolMessageLinks } from './kimi-message-normalizer.js';

const KIMI_API_BASE_URL = 'https://api.kimi.com/coding';

// 共享 HTTP agent（避免每个实例创建独立连接池）
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
 * 获取设备模型
 */
function getDeviceModel() {
    return `${os.platform()} ${os.arch()}`;
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
                this.tokenStorage = await refreshKimiToken(this.tokenStorage, this.config);
                logger.info('[Kimi] Token refreshed successfully');
            } catch (error) {
                logger.error('[Kimi] Failed to refresh token:', error.message);
                throw new Error('Failed to refresh Kimi token: ' + error.message);
            }
        }

        return this.tokenStorage.access_token;
    }

    /**
     * 应用 TLS Sidecar
     */
    _applySidecar(axiosConfig) {
        return configureTLSSidecar(axiosConfig, this.config, MODEL_PROVIDER.KIMI, this.baseUrl);
    }

    /**
     * 标准化模型名称（移除 kimi- 前缀）
     */
    normalizeModelName(model) {
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
            'User-Agent': 'KimiCLI/1.10.6',
            'X-Msh-Platform': 'kimi_cli',
            'X-Msh-Version': '1.10.6',
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
     * 调用 Kimi API（非流式）
     */
    async callApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        try {
            // 获取访问令牌
            const accessToken = await this.getAccessToken();

            // 标准化模型名称
            if (body.model) {
                body.model = this.normalizeModelName(body.model);
            }

            // 标准化消息格式
            const normalizedBody = normalizeKimiToolMessageLinks(body);

            const axiosConfig = {
                method: 'post',
                url: endpoint,
                data: normalizedBody,
                headers: this.getKimiHeaders(accessToken, false)
            };

            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const errorCode = error.code;
            const errorMessage = error.message || '';
            const isNetworkError = isRetryableNetworkError(error);

            // 401/403 可能是 token 过期
            if (status === 401 || status === 403) {
                logger.error(`[Kimi API] Received ${status}. Token might be invalid or expired.`);

                // 尝试刷新 token 并重试一次
                if (!isRetry && this.tokenStorage?.refresh_token) {
                    logger.info('[Kimi API] Attempting to refresh token and retry...');
                    try {
                        this.tokenStorage = await refreshKimiToken(this.tokenStorage, this.config);
                        return this.callApi(endpoint, body, true, 0);
                    } catch (refreshError) {
                        logger.error('[Kimi API] Token refresh failed:', refreshError.message);
                    }
                }
                throw error;
            }

            // 429 限流
            if (status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[Kimi API] Rate limited (429). Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            // 5xx 服务器错误
            if (status >= 500 && status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[Kimi API] Server error (${status}). Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            // 网络错误
            if (isNetworkError && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                const errorIdentifier = errorCode || errorMessage.substring(0, 50);
                logger.info(`[Kimi API] Network error (${errorIdentifier}). Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            logger.error(`[Kimi API] Error (Status: ${status}, Code: ${errorCode}):`, errorMessage);
            throw error;
        }
    }

    /**
     * 调用 Kimi API（流式）
     */
    async *streamApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        const streamRequestBody = {
            ...body,
            stream: true,
            stream_options: { include_usage: true }
        };

        // 标准化模型名称
        if (streamRequestBody.model) {
            streamRequestBody.model = this.normalizeModelName(streamRequestBody.model);
        }

        let hasYielded = false;

        try {
            // 获取访问令牌
            const accessToken = await this.getAccessToken();

            const axiosConfig = {
                method: 'post',
                url: endpoint,
                data: streamRequestBody,
                responseType: 'stream',
                headers: this.getKimiHeaders(accessToken, true)
            };

            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);

            const stream = response.data;
            let buffer = '';

            for await (const chunk of stream) {
                buffer += chunk.toString();
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
            const status = error.response?.status;
            const errorCode = error.code;
            const errorMessage = error.message || '';
            const isNetworkError = isRetryableNetworkError(error);

            // 401/403 尝试刷新 token（仅未在流中产出数据时重试，token 刷新也需要 token 未完全过期）
            if ((status === 401 || status === 403) && !isRetry && this.tokenStorage?.refresh_token) {
                logger.info('[Kimi API] Token expired in stream, refreshing and retrying...');
                try {
                    this.tokenStorage = await refreshKimiToken(this.tokenStorage, this.config);
                    yield* this.streamApi(endpoint, body, true, 0);
                    return;
                } catch (refreshError) {
                    logger.error('[Kimi API] Token refresh failed:', refreshError.message);
                }
            }

            // 已产出部分数据后不再重试，避免消费者收到重复/残缺的流
            const canRetry = !hasYielded && retryCount < maxRetries;

            // 429 限流
            if (status === 429 && canRetry) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[Kimi API] Rate limited (429) in stream. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            // 5xx 服务器错误
            if (status >= 500 && status < 600 && canRetry) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[Kimi API] Server error (${status}) in stream. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            // 网络错误
            if (isNetworkError && canRetry) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[Kimi API] Network error in stream. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            logger.error(`[Kimi API] Stream error (Status: ${status}, Code: ${errorCode}):`, errorMessage);
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
        // 返回与参考项目一致的硬编码模型列表
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

            // 如果端点不存在（404）或其他错误，返回基本信息
            logger.warn(`[Kimi] Usage query returned ${status}: ${errorMessage}. Returning basic account info.`);

            // 尝试从 token 中提取基本信息
            const result = {
                raw: error.response?.data || null,
                status,
                error: (status && status !== 404) ? errorMessage : (status === undefined ? errorMessage : null)
            };

            return result;
        }
    }
}

export default KimiApiService;
