import { OpenAIResponsesApiService } from './openai/openai-responses-core.js';
import { GeminiApiService } from './gemini/gemini-core.js';
import { AntigravityApiService } from './gemini/antigravity-core.js';
import { OpenAIApiService } from './openai/openai-core.js';
import { ClaudeApiService } from './claude/claude-core.js';
import { KiroApiService } from './claude/claude-kiro.js';
import { QwenApiService } from './openai/qwen-core.js';
import { CodexApiService } from './openai/codex-core.js';
import { ForwardApiService } from './forward/forward-core.js';
import { GrokApiService } from './grok/grok-core.js';
import { KimiApiService } from './kimi/kimi-core.js';
import { KimiTokenStorage } from '../auth/kimi-oauth.js';
import { readFileSync, existsSync, promises as fsPromises } from 'fs';
import { resolve } from 'path';
import { MODEL_PROVIDER, findByPrefix, hasByPrefix } from '../utils/common.js';
import logger from '../utils/logger.js';

// 适配器注册表
const adapterRegistry = new Map();

/**
 * 注册服务适配器
 * @param {string} provider - 提供商名称 (来自 MODEL_PROVIDER)
 * @param {typeof ApiServiceAdapter} adapterClass - 适配器类
 */
export function registerAdapter(provider, adapterClass) {
    logger.info(`[Adapter] Registering adapter for provider: ${provider}`);
    adapterRegistry.set(provider, adapterClass);
}

/**
 * 获取所有已注册的提供商
 * @returns {string[]} 已注册的提供商名称列表
 */
export function getRegisteredProviders() {
    return Array.from(adapterRegistry.keys());
}

// 定义AI服务适配器接口
// 所有的服务适配器都应该实现这些方法
export class ApiServiceAdapter {
    constructor() {
        if (new.target === ApiServiceAdapter) {
            throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
        }
    }

    /**
     * 生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {Promise<object>} - API响应
     */
    async generateContent(model, requestBody) {
        throw new Error("Method 'generateContent()' must be implemented.");
    }

    /**
     * 流式生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {AsyncIterable<object>} - API响应流
     */
    async *generateContentStream(model, requestBody) {
        throw new Error("Method 'generateContentStream()' must be implemented.");
    }

    /**
     * 列出可用模型
     * @returns {Promise<object>} - 模型列表
     */
    async listModels() {
        throw new Error("Method 'listModels()' must be implemented.");
    }

    /**
     * 刷新认证令牌
     * @returns {Promise<void>}
     */
    async refreshToken() {
        throw new Error("Method 'refreshToken()' must be implemented.");
    }

    /**
     * 强制刷新认证令牌（不判断是否接近过期）
     * @returns {Promise<void>}
     */
    async forceRefreshToken() {
        throw new Error("Method 'forceRefreshToken()' must be implemented.");
    }

    /**
     * 判断日期是否接近过期
     * @returns {boolean}
     */
    isExpiryDateNear() {
        throw new Error("Method 'isExpiryDateNear()' must be implemented.");
    }
}

// Gemini API 服务适配器
export class GeminiApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.geminiApiService = new GeminiApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.geminiApiService.isInitialized) {
            logger.warn("geminiApiService not initialized, attempting to re-initialize...");
            await this.geminiApiService.initialize();
        }
        return this.geminiApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.geminiApiService.isInitialized) {
            logger.warn("geminiApiService not initialized, attempting to re-initialize...");
            await this.geminiApiService.initialize();
        }
        yield* this.geminiApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        if (!this.geminiApiService.isInitialized) {
            logger.warn("geminiApiService not initialized, attempting to re-initialize...");
            await this.geminiApiService.initialize();
        }
        // Gemini Core API 的 listModels 已经返回符合 Gemini 格式的数据，所以不需要额外转换
        return this.geminiApiService.listModels();
    }

    async refreshToken() {
        if (!this.geminiApiService.isInitialized) {
            await this.geminiApiService.initialize();
        }
        if(this.isExpiryDateNear()===true){
            logger.info(`[Gemini] Expiry date is near, refreshing token...`);
            return this.geminiApiService.initializeAuth(true);
        }
        return Promise.resolve();
    }

    async forceRefreshToken() {
        if (!this.geminiApiService.isInitialized) {
            await this.geminiApiService.initialize();
        }
        logger.info(`[Gemini] Force refreshing token...`);
        return this.geminiApiService.initializeAuth(true);
    }

    isExpiryDateNear() {
        return this.geminiApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.geminiApiService.isInitialized) {
            logger.warn("geminiApiService not initialized, attempting to re-initialize...");
            await this.geminiApiService.initialize();
        }
        return this.geminiApiService.getUsageLimits();
    }
}

// Antigravity API 服务适配器
export class AntigravityApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.antigravityApiService = new AntigravityApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.antigravityApiService.isInitialized) {
            logger.warn("antigravityApiService not initialized, attempting to re-initialize...");
            await this.antigravityApiService.initialize();
        }
        return this.antigravityApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.antigravityApiService.isInitialized) {
            logger.warn("antigravityApiService not initialized, attempting to re-initialize...");
            await this.antigravityApiService.initialize();
        }
        yield* this.antigravityApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        if (!this.antigravityApiService.isInitialized) {
            logger.warn("antigravityApiService not initialized, attempting to re-initialize...");
            await this.antigravityApiService.initialize();
        }
        return this.antigravityApiService.listModels();
    }

    async refreshToken() {
        if (!this.antigravityApiService.isInitialized) {
            await this.antigravityApiService.initialize();
        }
        if (this.isExpiryDateNear() === true) {
            logger.info(`[Antigravity] Expiry date is near, refreshing token...`);
            return this.antigravityApiService.initializeAuth(true);
        }
        return Promise.resolve();
    }

    async forceRefreshToken() {
        if (!this.antigravityApiService.isInitialized) {
            await this.antigravityApiService.initialize();
        }
        logger.info(`[Antigravity] Force refreshing token...`);
        return this.antigravityApiService.initializeAuth(true);
    }

    isExpiryDateNear() {
        return this.antigravityApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.antigravityApiService.isInitialized) {
            logger.warn("antigravityApiService not initialized, attempting to re-initialize...");
            await this.antigravityApiService.initialize();
        }
        return this.antigravityApiService.getUsageLimits();
    }
}

// OpenAI API 服务适配器
export class OpenAIApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIApiService = new OpenAIApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter now expects the requestBody to be in the native OpenAI format.
        // The conversion logic is handled upstream in the server.
        return this.openAIApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter now expects the requestBody to be in the native OpenAI format.
        const stream = this.openAIApiService.generateContentStream(model, requestBody);
        // The stream is yielded directly without conversion.
        yield* stream;
    }

    async listModels() {
        // The adapter now returns the native model list from the underlying service.
        return this.openAIApiService.listModels();
    }

    async refreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    async forceRefreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// OpenAI Responses API 服务适配器
export class OpenAIResponsesApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIResponsesApiService = new OpenAIResponsesApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter expects the requestBody to be in the OpenAI Responses format.
        return this.openAIResponsesApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter expects the requestBody to be in the OpenAI Responses format.
        const stream = this.openAIResponsesApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    async listModels() {
        // The adapter returns the native model list from the underlying service.
        return this.openAIResponsesApiService.listModels();
    }

    async refreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    async forceRefreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Claude API 服务适配器
export class ClaudeApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.claudeApiService = new ClaudeApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter now expects the requestBody to be in the native Claude format.
        return this.claudeApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter now expects the requestBody to be in the native Claude format.
        const stream = this.claudeApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    async listModels() {
        // The adapter now returns the native model list from the underlying service.
        return this.claudeApiService.listModels();
    }

    async refreshToken() {
        return Promise.resolve();
    }

    async forceRefreshToken() {
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Kiro API 服务适配器
export class KiroApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.kiroApiService = new KiroApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter expects the requestBody to be in OpenAI format for Kiro API
        if (!this.kiroApiService.isInitialized) {
            logger.warn("kiroApiService not initialized, attempting to re-initialize...");
            await this.kiroApiService.initialize();
        }
        return this.kiroApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter expects the requestBody to be in OpenAI format for Kiro API
        if (!this.kiroApiService.isInitialized) {
            logger.warn("kiroApiService not initialized, attempting to re-initialize...");
            await this.kiroApiService.initialize();
        }
        const stream = this.kiroApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    async listModels() {
        // Returns the native model list from the Kiro service
        if (!this.kiroApiService.isInitialized) {
            logger.warn("kiroApiService not initialized, attempting to re-initialize...");
            await this.kiroApiService.initialize();
        }
        return this.kiroApiService.listModels();
    }

    async refreshToken() {
        if (!this.kiroApiService.isInitialized) {
            await this.kiroApiService.initialize();
        }
        if(this.isExpiryDateNear()===true){
            logger.info(`[Kiro] Expiry date is near, refreshing token...`);
            return this.kiroApiService.initializeAuth(true);
        }
        return Promise.resolve();
    }

    async forceRefreshToken() {
        if (!this.kiroApiService.isInitialized) {
            await this.kiroApiService.initialize();
        }
        logger.info(`[Kiro] Force refreshing token...`);
        return this.kiroApiService.initializeAuth(true);
    }

    isExpiryDateNear() {
        return this.kiroApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.kiroApiService.isInitialized) {
            logger.warn("kiroApiService not initialized, attempting to re-initialize...");
            await this.kiroApiService.initialize();
        }
        return this.kiroApiService.getUsageLimits();
    }

    /**
     * Count tokens for a message request (compatible with Anthropic API)
     * @param {Object} requestBody - The request body containing model, messages, system, tools, etc.
     * @returns {Object} { input_tokens: number }
     */
    countTokens(requestBody) {
        return this.kiroApiService.countTokens(requestBody);
    }
}

// Qwen API 服务适配器
export class QwenApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.qwenApiService = new QwenApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.qwenApiService.isInitialized) {
            logger.warn("qwenApiService not initialized, attempting to re-initialize...");
            await this.qwenApiService.initialize();
        }
        return this.qwenApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.qwenApiService.isInitialized) {
            logger.warn("qwenApiService not initialized, attempting to re-initialize...");
            await this.qwenApiService.initialize();
        }
        yield* this.qwenApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        if (!this.qwenApiService.isInitialized) {
            logger.warn("qwenApiService not initialized, attempting to re-initialize...");
            await this.qwenApiService.initialize();
        }
        return this.qwenApiService.listModels();
    }

    async refreshToken() {
        if (!this.qwenApiService.isInitialized) {
            await this.qwenApiService.initialize();
        }
        if (this.isExpiryDateNear()) {
            logger.info(`[Qwen] Expiry date is near, refreshing token...`);
            return this.qwenApiService._initializeAuth(true);
        }
        return Promise.resolve();
    }

    async forceRefreshToken() {
        if (!this.qwenApiService.isInitialized) {
            await this.qwenApiService.initialize();
        }
        logger.info(`[Qwen] Force refreshing token...`);
        return this.qwenApiService._initializeAuth(true);
    }

    isExpiryDateNear() {
        return this.qwenApiService.isExpiryDateNear();
    }
}

// Codex API 服务适配器
export class CodexApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.codexApiService = new CodexApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.codexApiService.isInitialized) {
            logger.warn("codexApiService not initialized, attempting to re-initialize...");
            await this.codexApiService.initialize();
        }
        return this.codexApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.codexApiService.isInitialized) {
            logger.warn("codexApiService not initialized, attempting to re-initialize...");
            await this.codexApiService.initialize();
        }
        yield* this.codexApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.codexApiService.listModels();
    }

    async refreshToken() {
        if (!this.codexApiService.isInitialized) {
            await this.codexApiService.initialize();
        }
        if (this.isExpiryDateNear()) {
            logger.info(`[Codex] Expiry date is near, refreshing token...`);
            await this.codexApiService.initializeAuth(true);
        }
    }

    async forceRefreshToken() {
        if (!this.codexApiService.isInitialized) {
            await this.codexApiService.initialize();
        }
        logger.info(`[Codex] Force refreshing token...`);
        return this.codexApiService.initializeAuth(true);
    }

    isExpiryDateNear() {
        return this.codexApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.codexApiService.isInitialized) {
            logger.warn("codexApiService not initialized, attempting to re-initialize...");
            await this.codexApiService.initialize();
        }
        return this.codexApiService.getUsageLimits();
    }
}

// Forward API 服务适配器
export class ForwardApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.forwardApiService = new ForwardApiService(config);
    }

    async generateContent(model, requestBody) {
        return this.forwardApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.forwardApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.forwardApiService.listModels();
    }

    async refreshToken() {
        return Promise.resolve();
    }

    async forceRefreshToken() {
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Grok API 服务适配器
export class GrokApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.grokApiService = new GrokApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        yield* this.grokApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.listModels();
    }

    async refreshToken() {
        return this.grokApiService.refreshToken();
    }

    async forceRefreshToken() {
        return this.grokApiService.refreshToken();
    }

    isExpiryDateNear() {
        return this.grokApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.getUsageLimits();
    }
}

// Kimi API 服务适配器
export class KimiApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.kimiApiService = new KimiApiService(config);
        this.config = config;
        this._tokenLoadingPromise = null; // 用于防止并发加载 token 的锁
    }

    async generateContent(model, requestBody) {
        // 确保 token 已加载（线程安全）
        await this._ensureTokenLoaded();
        return this.kimiApiService.chatCompletion(requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // 确保 token 已加载（线程安全）
        await this._ensureTokenLoaded();
        yield* this.kimiApiService.chatCompletionStream(requestBody);
    }

    async listModels() {
        // 如果 tokenStorage 未加载，尝试从配置中加载
        if (!this.kimiApiService.tokenStorage) {
            logger.info('[Kimi Adapter] Token not loaded, attempting to load from config...');
            try {
                await this._ensureTokenLoaded();
            } catch (error) {
                logger.warn('[Kimi Adapter] Failed to load token, returning hardcoded model list');
            }
        }
        return this.kimiApiService.listModels();
    }

    /**
     * 确保 token 已加载（线程安全）
     * 使用 Promise 锁防止并发重复加载
     * @private
     */
    async _ensureTokenLoaded() {
        // 如果 token 已加载，直接返回
        if (this.kimiApiService.tokenStorage) {
            return;
        }

        // 如果正在加载中，等待加载完成
        if (this._tokenLoadingPromise) {
            return this._tokenLoadingPromise;
        }

        // 开始加载 token
        this._tokenLoadingPromise = this._loadTokenInternal();

        try {
            await this._tokenLoadingPromise;
        } finally {
            this._tokenLoadingPromise = null;
        }
    }

    /**
     * 从配置文件加载 Kimi token（内部方法）
     * @private
     */
    async _loadTokenInternal() {
        const credPath = this.config.KIMI_OAUTH_CREDS_FILE_PATH;
        if (!credPath) {
            throw new Error('No KIMI_OAUTH_CREDS_FILE_PATH configured');
        }

        const configDir = process.cwd();
        const fullPath = resolve(configDir, credPath);

        if (!existsSync(fullPath)) {
            throw new Error(`Kimi credentials file not found: ${fullPath}`);
        }

        let credData;
        try {
            const fileContent = await fsPromises.readFile(fullPath, 'utf-8');
            credData = JSON.parse(fileContent);
        } catch (parseErr) {
            throw new Error(`Invalid JSON in Kimi credentials file: ${parseErr.message}`);
        }
        this.kimiApiService.setTokenStorage(KimiTokenStorage.fromJSON(credData));
        logger.info('[Kimi Adapter] Token loaded successfully');
    }

    async refreshToken() {
        // Kimi 的 token 刷新在 KimiApiService 内部自动处理
        logger.info('[Kimi] Token refresh handled automatically by service');
    }

    async forceRefreshToken() {
        // 强制刷新 token
        if (this.kimiApiService.tokenStorage?.refresh_token) {
            logger.info('[Kimi] Force refreshing token...');
            const { refreshKimiToken } = await import('../auth/kimi-oauth.js');
            this.kimiApiService.tokenStorage = await refreshKimiToken(
                this.kimiApiService.tokenStorage,
                this.config
            );
        }
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return this.kimiApiService.tokenStorage?.needsRefresh() || false;
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        // 确保 token 已加载
        if (!this.kimiApiService.tokenStorage) {
            await this._ensureTokenLoaded();
        }
        return this.kimiApiService.getUsageLimits();
    }
}

// 注册所有内置适配器
registerAdapter(MODEL_PROVIDER.OPENAI_CUSTOM, OpenAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.OPENAI_CUSTOM_RESPONSES, OpenAIResponsesApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CLAUDE_CUSTOM, ClaudeApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.GEMINI_CLI, GeminiApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.ANTIGRAVITY, AntigravityApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.KIRO_API, KiroApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CODEX_API, CodexApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.GROK_CUSTOM, GrokApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.KIMI_API, KimiApiServiceAdapter);
// registerAdapter(MODEL_PROVIDER.FORWARD_API, ForwardApiServiceAdapter);
// registerAdapter(MODEL_PROVIDER.QWEN_API, QwenApiServiceAdapter);
// registerAdapter(MODEL_PROVIDER.IFLOW_API, IFlowApiServiceAdapter);

/**
 * LRU缓存类，用于管理服务适配器实例避免内存泄漏
 * 支持固定大小和 TTL 滑动过期
 */
class LRUCache {
    constructor(maxSize = 50, ttlMs = 0) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs; // 0 表示无 TTL
        this.cache = new Map();
    }

    _isExpired(entry) {
        if (!this.ttlMs) return false;
        return Date.now() - entry.timestamp > this.ttlMs;
    }

    get(key) {
        if (!this.cache.has(key)) {
            return undefined;
        }
        const entry = this.cache.get(key);

        // 检查 TTL 过期
        if (this._isExpired(entry)) {
            this.cache.delete(key);
            return undefined;
        }

        // 移动到末尾（最新使用）并刷新时间戳（滑动过期）- O(1) 操作
        const value = entry.value;
        this.cache.delete(key);
        this.cache.set(key, { value, timestamp: Date.now() });
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 删除最旧的条目
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    has(key) {
        if (!this.cache.has(key)) {
            return false;
        }
        const entry = this.cache.get(key);

        // 检查 TTL 过期
        if (this._isExpired(entry)) {
            this.cache.delete(key);
            return false;
        }

        // 更新访问顺序和时间戳（滑动过期）
        this.cache.delete(key);
        this.cache.set(key, { value: entry.value, timestamp: Date.now() });
        return true;
    }

    /**
     * 删除指定键值（O(1)操作）
     * @param {string} key - 要删除的键
     * @returns {boolean} 是否成功删除
     */
    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }

    /**
     * 清理过期条目
     * 参考 CLIProxyAPI Go signature_cache.go 设计：
     * - 清理过期条目
     * - 当组内无有效条目时删除 bucket（空 Cache Bucket 清理）
     * Go 实现: purgeExpiredCaches() 中检查 isEmpty = len(sc.entries) == 0，然后 Delete(key)
     */
    purgeExpired() {
        if (!this.ttlMs) return;

        const now = Date.now();
        const keysToDelete = [];

        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.ttlMs) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
        }

        // 参考 Go: purgeExpiredCaches() - 当 bucket 为空时删除整个 bucket
        // Go: isEmpty := len(sc.entries) == 0; if isEmpty { signatureCache.Delete(key) }
        // Node.js LRU Cache 是单一 Map 结构，不是分组 Map
        // 空 Cache Bucket 清理不适用于当前设计（固定大小 LRU Cache）
        // 注：如果后续改为分组 Map 架构，此逻辑可启用
    }
}

// 缓存 TTL 常量 - 参考 CLIProxyAPI Go version (signature_cache.go)
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 小时 TTL（与 Go 的 SignatureCacheTTL = 3 * time.Hour 对齐）
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟清理间隔（与 Go 的 CacheCleanupInterval = 10 * time.Minute 一致）

// 用于存储服务适配器单例的LRU缓存（带 TTL）
const serviceInstancesCache = new LRUCache(50, CACHE_TTL_MS);

// 缓存清理定时器
let cacheCleanupTimer = null;

/**
 * 启动缓存自动清理
 */
function startCacheCleanup() {
    if (cacheCleanupTimer) return;

    cacheCleanupTimer = setInterval(() => {
        // 清理主缓存的过期条目
        serviceInstancesCache.purgeExpired();
    }, CACHE_CLEANUP_INTERVAL_MS);

    if (cacheCleanupTimer.unref) {
        cacheCleanupTimer.unref();
    }
}

// 延迟启动清理（首次访问时启动）
setTimeout(startCacheCleanup, 1000).unref();

/**
 * 服务适配器实例的兼容层导出
 * 使用Proxy使其既能像普通对象一样使用，又能与LRU缓存交互
 */
export const serviceInstances = new Proxy({}, {
    get(target, prop) {
        if (prop === 'keys') {
            return () => Array.from(serviceInstancesCache.cache.keys());
        }
        if (typeof prop === 'string') {
            return serviceInstancesCache.get(prop);
        }
        return target[prop];
    },
    set(target, prop, value) {
        if (typeof prop === 'string') {
            serviceInstancesCache.set(prop, value);
            return true;
        }
        target[prop] = value;
        return true;
    },
    deleteProperty(target, prop) {
        // 直接使用 LRU Cache 的 delete 方法（O(1) 操作）
        if (typeof prop === 'string') {
            return serviceInstancesCache.delete(prop);
        }
        return delete target[prop];
    },
    ownKeys(target) {
        return Array.from(serviceInstancesCache.cache.keys());
    },
    getOwnPropertyDescriptor(target, prop) {
        if (serviceInstancesCache.cache.has(prop)) {
            return { enumerable: true, configurable: true, value: serviceInstancesCache.get(prop) };
        }
        return undefined;
    }
});

/**
 * 检查提供商是否已注册（支持前缀匹配）
 * @param {string} provider - 提供商名称
 * @returns {boolean} - 是否有效
 */
export function isRegisteredProvider(provider) {
    return hasByPrefix(adapterRegistry, provider);
}

// 服务适配器工厂
export function getServiceAdapter(config) {
    const customNameDisplay = config.customName ? ` (${config.customName})` : '';
    logger.info(`[Adapter] getServiceAdapter, provider: ${config.MODEL_PROVIDER}, uuid: ${config.uuid}${customNameDisplay}`);
    const provider = config.MODEL_PROVIDER;
    const providerKey = config.uuid ? provider + config.uuid : provider;

    const cachedInstance = serviceInstancesCache.get(providerKey);
    if (cachedInstance) {
        return cachedInstance;
    }

    const AdapterClass = findByPrefix(adapterRegistry, provider);

    if (AdapterClass) {
        const newInstance = new AdapterClass(config);
        serviceInstancesCache.set(providerKey, newInstance);
        return newInstance;
    } else {
        throw new Error(`Unsupported model provider: ${provider}`);
    }
}

