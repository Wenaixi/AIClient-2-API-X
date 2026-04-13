import * as fs from 'fs';
import { getServiceAdapter, getRegisteredProviders } from './adapter.js';
import logger from '../utils/logger.js';
import { MODEL_PROVIDER, getProtocolPrefix } from '../utils/common.js';
import { convertData } from '../convert/convert.js';
import {
    getConfiguredSupportedModels,
    getProviderModels,
    normalizeModelIds
} from './provider-models.js';
import { broadcastEvent } from '../ui-modules/event-broadcast.js';
import { ENDPOINT_TYPE } from '../utils/common.js';

/**
 * Manages a pool of API service providers, handling their health and selection.
 */
export class ProviderPoolManager {
    // 默认健康检查模型配置
    // 键名必须与 MODEL_PROVIDER 常量值一致
    static DEFAULT_HEALTH_CHECK_MODELS = {
        'gemini-cli-oauth': 'gemini-2.5-flash',
        'gemini-antigravity': 'gemini-2.5-flash',
        'openai-custom': 'gpt-4o-mini',
        'claude-custom': 'claude-3-7-sonnet-20250219',
        'claude-kiro-oauth': 'claude-haiku-4-5',
        'openai-qwen-oauth': 'qwen3-coder-flash',
        'openai-codex-oauth': 'gpt-5-codex-mini',
        'openaiResponses-custom': 'gpt-4o-mini',
        'forward-api': 'gpt-4o-mini',
        'kimi-oauth': 'kimi-k2.5-thinking',
    };

    // per-provider 刷新提前期配置（毫秒）
    // 用于在 token 过期前提前触发刷新
    static REFRESH_LEAD_CONFIG = {
        'gemini-cli-oauth': 20 * 60 * 1000,      // 20 分钟
        'gemini-antigravity': 20 * 60 * 1000,    // 20 分钟
        'claude-kiro-oauth': 30 * 60 * 1000,     // 30 分钟
        'openai-qwen-oauth': 30 * 1000,          // 30 秒
        'openai-codex-oauth': 5 * 60 * 1000,    // 5 分钟
        'kimi-oauth': 5 * 60 * 1000,             // 5 分钟
        'grok-custom': 10 * 60 * 1000,           // 10 分钟
        'default': 10 * 60 * 1000                 // 默认 10 分钟
    };

    /**
     * 获取指定 provider 的刷新提前期
     * @param {string} providerType - 提供商类型
     * @returns {number} 刷新提前期（毫秒）
     */
    static getRefreshLead(providerType) {
        return ProviderPoolManager.REFRESH_LEAD_CONFIG[providerType]
            ?? ProviderPoolManager.REFRESH_LEAD_CONFIG['default'];
    }

    constructor(providerPools, options = {}) {
        this.providerPools = providerPools;
        this.globalConfig = options.globalConfig || {}; // 存储全局配置
        this.providerStatus = {}; // Tracks health and usage for each provider instance
        this.roundRobinIndex = {}; // Tracks the current index for round-robin selection for each provider type
        // 使用 ?? 运算符确保 0 也能被正确设置，而不是被 || 替换为默认值
        this.maxErrorCount = options.maxErrorCount ?? 10; // Default to 10 errors before marking unhealthy
        this.healthCheckInterval = options.healthCheckInterval ?? 10 * 60 * 1000; // Default to 10 minutes

            // 日志级别控制
        this.logLevel = options.logLevel || 'info'; // 'debug', 'info', 'warn', 'error'
        
        // 添加防抖机制，避免频繁的文件 I/O 操作
        this.saveDebounceTime = options.saveDebounceTime || 1000; // 默认1秒防抖
        this.saveTimer = null;
        this.pendingSaves = new Set(); // 记录待保存的 providerType
        
        // Fallback 链配置
        this.fallbackChain = options.globalConfig?.providerFallbackChain || {};
        
        // Model Fallback 映射配置
        this.modelFallbackMapping = options.globalConfig?.modelFallbackMapping || {};

        // 并发控制：每个 providerType 的选择锁
        // 用于确保 selectProvider 的排序 and 更新操作是原子的
        this._selectionLocks = {};
        this._isSelecting = {}; // 同步标志位锁

        // 验证配置并应用默认值（需要在使用配置字段之前调用）
        this.validateConfig();

        // --- 刷新信号量配置 ---
        // 替代 activeProviderRefreshes + globalRefreshWaiters 的信号量模式
        this.refreshSemaphore = {
            global: this.globalConfig.REFRESH_SEMAPHORE_GLOBAL ?? 16,        // 全局最多 16 并发刷新
            perProvider: this.globalConfig.REFRESH_SEMAPHORE_PER_PROVIDER ?? 4,  // 每 provider 最多 4 并发
            globalUsed: 0,
            perProviderUsed: {},  // { providerType: count }
            globalWaitQueue: [],  // Promise resolve 队列
            perProviderWaitQueues: {}  // { providerType: [resolve] }
        };

        // 统一使用 refreshSemaphore.perProvider 保持向后兼容
        this.refreshConcurrency = this.refreshSemaphore;

        this.warmupTarget = options.globalConfig?.WARMUP_TARGET || 0; // 默认预热0个节点
        this.refreshingUuids = new Set(); // 正在刷新的节点 UUID 集合
        
        this.refreshQueues = {}; // 按 providerType 分组的队列
        // 缓冲队列机制：延迟5秒，去重后再执行刷新
        this.refreshBufferQueues = {}; // 按 providerType 分组的缓冲队列
        this.refreshBufferTimers = {}; // 按 providerType 分组的定时器
        this.bufferDelay = options.globalConfig?.REFRESH_BUFFER_DELAY ?? 5000; // 默认5秒缓冲延迟
        this.refreshTaskTimeoutMs = options.globalConfig?.REFRESH_TASK_TIMEOUT_MS ?? 60000; // 默认60秒刷新超时
        this.maxSemaphoreWaitTime = this.globalConfig.MAX_SEMAPHORE_WAIT_TIME ?? 60000; // 默认60秒信号量等待超时

        // --- 429 指数退避配置 ---
        this.quotaBackoff = {
            base: this.globalConfig.QUOTA_BACKOFF_BASE ?? 1000,           // 基础延迟 1s
            max: this.globalConfig.QUOTA_BACKOFF_MAX ?? 1800000,          // 最大 30min
            maxRetries: this.globalConfig.QUOTA_BACKOFF_MAX_RETRIES ?? 3, // 默认3次重试
            quotaResetTimes: {}  // 存储每个 provider 的 quota 重置时间
        };

        // --- 冷却队列配置 ---
        this.cooldownQueue = {
            enabled: this.globalConfig.COOLDOWN_QUEUE_ENABLED ?? true,
            defaultCooldown: this.globalConfig.COOLDOWN_DEFAULT ?? 60000,  // 默认 60s
            maxCooldown: this.globalConfig.COOLDOWN_MAX ?? 300000,          // 最大 5min
            queues: {}  // per-type 冷却队列: { providerType: { uuid: expireAt } }
        };

        // 用于并发选点时的原子排序辅助（自增序列）
        this._selectionSequence = 0;

        // 验证配置并应用默认值
        this.validateConfig();
        this.initializeProviderStatus();
    }

    /**
     * 验证配置参数，确保数值在合理范围内
     * 验证失败时记录警告并使用默认值
     */
    validateConfig() {
        const defaults = {
            REFRESH_SEMAPHORE_GLOBAL: 16,
            REFRESH_SEMAPHORE_PER_PROVIDER: 4,
            QUOTA_BACKOFF_BASE: 1000,
            QUOTA_BACKOFF_MAX: 1800000,
            COOLDOWN_DEFAULT: 60000,
            MAX_SEMAPHORE_WAIT_TIME: 60000
        };

        const cfg = this.globalConfig;

        // REFRESH_SEMAPHORE_GLOBAL: 应为正整数
        if (cfg.REFRESH_SEMAPHORE_GLOBAL !== undefined) {
            if (!Number.isInteger(cfg.REFRESH_SEMAPHORE_GLOBAL) || cfg.REFRESH_SEMAPHORE_GLOBAL <= 0) {
                this._log('warn', `Invalid REFRESH_SEMAPHORE_GLOBAL: ${cfg.REFRESH_SEMAPHORE_GLOBAL}, using default: ${defaults.REFRESH_SEMAPHORE_GLOBAL}`);
                cfg.REFRESH_SEMAPHORE_GLOBAL = defaults.REFRESH_SEMAPHORE_GLOBAL;
            }
        }

        // REFRESH_SEMAPHORE_PER_PROVIDER: 应为正整数
        if (cfg.REFRESH_SEMAPHORE_PER_PROVIDER !== undefined) {
            if (!Number.isInteger(cfg.REFRESH_SEMAPHORE_PER_PROVIDER) || cfg.REFRESH_SEMAPHORE_PER_PROVIDER <= 0) {
                this._log('warn', `Invalid REFRESH_SEMAPHORE_PER_PROVIDER: ${cfg.REFRESH_SEMAPHORE_PER_PROVIDER}, using default: ${defaults.REFRESH_SEMAPHORE_PER_PROVIDER}`);
                cfg.REFRESH_SEMAPHORE_PER_PROVIDER = defaults.REFRESH_SEMAPHORE_PER_PROVIDER;
            }
        }

        // QUOTA_BACKOFF_BASE: 应为正数
        if (cfg.QUOTA_BACKOFF_BASE !== undefined) {
            if (typeof cfg.QUOTA_BACKOFF_BASE !== 'number' || cfg.QUOTA_BACKOFF_BASE <= 0) {
                this._log('warn', `Invalid QUOTA_BACKOFF_BASE: ${cfg.QUOTA_BACKOFF_BASE}, using default: ${defaults.QUOTA_BACKOFF_BASE}`);
                cfg.QUOTA_BACKOFF_BASE = defaults.QUOTA_BACKOFF_BASE;
            }
        }

        // QUOTA_BACKOFF_MAX: 应为正数且大于 BASE
        if (cfg.QUOTA_BACKOFF_MAX !== undefined) {
            const base = cfg.QUOTA_BACKOFF_BASE ?? defaults.QUOTA_BACKOFF_BASE;
            if (typeof cfg.QUOTA_BACKOFF_MAX !== 'number' || cfg.QUOTA_BACKOFF_MAX <= 0 || cfg.QUOTA_BACKOFF_MAX <= base) {
                this._log('warn', `Invalid QUOTA_BACKOFF_MAX: ${cfg.QUOTA_BACKOFF_MAX}, must be positive and > BASE (${base}), using default: ${defaults.QUOTA_BACKOFF_MAX}`);
                cfg.QUOTA_BACKOFF_MAX = defaults.QUOTA_BACKOFF_MAX;
            }
        }

        // COOLDOWN_DEFAULT: 应为正数
        if (cfg.COOLDOWN_DEFAULT !== undefined) {
            if (typeof cfg.COOLDOWN_DEFAULT !== 'number' || cfg.COOLDOWN_DEFAULT <= 0) {
                this._log('warn', `Invalid COOLDOWN_DEFAULT: ${cfg.COOLDOWN_DEFAULT}, using default: ${defaults.COOLDOWN_DEFAULT}`);
                cfg.COOLDOWN_DEFAULT = defaults.COOLDOWN_DEFAULT;
            }
        }

        // MAX_SEMAPHORE_WAIT_TIME: 应为正数
        if (cfg.MAX_SEMAPHORE_WAIT_TIME !== undefined) {
            if (typeof cfg.MAX_SEMAPHORE_WAIT_TIME !== 'number' || cfg.MAX_SEMAPHORE_WAIT_TIME <= 0) {
                this._log('warn', `Invalid MAX_SEMAPHORE_WAIT_TIME: ${cfg.MAX_SEMAPHORE_WAIT_TIME}, using default: ${defaults.MAX_SEMAPHORE_WAIT_TIME}`);
                cfg.MAX_SEMAPHORE_WAIT_TIME = defaults.MAX_SEMAPHORE_WAIT_TIME;
            }
        }
    }

    /**
     * 检查所有节点的配置文件，如果发现即将过期则触发刷新
     */
    async checkAndRefreshExpiringNodes() {
        this._log('info', 'Checking nodes for approaching expiration dates using provider adapters...');
        
        for (const providerType in this.providerStatus) {
            const providers = this.providerStatus[providerType];
            for (const providerStatus of providers) {
                const config = providerStatus.config;
                
                // 根据 providerType 确定配置文件路径字段名
                let configPath = null;
                if (providerType.startsWith('claude-kiro')) {
                    configPath = config.KIRO_OAUTH_CREDS_FILE_PATH;
                } else if (providerType.startsWith('gemini-cli')) {
                    configPath = config.GEMINI_OAUTH_CREDS_FILE_PATH;
                } else if (providerType.startsWith('gemini-antigravity')) {
                    configPath = config.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH;
                } else if (providerType.startsWith('openai-qwen')) {
                    configPath = config.QWEN_OAUTH_CREDS_FILE_PATH;
                } else if (providerType.startsWith('openai-codex')) {
                    configPath = config.CODEX_OAUTH_CREDS_FILE_PATH;
                }
                
                // logger.info(`Checking node ${providerStatus.uuid} (${providerType}) expiry date... configPath: ${configPath}`);
                // 排除不健康和禁用的节点
                if (!config.isHealthy || config.isDisabled) continue;

                if (configPath && fs.existsSync(configPath)) {
                    try {
                        const fileContent = fs.readFileSync(configPath, 'utf-8');
                        const credData = JSON.parse(fileContent);
                        const expiryTime = credData.expiry_date || credData.expiry || credData.expires_at;
                        // 使用 per-provider 的刷新提前期
                        const nearExpiryMs = ProviderPoolManager.getRefreshLead(providerType);
                        if (!expiryTime) {
                            // 凭据文件缺少 expiry 字段，无法判断是否快过期，作为安全措施强制刷新
                            this._log('warn', `Node ${providerStatus.uuid} (${providerType}) has no expiry field. Forcing refresh as safety measure...`);
                            this._enqueueRefresh(providerType, providerStatus);
                        } else {
                            // 先规范化再比较
                            let normalizedExpiry = expiryTime;
                            // 检测是否是字符串类型，如果是则解析为 Date
                            if (typeof expiryTime === 'string') {
                                const date = new Date(expiryTime);
                                if (!isNaN(date.getTime())) {
                                    normalizedExpiry = date.getTime();
                                } else {
                                    this._log('warn', `Node ${providerStatus.uuid} (${providerType}) has invalid expiry string. Forcing refresh...`);
                                    this._enqueueRefresh(providerType, providerStatus);
                                    continue;
                                }
                            } else if (expiryTime < 1e12) {
                                // 如果是数字但单位是秒，转换为毫秒
                                normalizedExpiry = expiryTime * 1000;
                            }
                            if ((normalizedExpiry - Date.now()) < nearExpiryMs) {
                                this._log('warn', `Node ${providerStatus.uuid} (${providerType}) is near expiration. Enqueuing refresh...`);
                                this._enqueueRefresh(providerType, providerStatus);
                            }
                        }
                    } catch (err) {
                        this._log('error', `Failed to check expiry for node ${providerStatus.uuid}: ${err.message}`);
                    }
                } else {
                    this._log('debug', `Node ${providerStatus.uuid} (${providerType}) has no valid config file path or file does not exist.`);
                }
            }
        }
    }

    /**
     * 系统预热逻辑：按提供商分组，每组预热 warmupTarget 个节点
     * @returns {Promise<void>}
     */
    async warmupNodes() {
        if (this.warmupTarget <= 0) return;
        this._log('info', `Starting system warmup (Group Target: ${this.warmupTarget} nodes per provider)...`);

        const nodesToWarmup = [];

        for (const type in this.providerStatus) {
            const pool = this.providerStatus[type];
            
            // 挑选当前提供商下需要预热的节点
            const candidates = pool
                .filter(p => p.config.isHealthy && !p.config.isDisabled && !this.refreshingUuids.has(p.uuid))
                .sort((a, b) => {
                    // 优先级 A: 明确标记需要刷新的
                    if (a.config.needsRefresh && !b.config.needsRefresh) return -1;
                    if (!a.config.needsRefresh && b.config.needsRefresh) return 1;

                    // 优先级 B: 按照正常的选择权重排序（最久没用过的优先补）
                    const scoreA = this._calculateNodeScore(a);
                    const scoreB = this._calculateNodeScore(b);
                    return scoreA - scoreB;
                })
                .slice(0, this.warmupTarget);

            candidates.forEach(p => nodesToWarmup.push({ type, status: p }));
        }

        this._log('info', `Warmup: Selected total ${nodesToWarmup.length} nodes across all providers to refresh.`);

        for (const node of nodesToWarmup) {
            this._enqueueRefresh(node.type, node.status, true);
        }

        // 注意：warmupNodes 不等待队列结束，它是异步后台执行的
    }

    /**
     * 将节点放入缓冲队列，延迟5秒后去重并执行刷新
     * @param {string} providerType 
     * @param {object} providerStatus 
     * @param {boolean} force - 是否强制刷新（跳过缓冲队列）
     * @private
     */
    _enqueueRefresh(providerType, providerStatus, force = false) {
        const uuid = providerStatus.uuid;
        
        // 如果节点被禁用，不进行刷新
        if (providerStatus.config.isDisabled) {
            this._log('debug', `Skipping refresh for disabled node ${uuid}`);
            return;
        }
        
        // 如果已经在刷新中，直接返回
        if (this.refreshingUuids.has(uuid)) {
            this._log('debug', `Node ${uuid} is already in refresh queue.`);
            return;
        }

        // 判断提供商池内的总可用节点数，小于5个时，不等待缓冲，直接加入刷新队列
        const healthyCount = this.getHealthyCount(providerType);
        if (healthyCount < 5) {
            this._log('info', `Provider ${providerType} has only ${healthyCount} healthy nodes. Bypassing buffer and enqueuing refresh for ${uuid} immediately.`);
            this._enqueueRefreshImmediate(providerType, providerStatus, force);
            return;
        }

        // 初始化缓冲队列
        if (!this.refreshBufferQueues[providerType]) {
            this.refreshBufferQueues[providerType] = new Map(); // 使用 Map 自动去重
        }

        const bufferQueue = this.refreshBufferQueues[providerType];
        
        // 检查是否已在缓冲队列中
        const existing = bufferQueue.get(uuid);
        const isNewEntry = !existing;
        
        // 更新或添加节点（保留 force: true 状态）
        bufferQueue.set(uuid, {
            providerStatus,
            force: existing ? (existing.force || force) : force
        });
        
        if (isNewEntry) {
            this._log('debug', `Node ${uuid} added to buffer queue for ${providerType}. Buffer size: ${bufferQueue.size}`);
        } else {
            this._log('debug', `Node ${uuid} already in buffer queue, updated force flag. Buffer size: ${bufferQueue.size}`);
        }

        // 只在新增节点或缓冲队列为空时重置定时器
        // 避免频繁重置导致刷新被无限延迟
        if (isNewEntry || !this.refreshBufferTimers[providerType]) {
            // 清除之前的定时器
            if (this.refreshBufferTimers[providerType]) {
                clearTimeout(this.refreshBufferTimers[providerType]);
            }

            // 设置新的定时器，延迟5秒后处理缓冲队列
            this.refreshBufferTimers[providerType] = setTimeout(() => {
                this._flushRefreshBuffer(providerType);
            }, this.bufferDelay);
            // 防止定时器阻止进程退出
            if (this.refreshBufferTimers[providerType].unref) {
                this.refreshBufferTimers[providerType].unref();
            }
        }
    }

    /**
     * 处理缓冲队列，将去重后的节点放入实际刷新队列
     * @param {string} providerType 
     * @private
     */
    _flushRefreshBuffer(providerType) {
        const bufferQueue = this.refreshBufferQueues[providerType];
        if (!bufferQueue || bufferQueue.size === 0) {
            return;
        }

        this._log('info', `Flushing refresh buffer for ${providerType}. Processing ${bufferQueue.size} unique nodes.`);

        // 将缓冲队列中的所有节点放入实际刷新队列
        for (const [uuid, { providerStatus, force }] of bufferQueue.entries()) {
            try {
                this._enqueueRefreshImmediate(providerType, providerStatus, force);
            } catch (error) {
                this._log('error', `Failed to enqueue refresh for node ${uuid}: ${error.message}`);
                // 继续处理其他节点，不中断循环
            }
        }

        // 清空缓冲队列
        bufferQueue.clear();
        // 清理定时器引用
        delete this.refreshBufferTimers[providerType];
        delete this.refreshBufferQueues[providerType];
    }

    /**
     * 立即将节点放入刷新队列（内部方法，由缓冲队列调用）
     * 带全局信号量控制并发刷新数量
     * @param {string} providerType
     * @param {object} providerStatus
     * @param {boolean} force
     * @private
     */
    async _enqueueRefreshImmediate(providerType, providerStatus, force = false) {
        const uuid = providerStatus.uuid;

        // 原子操作：检查并添加，防止竞态条件
        // 使用同步方式在微任务中原子地完成检查和添加
        if (this.refreshingUuids.has(uuid)) {
            this._log('debug', `Node ${uuid} is already in refresh queue (immediate check).`);
            return false;
        }

        // 微任务中完成添加和后续逻辑，确保检查-添加-执行链原子性
        const shouldExecute = await Promise.resolve().then(() => {
            // 再次检查（微任务中可能已有其他调用者添加了同一 uuid）
            if (this.refreshingUuids.has(uuid)) {
                this._log('debug', `Node ${uuid} race condition detected in refresh queue.`);
                return false;
            }
            this.refreshingUuids.add(uuid);
            return true;
        });

        if (!shouldExecute) return false;

        // 继续执行刷新逻辑
        this._executeRefreshTask(providerType, providerStatus, force, uuid);
        return true;
    }

    /**
     * 执行实际刷新任务（从 _enqueueRefreshImmediate 分离出来）
     * @private
     */
    _executeRefreshTask(providerType, providerStatus, force, uuid) {
        // 初始化提供商队列
        if (!this.refreshQueues[providerType]) {
            this.refreshQueues[providerType] = {
                activeCount: 0,
                waitingTasks: []
            };
        }

        const queue = this.refreshQueues[providerType];
        // 记录此任务是否持有全局槽位（只有启动空队列的任务才持有）
        let ownsGlobalSlot = false;

        const runTask = async () => {
            try {
                await this._refreshNodeToken(providerType, providerStatus, force);
            } catch (err) {
                this._log('error', `Failed to process refresh for node ${uuid}: ${err.message}`);
            } finally {
                this.refreshingUuids.delete(uuid);

                // 再次获取当前队列引用
                const currentQueue = this.refreshQueues[providerType];
                if (!currentQueue) return;

                currentQueue.activeCount--;

                // 1. 尝试从当前提供商队列中取下一个任务
                if (currentQueue.waitingTasks.length > 0) {
                    const nextTask = currentQueue.waitingTasks.shift();
                    currentQueue.activeCount++;
                    // 使用 Promise.resolve().then 避免过深的递归
                    Promise.resolve().then(nextTask);
                } else if (currentQueue.activeCount === 0) {
                    // 只有持有全局槽位的任务才能释放信号量（先于队列删除）
                    if (ownsGlobalSlot) {
                        this._releaseGlobalSemaphore();
                    }

                    // 清理空队列
                    if (currentQueue.waitingTasks.length === 0 &&
                        this.refreshQueues[providerType] === currentQueue) {
                        delete this.refreshQueues[providerType];
                    }

                    // 2. 尝试启动下一个等待中的提供商队列
                    if (this.refreshSemaphore.globalWaitQueue.length > 0) {
                        const resolve = this.refreshSemaphore.globalWaitQueue.shift();
                        Promise.resolve().then(resolve);
                    }
                }
            }
        };

        const tryStartProviderQueue = () => {
            if (queue.activeCount < this.refreshConcurrency.perProvider) {
                queue.activeCount++;
                runTask();
            } else {
                queue.waitingTasks.push(runTask);
            }
        };

        // 检查提供商是否已有运行中的刷新
        // 情况1: 该提供商已经在运行，直接加入其队列（不占用新的全局槽位）
        const isExistingQueue = queue.activeCount > 0 || queue.waitingTasks.length > 0;
        if (isExistingQueue) {
            tryStartProviderQueue();
        }
        // 情况2: 该提供商未运行，需要获取全局信号量
        else {
            // 使用 Promise 链确保信号量获取完成后再设置 ownsGlobalSlot
            const acquired = this._acquireGlobalSemaphoreSync();
            if (!acquired) {
                // 等待信号量可用，获取成功后才设置 ownsGlobalSlot 并启动任务
                this._acquireGlobalSemaphore(providerType)
                    .then(() => {
                        ownsGlobalSlot = true;
                        tryStartProviderQueue();
                    })
                    .catch((err) => {
                        this._log('error', `Failed to acquire global semaphore for ${providerType}: ${err.message}`);
                        // 从刷新队列中移除，避免永久锁定
                        this.refreshingUuids.delete(uuid);
                    });
            } else {
                ownsGlobalSlot = true;
                tryStartProviderQueue();
            }
        }
    }

    /**
     * 实际执行节点刷新逻辑
     * @private
     */
    async _refreshNodeToken(providerType, providerStatus, force = false) {
        const config = providerStatus.config;
        
        // 检查刷新次数是否已达上限（最大5次）
        const currentRefreshCount = config.refreshCount || 0;
        if (currentRefreshCount >= 5 && !force) {
            this._log('warn', `Node ${providerStatus.uuid} has reached maximum refresh count (5), marking as unhealthy`);
            // 标记为不健康
            this.markProviderUnhealthyImmediately(providerType, config, 'Maximum refresh count (5) reached');
            return;
        }
        
        // 添加5秒内的随机等待时间，避免并发刷新时的冲突
        // const randomDelay = Math.floor(Math.random() * 5000);
        // this._log('info', `Starting token refresh for node ${providerStatus.uuid} (${providerType}) with ${randomDelay}ms delay`);
        // await new Promise(resolve => setTimeout(resolve, randomDelay));

        try {
            // 增加刷新计数
            config.refreshCount = currentRefreshCount + 1;

            // 使用适配器进行刷新
            const tempConfig = {
                ...this.globalConfig,
                ...config,
                MODEL_PROVIDER: providerType
            };
            const serviceAdapter = getServiceAdapter(tempConfig);
            
            // 调用适配器的 refreshToken 方法（内部封装了具体的刷新逻辑）
            if (typeof serviceAdapter.refreshToken === 'function') {
                const startTime = Date.now();
                let refreshOperation;
                if (force) {
                    if (typeof serviceAdapter.forceRefreshToken === 'function') {
                        refreshOperation = serviceAdapter.forceRefreshToken();
                    } else {
                        this._log('warn', `forceRefreshToken not implemented for ${providerType}, falling back to refreshToken`);
                        refreshOperation = serviceAdapter.refreshToken();
                    }
                } else {
                    refreshOperation = serviceAdapter.refreshToken();
                }
                await this._awaitRefreshWithTimeout(refreshOperation, providerType, providerStatus.uuid);
                const duration = Date.now() - startTime;
                this._log('info', `Token refresh successful for node ${providerStatus.uuid} (Duration: ${duration}ms)`);
                
                // 刷新成功，统一重置状态
                config.needsRefresh = false;
                config.refreshCount = 0;
                config.lastRefreshTime = Date.now(); // 记录最后刷新成功时间
                
                this._debouncedSave(providerType);
            } else {
                throw new Error(`refreshToken method not implemented for ${providerType}`);
            }

        } catch (error) {
            this._log('error', `Token refresh failed for node ${providerStatus.uuid}: ${error.message}`);
            this.markProviderUnhealthyImmediately(providerType, config, `Refresh failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 为刷新任务附加超时保护，避免单个适配器调用无限挂起。
     * @private
     */
    async _awaitRefreshWithTimeout(refreshOperation, providerType, uuid) {
        if (this.refreshTaskTimeoutMs <= 0) {
            return await refreshOperation;
        }

        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Refresh timeout after ${this.refreshTaskTimeoutMs}ms for node ${uuid} (${providerType})`));
            }, this.refreshTaskTimeoutMs);
        });

        try {
            return await Promise.race([Promise.resolve(refreshOperation), timeoutPromise]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    /**
     * 计算节点的权重/评分，用于排序
     * 分数越低，优先级越高
     * @private
     */
    _calculateNodeScore(providerStatus, now = Date.now(), minSeqInPool = -1) {
        const config = providerStatus.config;
        const state = providerStatus.state;
        
        // 1. 基础健康分：不健康的排最后
        if (!config.isHealthy || config.isDisabled) return 1e18;
        
        // 检查并发限制
        const concurrencyLimit = parseInt(config.concurrencyLimit || 0, 10);
        const queueLimit = parseInt(config.queueLimit || 0, 10);
        
        if (concurrencyLimit > 0) {
            if (state.activeCount >= concurrencyLimit) {
                // 如果队列也满了，排在最后（但优于不健康节点）
                if (queueLimit > 0 && state.waitingCount >= queueLimit) {
                    return 1e17;
                }
                // 没满，但需要排队。排队数量越多，权重越大
                return 1e15 + (state.waitingCount || 0) * 1e10;
            }
        }
        
        // 2. 预热/新鲜度判断
        const lastHealthCheckTime = config.lastHealthCheckTime ? new Date(config.lastHealthCheckTime).getTime() : 0;
        const isFresh = lastHealthCheckTime && (now - lastHealthCheckTime < 60000);

        // 3. 计算统一评分
        // 基础分：新鲜节点使用固定负偏移 (-1e14)，普通节点使用上次使用时间 (约 1.7e12)
        const lastUsedTime = config.lastUsed ? new Date(config.lastUsed).getTime() : (now - 86400000);
        const baseScore = isFresh ? -1e14 : lastUsedTime;

        // 惩罚项 A: 使用次数 (每多用一次增加 10 秒权重)
        const usageCount = config.usageCount || 0;
        const usageScore = usageCount * 10000;

        // 惩罚项 B: 相对序列号 (用于打破平局，确保轮询)
        const lastSelectionSeq = config._lastSelectionSeq || 0;
        if (minSeqInPool === -1) {
            const pool = this.providerStatus[providerStatus.type] || [];
            minSeqInPool = pool.reduce((min, p) => Math.min(min, p.config._lastSelectionSeq || 0), Infinity);
        }
        const relativeSeq = Math.max(0, lastSelectionSeq - minSeqInPool);
        const cappedRelativeSeq = Math.min(relativeSeq, 100);
        const sequenceScore = cappedRelativeSeq * 1000;

        // 惩罚项 C: 负载 (每个活跃请求增加 5 秒权重)
        const loadScore = (state.activeCount || 0) * 5000;

        // 新鲜节点的微调：配合 usageScore 和 sequenceScore 在多个新鲜节点间轮询
        const freshBonus = isFresh ? (now - lastHealthCheckTime) : 0;

        return baseScore + usageScore + sequenceScore + loadScore + freshBonus;
    }

    /**
     * 获取指定类型的健康节点数量
     */
    getHealthyCount(providerType) {
        return (this.providerStatus[providerType] || []).filter(p => p.config.isHealthy && !p.config.isDisabled).length;
    }

    /**
     * 日志输出方法，支持日志级别控制
     * @private
     */
    _log(level, message) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        if (levels[level] >= levels[this.logLevel]) {
            logger[level](`[ProviderPoolManager] ${message}`);
        }
    }

    // ==================== 429 指数退避方法 ====================

    /**
     * 计算 429 错误的指数退避延迟（带 jitter）
     * @param {string} providerType - 提供商类型
     * @param {number} attempt - 当前重试次数（从1开始）
     * @returns {number} 延迟毫秒数
     * @private
     */
    _calculateBackoffDelay(providerType, attempt = 1) {
        const { base, max } = this.quotaBackoff;
        const delay = Math.min(base * Math.pow(2, attempt - 1), max);
        // 添加 jitter 避免多节点同时重试
        const jitter = Math.random() * 0.3 * delay;
        return Math.floor(delay + jitter);
    }

    /**
     * 检查是否有预设的 quota 重置时间
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 节点 UUID
     * @returns {boolean}
     * @private
     */
    _hasQuotaResetTime(providerType, uuid) {
        const key = `${providerType}:${uuid}`;
        const resetTime = this.quotaBackoff.quotaResetTimes[key];
        if (resetTime && Date.now() < resetTime) {
            return true;
        }
        delete this.quotaBackoff.quotaResetTimes[key];
        return false;
    }

    /**
     * 设置 quota 重置时间（从 429 响应的 Retry-After header 或 quota reset 时间）
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 节点 UUID
     * @param {number} resetTimeMs - 重置时间戳（毫秒）
     */
    setQuotaResetTime(providerType, uuid, resetTimeMs) {
        const key = `${providerType}:${uuid}`;

        // 清理过期的 quotaResetTime 条目，防止内存泄漏
        const now = Date.now();
        for (const k of Object.keys(this.quotaBackoff.quotaResetTimes)) {
            if (this.quotaBackoff.quotaResetTimes[k] <= now) {
                delete this.quotaBackoff.quotaResetTimes[k];
            }
        }

        this.quotaBackoff.quotaResetTimes[key] = resetTimeMs;
        this._log('debug', `Set quota reset time for ${uuid}: ${new Date(resetTimeMs).toISOString()}`);
    }

    // ==================== 冷却队列方法 ====================

    /**
     * 将 provider 加入冷却队列
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 节点 UUID
     * @param {number} [cooldownMs] - 冷却时间（毫秒），默认 60s
     */
    addToCooldown(providerType, uuid, cooldownMs = null) {
        if (!this.cooldownQueue.enabled) return;

        const cooldown = cooldownMs ?? this.cooldownQueue.defaultCooldown;
        const key = `${providerType}:${uuid}`;
        const expireAt = Date.now() + cooldown;

        if (!this.cooldownQueue.queues[providerType]) {
            this.cooldownQueue.queues[providerType] = new Map();
        }

        // 清理该 providerType 下过期的条目，防止内存泄漏
        const queue = this.cooldownQueue.queues[providerType];
        // 先收集要删除的 key，避免迭代中修改 Map
        const keysToDelete = [];
        for (const [uid, exp] of queue.entries()) {
            if (Date.now() >= exp) {
                keysToDelete.push(uid);
            }
        }
        for (const uid of keysToDelete) {
            queue.delete(uid);
        }

        this.cooldownQueue.queues[providerType].set(uuid, expireAt);
        this._log('info', `Added ${uuid} to cooldown for ${cooldown}ms`);
    }

    /**
     * 检查 provider 是否在冷却中
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 节点 UUID
     * @returns {boolean}
     */
    isInCooldown(providerType, uuid) {
        const queue = this.cooldownQueue.queues[providerType];
        if (!queue) return false;

        const expireAt = queue.get(uuid);
        if (!expireAt) return false;

        if (Date.now() >= expireAt) {
            queue.delete(uuid);
            return false;
        }
        return true;
    }

    /**
     * 获取 provider 冷却剩余时间
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 节点 UUID
     * @returns {number} 剩余毫秒数
     */
    getCooldownRemaining(providerType, uuid) {
        const queue = this.cooldownQueue.queues[providerType];
        if (!queue) return 0;

        const expireAt = queue.get(uuid);
        if (!expireAt) return 0;

        return Math.max(0, expireAt - Date.now());
    }

    /**
     * 清理过期的冷却条目
     */
    cleanupCooldownQueue() {
        const now = Date.now();
        for (const type in this.cooldownQueue.queues) {
            const queue = this.cooldownQueue.queues[type];
            for (const [uuid, expireAt] of queue.entries()) {
                if (now >= expireAt) {
                    queue.delete(uuid);
                }
            }
        }
    }

    /**
     * 同步版本：尝试获取全局刷新信号量（不等待）
     * @returns {boolean} 是否成功获取
     * @private
     */
    _acquireGlobalSemaphoreSync() {
        if (this.refreshSemaphore.globalUsed >= this.refreshSemaphore.global) {
            return false;
        }
        this.refreshSemaphore.globalUsed++;
        return true;
    }

    // ==================== 刷新信号量方法 ====================

    /**
     * 尝试获取全局刷新信号量
     * @param {string} providerType - 提供商类型
     * @returns {Promise<boolean>} 是否成功获取
     * @private
     */
    async _acquireGlobalSemaphore(providerType) {
        const startTime = Date.now();
        const maxWait = this.maxSemaphoreWaitTime;

        while (this.refreshSemaphore.globalUsed >= this.refreshSemaphore.global) {
            // 检查是否超时
            if (Date.now() - startTime > maxWait) {
                this._log('warn', `Global semaphore acquisition timeout for providerType: ${providerType}, waited ${maxWait}ms`);
                throw new Error(`Global semaphore acquisition timeout after ${maxWait}ms for providerType: ${providerType}`);
            }

            // 等待一小段时间后再次检查，避免立即循环
            await new Promise(resolve => {
                const timeout = setTimeout(() => {
                    // 再次检查是否超时
                    if (Date.now() - startTime > maxWait) {
                        clearTimeout(timeout);
                        resolve(false);
                    } else {
                        clearTimeout(timeout);
                        resolve(true);
                    }
                }, 100);
                this.refreshSemaphore.globalWaitQueue.push(() => {
                    clearTimeout(timeout);
                    resolve(true);
                });
            });

            // 如果被超时唤醒，则抛出异常
            if (this.refreshSemaphore.globalUsed >= this.refreshSemaphore.global) {
                // 再次检查超时
                if (Date.now() - startTime > maxWait) {
                    this._log('warn', `Global semaphore acquisition timeout for providerType: ${providerType}, waited ${maxWait}ms`);
                    throw new Error(`Global semaphore acquisition timeout after ${maxWait}ms for providerType: ${providerType}`);
                }
            }
        }
        this.refreshSemaphore.globalUsed++;
        return true;
    }

    /**
     * 释放全局刷新信号量
     * @private
     */
    _releaseGlobalSemaphore() {
        if (this.refreshSemaphore.globalUsed > 0) {
            this.refreshSemaphore.globalUsed--;
        }
        // 唤醒等待中的下一个任务
        if (this.refreshSemaphore.globalWaitQueue.length > 0) {
            const resolve = this.refreshSemaphore.globalWaitQueue.shift();
            try {
                resolve();
            } catch (err) {
                this._log('error', `Failed to invoke semaphore resolver: ${err.message}`);
                // 再次尝试唤醒下一个（递归保护）
                if (this.refreshSemaphore.globalWaitQueue.length > 0) {
                    const nextResolve = this.refreshSemaphore.globalWaitQueue.shift();
                    Promise.resolve().then(() => nextResolve());
                }
            }
        }
    }

    /**
     * 尝试获取 provider 级别刷新信号量（非阻塞）
     * @param {string} providerType - 提供商类型
     * @returns {boolean} 是否成功获取
     * @private
     */
    _acquireProviderSemaphore(providerType) {
        const used = this.refreshSemaphore.perProviderUsed[providerType] || 0;
        if (used >= this.refreshSemaphore.perProvider) {
            return false;
        }
        this.refreshSemaphore.perProviderUsed[providerType] = used + 1;
        return true;
    }

    /**
     * 释放 provider 级别刷新信号量
     * @param {string} providerType - 提供商类型
     * @private
     */
    _releaseProviderSemaphore(providerType) {
        const used = this.refreshSemaphore.perProviderUsed[providerType] || 0;
        if (used > 0) {
            this.refreshSemaphore.perProviderUsed[providerType] = used - 1;
        }
        // 唤醒等待中的下一个任务
        const waitQueue = this.refreshSemaphore.perProviderWaitQueues[providerType];
        if (waitQueue && waitQueue.length > 0) {
            const resolve = waitQueue.shift();
            try {
                resolve();
            } catch (err) {
                this._log('error', `Failed to invoke provider semaphore resolver: ${err.message}`);
                // 出错时递归重试，确保等待队列最终被处理
                if (waitQueue.length > 0) {
                    const nextResolve = waitQueue.shift();
                    Promise.resolve().then(() => nextResolve());
                }
            }
        }
    }

    /**
     * 等待 provider 信号量可用
     * @param {string} providerType - 提供商类型
     * @private
     */
    async _waitForProviderSemaphore(providerType) {
        while (!this._acquireProviderSemaphore(providerType)) {
            await new Promise(resolve => {
                if (!this.refreshSemaphore.perProviderWaitQueues[providerType]) {
                    this.refreshSemaphore.perProviderWaitQueues[providerType] = [];
                }
                this.refreshSemaphore.perProviderWaitQueues[providerType].push(resolve);
            });
        }
    }

    /**
     * 记录健康状态变化日志
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置
     * @param {string} fromStatus - 之前状态
     * @param {string} toStatus - 当前状态
     * @param {string} [errorMessage] - 错误信息（可选）
     * @private
     */
    _logHealthStatusChange(providerType, providerConfig, fromStatus, toStatus, errorMessage = null) {
        const customName = providerConfig.customName || providerConfig.uuid;
        const timestamp = new Date().toISOString();
        
        const logEntry = {
            timestamp,
            providerType,
            uuid: providerConfig.uuid,
            customName,
            fromStatus,
            toStatus,
            errorMessage,
            usageCount: providerConfig.usageCount || 0,
            errorCount: providerConfig.errorCount || 0
        };
        
        // 输出详细的状态变化日志
        if (toStatus === 'unhealthy') {
            logger.warn(`[HealthMonitor] ⚠️ Provider became UNHEALTHY: ${customName} (${providerType})`);
            logger.warn(`[HealthMonitor]    Reason: ${errorMessage || 'Unknown'}`);
            logger.warn(`[HealthMonitor]    Error Count: ${providerConfig.errorCount}`);
            
            // 触发告警（如果配置了 Webhook）
            this._triggerHealthAlert(providerType, providerConfig, 'unhealthy', errorMessage);
        } else if (toStatus === 'healthy' && fromStatus === 'unhealthy') {
            logger.info(`[HealthMonitor] ✅ Provider recovered to HEALTHY: ${customName} (${providerType})`);
            
            // 触发恢复通知
            this._triggerHealthAlert(providerType, providerConfig, 'recovered', null);
        }
        
        // 广播健康状态变化事件
        broadcastEvent('health_status_change', logEntry);
    }

    /**
     * 触发健康状态告警
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置
     * @param {string} status - 状态 ('unhealthy' | 'recovered')
     * @param {string} [errorMessage] - 错误信息
     * @private
     */
    async _triggerHealthAlert(providerType, providerConfig, status, errorMessage = null) {
        const webhookUrl = this.globalConfig?.HEALTH_ALERT_WEBHOOK_URL;
        if (!webhookUrl) {
            return; // 未配置 Webhook，跳过
        }
        
        const customName = providerConfig.customName || providerConfig.uuid;
        const payload = {
            timestamp: new Date().toISOString(),
            providerType,
            uuid: providerConfig.uuid,
            customName,
            status,
            errorMessage,
            stats: {
                usageCount: providerConfig.usageCount || 0,
                errorCount: providerConfig.errorCount || 0
            }
        };
        
        try {
            const axios = (await import('axios')).default;
            await axios.post(webhookUrl, payload, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });
            this._log('info', `Health alert sent to webhook for ${customName}: ${status}`);
        } catch (error) {
            this._log('error', `Failed to send health alert to webhook: ${error.message}`);
        }
    }

    /**
     * 查找指定的 provider
     * @private
     */
    _findProvider(providerType, uuid) {
        if (!providerType || !uuid) {
            this._log('error', `Invalid parameters: providerType=${providerType}, uuid=${uuid}`);
            return null;
        }
        const pool = this.providerStatus[providerType];
        return pool?.find(p => p.uuid === uuid) || null;
    }

    /**
     * 根据 UUID 在所有池中查找提供商配置
     * @param {string} uuid - 提供商 UUID
     * @returns {object|null} 提供商配置对象或 null
     */
    findProviderByUuid(uuid) {
        if (!uuid) return null;
        for (const type in this.providerStatus) {
            const provider = this.providerStatus[type].find(p => p.uuid === uuid);
            if (provider) return provider.config;
        }
        return null;
    }

    /**
     * Initializes the status for each provider in the pools.
     * Initially, all providers are considered healthy and have zero usage.
     */
    initializeProviderStatus() {
        const oldFullStatus = this.providerStatus || {};
        const isColdStart = Object.keys(oldFullStatus).length === 0;
        this.providerStatus = {}; // Tracks health and usage for each provider instance
        for (const providerType in this.providerPools) {
            const oldStatus = oldFullStatus[providerType] || [];
            this.providerStatus[providerType] = [];
            this.roundRobinIndex[providerType] = 0; // Initialize round-robin index for each type
            // 只有在锁不存在时才初始化，避免在运行中被重置导致并发问题
            if (!this._selectionLocks[providerType]) {
                this._selectionLocks[providerType] = Promise.resolve();
            }
            
            const pool = this.providerPools[providerType];
            
            pool.forEach((providerConfig) => {
                try {
                    // 尝试从旧状态中恢复活跃请求计数和队列，避免重载配置时重置并发限制
                    const existing = oldStatus.find(p => p.uuid === providerConfig.uuid);

                    // Ensure initial health and usage stats are present in the config
                    providerConfig.isHealthy = providerConfig.isHealthy !== undefined ? providerConfig.isHealthy : true;
                    providerConfig.isDisabled = providerConfig.isDisabled !== undefined ? providerConfig.isDisabled : false;
                    providerConfig.lastUsed = providerConfig.lastUsed !== undefined ? providerConfig.lastUsed : null;
                    providerConfig.usageCount = providerConfig.usageCount !== undefined ? providerConfig.usageCount : 0;
                    providerConfig.errorCount = providerConfig.errorCount !== undefined ? providerConfig.errorCount : 0;
                    
                    // --- V2: 刷新监控字段 ---
                    const persistedNeedsRefresh = providerConfig.needsRefresh !== undefined ? providerConfig.needsRefresh : false;
                    const persistedRefreshCount = providerConfig.refreshCount !== undefined ? providerConfig.refreshCount : 0;
                    if (isColdStart && (persistedNeedsRefresh || persistedRefreshCount > 0)) {
                        this._log('info', `Resetting stale refresh state for provider ${providerConfig.uuid} (${providerType}) on startup.`);
                    }
                    providerConfig.needsRefresh = isColdStart ? false : persistedNeedsRefresh;
                    providerConfig.refreshCount = isColdStart ? 0 : persistedRefreshCount;
                    
                    // 优化2: 简化 lastErrorTime 处理逻辑
                    providerConfig.lastErrorTime = providerConfig.lastErrorTime instanceof Date
                        ? providerConfig.lastErrorTime.toISOString()
                        : (providerConfig.lastErrorTime || null);
                    
                    // 健康检测相关字段
                    providerConfig.lastHealthCheckTime = providerConfig.lastHealthCheckTime || null;
                    providerConfig.lastHealthCheckModel = providerConfig.lastHealthCheckModel || null;
                    providerConfig.lastErrorMessage = providerConfig.lastErrorMessage || null;
                    providerConfig.customName = providerConfig.customName || null;

                    this.providerStatus[providerType].push({
                        config: providerConfig,
                        uuid: providerConfig.uuid, // Still keep uuid at the top level for easy access
                        type: providerType, // 保存 providerType 引用
                        state: existing ? existing.state : {
                            activeCount: 0,
                            waitingCount: 0,
                            queue: []
                        }
                    });
                } catch (nodeError) {
                    logger.error(`[ProviderPoolManager] Error initializing node for ${providerType}: ${nodeError.message}`);
                }
            });
            
            // 确保初始化时的默认值补全也能写盘
            this._debouncedSave(providerType);
        }
        this._log('info', `Initialized provider statuses: ok (maxErrorCount: ${this.maxErrorCount})`);
    }

    /**
     * 获取一个可用的提供商插槽，考虑并发限制和队列
     * 429 时自动退避重试（指数退避 + 冷却队列）
     * @param {string} providerType
     * @param {string} requestedModel
     * @param {object} options
     */
    async acquireSlot(providerType, requestedModel = null, options = {}) {
        const maxRetries = this.quotaBackoff.maxRetries;
        let lastError = null;
        let selectedConfig = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 每次重试前清理过期的冷却条目
                this.cleanupCooldownQueue();

                // 使用 selectProvider 进行初次选择（评分逻辑已经包含了并发考虑）
                selectedConfig = await this.selectProvider(providerType, requestedModel, { ...options, skipUsageCount: true });

                if (!selectedConfig) {
                    return null;
                }

                const provider = this._findProvider(providerType, selectedConfig.uuid);
                if (!provider) return selectedConfig;

                const config = provider.config;
                const state = provider.state;
                const concurrencyLimit = parseInt(config.concurrencyLimit || 0, 10);
                const queueLimit = parseInt(config.queueLimit || 0, 10);

                // 如果没有限制，直接增加活跃计数并返回
                if (concurrencyLimit <= 0) {
                    state.activeCount++;
                    return config;
                }

                // 检查是否在并发限制内
                if (state.activeCount < concurrencyLimit) {
                    state.activeCount++;
                    return config;
                }

                // 超过并发限制，尝试进入队列
                if (queueLimit > 0 && state.waitingCount < queueLimit) {
                    this._log('info', `[Concurrency] Node ${config.uuid} busy (${state.activeCount}/${concurrencyLimit}), enqueuing request (queue: ${state.waitingCount + 1}/${queueLimit})`);

                    state.waitingCount++;
                    try {
                        // 等待释放信号
                        await new Promise((resolve, reject) => {
                            const timeoutMs = options.queueTimeout || 300000;
                            const timeout = setTimeout(() => {
                                const idx = state.queue.indexOf(handler);
                                if (idx !== -1) {
                                    state.queue.splice(idx, 1);
                                    reject(new Error(`Queue timeout after ${timeoutMs/1000}s`));
                                }
                            }, timeoutMs);

                            const handler = () => {
                                clearTimeout(timeout);
                                resolve();
                            };
                            state.queue.push(handler);
                        });
                    } finally {
                        state.waitingCount--;
                    }

                    // 获得信号后，增加活跃计数
                    state.activeCount++;
                    return config;
                }

                // 队列也满了 - 抛出 429 供外层重试处理
                throw this._createQuotaError(config, state);

            } catch (error) {
                if (error.status !== 429) {
                    throw error;
                }

                lastError = error;

                // 检查是否有预设的 quota 重置时间
                const uuid = lastError.providerUuid || selectedConfig?.uuid;
                if (uuid && this._hasQuotaResetTime(providerType, uuid)) {
                    const key = `${providerType}:${uuid}`;
                    const waitMs = this.quotaBackoff.quotaResetTimes[key] - Date.now();
                    // 至少等待 100ms 避免立即重试造成busy loop
                    const actualWait = Math.max(100, waitMs);
                    this._log('info', `Quota reset scheduled for ${uuid}, waiting ${actualWait}ms...`);
                    await new Promise(resolve => setTimeout(resolve, actualWait));
                    continue;
                }

                if (attempt >= maxRetries) {
                    this._log('warn', `Quota exhausted for ${providerType} after ${attempt} attempts`);
                    // 清理冷却队列
                    this.cleanupCooldownQueue();
                    throw lastError;
                }

                // 将 provider 加入冷却队列（使用线性增长避免与退避延迟指数叠加）
                if (uuid) {
                    const cooldownMultiplier = attempt;  // 线性增长，不与退避延迟叠加
                    const cooldownMs = Math.min(
                        this.cooldownQueue.defaultCooldown * cooldownMultiplier,
                        this.cooldownQueue.maxCooldown
                    );
                    this.addToCooldown(providerType, uuid, cooldownMs);
                }

                // 计算退避延迟
                const delay = this._calculateBackoffDelay(providerType, attempt);
                this._log('info', `Received 429 for ${providerType}, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * 创建 quota 错误对象
     * @param {object} config - 提供商配置
     * @param {object} state - 提供商状态
     * @returns {Error}
     * @private
     */
    _createQuotaError(config, state) {
        const error = new Error('Too many requests: account concurrency limit and queue reached');
        error.status = 429;
        error.code = 429;
        error.providerUuid = config.uuid;
        return error;
    }

    /**
     * 释放提供商插槽
     */
    releaseSlot(providerType, uuid) {
        if (!providerType || !uuid) return;
        
        const provider = this._findProvider(providerType, uuid);
        if (!provider) return;

        const state = provider.state;
        if (state.activeCount > 0) {
            state.activeCount--;
        }

        // 如果队列中有等待的任务，释放下一个
        if (state.queue && state.queue.length > 0) {
            const next = state.queue.shift();
            if (next) {
                // 异步触发
                setImmediate(next);
            }
        }
    }

    /**
     * Selects a provider from the pool for a given provider type.
     * Currently uses a simple round-robin for healthy providers.
     * If requestedModel is provided, providers that don't support the model will be excluded.
     *
     * 注意：此方法现在返回 Promise，使用互斥锁确保并发安全。
     *
     * @param {string} providerType - The type of provider to select (e.g., 'gemini-cli', 'openai-custom').
     * @param {string} [requestedModel] - Optional. The model name to filter providers by.
     * @returns {Promise<object|null>} The selected provider's configuration, or null if no healthy provider is found.
     */
    async selectProvider(providerType, requestedModel = null, options = {}) {
        // 参数校验
        if (!providerType || typeof providerType !== 'string') {
            this._log('error', `Invalid providerType: ${providerType}`);
            return null;
        }
 
        // 使用标志位 + 异步等待实现更强力的互斥锁
        // 这种方式能更好地处理同一微任务循环内的并发
        while (this._isSelecting[providerType]) {
            await new Promise(resolve => setImmediate(resolve));
        }
        
        this._isSelecting[providerType] = true;
        
        try {
            // 在锁内部执行同步选择
            return this._doSelectProvider(providerType, requestedModel, options);
        } finally {
            this._isSelecting[providerType] = false;
        }
    }

    /**
     * 实际执行 provider 选择的内部方法（同步执行，由锁保护）
     * @private
     */
    _doSelectProvider(providerType, requestedModel, options) {
        const availableProviders = this.providerStatus[providerType] || [];
        
        // 检查并恢复已到恢复时间的提供商
        this._checkAndRecoverScheduledProviders(providerType);
        
        // 获取固定时间戳，确保排序过程中一致
        const now = Date.now();
        
        // 提前计算池中最小序列号，避免在排序算法中重复 O(N) 计算
        const minSeq = Math.min(...availableProviders.map(p => p.config._lastSelectionSeq || 0));

        let availableAndHealthyProviders = availableProviders.filter(p =>
            p.config.isHealthy && !p.config.isDisabled && !p.config.needsRefresh && !this.isInCooldown(providerType, p.uuid)
        );

        // 如果指定了模型，则排除不支持该模型的提供商
        if (requestedModel) {
            const modelFilteredProviders = availableAndHealthyProviders.filter(p => {
                const supportedModels = getConfiguredSupportedModels(providerType, p.config);
                if (supportedModels.length > 0) {
                    return supportedModels.includes(requestedModel);
                }
                // 如果提供商没有配置 notSupportedModels，则认为它支持所有模型
                if (!p.config.notSupportedModels || !Array.isArray(p.config.notSupportedModels)) {
                    return true;
                }
                // 检查 notSupportedModels 数组中是否包含请求的模型，如果包含则排除
                return !p.config.notSupportedModels.includes(requestedModel);
            });

            if (modelFilteredProviders.length === 0) {
                this._log('warn', `No available providers for type: ${providerType} that support model: ${requestedModel}`);
                return null;
            }

            availableAndHealthyProviders = modelFilteredProviders;
            this._log('debug', `Filtered ${modelFilteredProviders.length} providers supporting model: ${requestedModel}`);
        }

        if (availableAndHealthyProviders.length === 0) {
            this._log('warn', `No available and healthy providers for type: ${providerType}`);
            return null;
        }

        // 改进：使用统一的评分策略进行选择
        // 传入当前时间戳 now 确保一致性
        const selected = availableAndHealthyProviders.sort((a, b) => {
            const scoreA = this._calculateNodeScore(a, now, minSeq);
            const scoreB = this._calculateNodeScore(b, now, minSeq);
            if (scoreA !== scoreB) return scoreA - scoreB;
            // 如果分值相同，使用 UUID 排序确保确定性
            return a.uuid < b.uuid ? -1 : 1;
        })[0];

        // 始终更新 lastUsed（确保 LRU 策略生效，避免并发请求选到同一个 provider）
        // usageCount 只在请求成功后才增加（由 skipUsageCount 控制）
        selected.config.lastUsed = new Date().toISOString();
        
        // 更新自增序列号，确保即使毫秒级并发，也能在下一轮排序中被区分开
        this._selectionSequence++;
        selected.config._lastSelectionSeq = this._selectionSequence;
        
        // 强制打印选中日志，方便排查并发问题
        this._log('info', `[Concurrency Control] Atomic selection: ${selected.config.uuid} (Seq: ${this._selectionSequence})`);

        if (!options.skipUsageCount) {
            selected.config.usageCount++;
        }
        // 使用防抖保存（文件 I/O 是异步的，但内存已经更新）
        this._debouncedSave(providerType);

        this._log('debug', `Selected provider for ${providerType} (LRU): ${selected.config.uuid}${requestedModel ? ` for model: ${requestedModel}` : ''}${options.skipUsageCount ? ' (skip usage count)' : ''}`);
        
        return selected.config;
    }

    /**
     * 获取一个可用的提供商插槽，支持 Fallback 机制
     */
    async acquireSlotWithFallback(providerType, requestedModel = null, options = {}) {
        if (!providerType || typeof providerType !== 'string') {
            this._log('error', `Invalid providerType: ${providerType}`);
            return null;
        }

        const triedTypes = new Set();
        const typesToTry = [providerType];
        
        const fallbackTypes = this.fallbackChain[providerType] || [];
        if (Array.isArray(fallbackTypes)) {
            typesToTry.push(...fallbackTypes);
        }

        for (const currentType of typesToTry) {
            if (triedTypes.has(currentType)) continue;
            triedTypes.add(currentType);

            if (!this.providerStatus[currentType] || this.providerStatus[currentType].length === 0) {
                continue;
            }

            if (currentType !== providerType && requestedModel) {
                const primaryProtocol = getProtocolPrefix(providerType);
                const fallbackProtocol = getProtocolPrefix(currentType);
                if (primaryProtocol !== fallbackProtocol) continue;

                const supportedModels = getProviderModels(currentType);
                if (supportedModels.length > 0 && !supportedModels.includes(requestedModel)) continue;
            }

            // 尝试获取插槽
            try {
                const selectedConfig = await this.acquireSlot(currentType, requestedModel, options);
                if (selectedConfig) {
                    if (currentType !== providerType) {
                        this._log('info', `Fallback Slot activated (Chain): ${providerType} -> ${currentType} (uuid: ${selectedConfig.uuid})`);
                    }
                    return {
                        config: selectedConfig,
                        actualProviderType: currentType,
                        isFallback: currentType !== providerType
                    };
                }
            } catch (err) {
                if (err.status === 429) {
                    // 如果是因为 429 (并发/队列满)，尝试下一个 Fallback
                    this._log('info', `Type ${currentType} busy (429), trying next fallback...`);
                    continue;
                }
                throw err; // 其他错误抛出
            }
        }

        // Model Fallback Mapping
        if (requestedModel && this.modelFallbackMapping && this.modelFallbackMapping[requestedModel]) {
            const mapping = this.modelFallbackMapping[requestedModel];
            const targetProviderType = mapping.targetProviderType;
            const targetModel = mapping.targetModel;

            if (targetProviderType && targetModel) {
                if (this.providerStatus[targetProviderType] && this.providerStatus[targetProviderType].length > 0) {
                    try {
                        const selectedConfig = await this.acquireSlot(targetProviderType, targetModel, options);
                        if (selectedConfig) {
                            return {
                                config: selectedConfig,
                                actualProviderType: targetProviderType,
                                isFallback: true,
                                actualModel: targetModel
                            };
                        }
                    } catch (err) {
                        // 如果目标类型繁忙，尝试它的 fallback chain
                        const targetFallbackTypes = this.fallbackChain[targetProviderType] || [];
                        for (const fallbackType of targetFallbackTypes) {
                             const targetProtocol = getProtocolPrefix(targetProviderType);
                             const fallbackProtocol = getProtocolPrefix(fallbackType);
                             if (targetProtocol !== fallbackProtocol) continue;
                             
                             const supportedModels = getProviderModels(fallbackType);
                             if (supportedModels.length > 0 && !supportedModels.includes(targetModel)) continue;
                             
                             try {
                                const fallbackSelectedConfig = await this.acquireSlot(fallbackType, targetModel, options);
                                if (fallbackSelectedConfig) {
                                    return {
                                        config: fallbackSelectedConfig,
                                        actualProviderType: fallbackType,
                                        isFallback: true,
                                        actualModel: targetModel
                                    };
                                }
                             } catch (e) {
                                 continue;
                             }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Selects a provider from the pool with fallback support.
     * When the primary provider type has no healthy providers, it will try fallback types.
     * @param {string} providerType - The primary type of provider to select.
     * @param {string} [requestedModel] - Optional. The model name to filter providers by.
     * @param {Object} [options] - Optional. Additional options.
     * @param {boolean} [options.skipUsageCount] - Optional. If true, skip incrementing usage count.
     * @returns {object|null} An object containing the selected provider's configuration and the actual provider type used, or null if no healthy provider is found.
     */
    /**
     * Selects a provider from the pool with fallback support.
     * When the primary provider type has no healthy providers, it will try fallback types.
     *
     * 注意：此方法现在返回 Promise，因为内部调用的 selectProvider 是异步的。
     *
     * @param {string} providerType - The primary type of provider to select.
     * @param {string} [requestedModel] - Optional. The model name to filter providers by.
     * @param {Object} [options] - Optional. Additional options.
     * @param {boolean} [options.skipUsageCount] - Optional. If true, skip incrementing usage count.
     * @returns {Promise<object|null>} An object containing the selected provider's configuration and the actual provider type used, or null if no healthy provider is found.
     */
    async selectProviderWithFallback(providerType, requestedModel = null, options = {}) {
        // 参数校验
        if (!providerType || typeof providerType !== 'string') {
            this._log('error', `Invalid providerType: ${providerType}`);
            return null;
        }

        // ==========================
        // 优先级 1: Provider Fallback Chain (同协议/兼容协议的回退)
        // ==========================
        
        // 记录尝试过的类型，避免循环
        const triedTypes = new Set();
        const typesToTry = [providerType];
        
        const fallbackTypes = this.fallbackChain[providerType] || [];
        if (Array.isArray(fallbackTypes)) {
            typesToTry.push(...fallbackTypes);
        }

        for (const currentType of typesToTry) {
            // 避免重复尝试
            if (triedTypes.has(currentType)) {
                continue;
            }
            triedTypes.add(currentType);

            // 检查该类型是否有配置的池
            if (!this.providerStatus[currentType] || this.providerStatus[currentType].length === 0) {
                this._log('debug', `No provider pool configured for type: ${currentType}`);
                continue;
            }

            // 如果是 fallback 类型，需要检查模型兼容性
            if (currentType !== providerType && requestedModel) {
                // 检查协议前缀是否兼容
                const primaryProtocol = getProtocolPrefix(providerType);
                const fallbackProtocol = getProtocolPrefix(currentType);
                
                if (primaryProtocol !== fallbackProtocol) {
                    this._log('debug', `Skipping fallback type ${currentType}: protocol mismatch (${primaryProtocol} vs ${fallbackProtocol})`);
                    continue;
                }

                // 检查 fallback 类型是否支持请求的模型
                const supportedModels = getProviderModels(currentType);
                if (supportedModels.length > 0 && !supportedModels.includes(requestedModel)) {
                    this._log('debug', `Skipping fallback type ${currentType}: model ${requestedModel} not supported`);
                    continue;
                }
            }

            // 尝试从当前类型选择提供商（现在是异步的）
            const selectedConfig = await this.selectProvider(currentType, requestedModel, options);
            
            if (selectedConfig) {
                if (currentType !== providerType) {
                    this._log('info', `Fallback activated (Chain): ${providerType} -> ${currentType} (uuid: ${selectedConfig.uuid})`);
                }
                return {
                    config: selectedConfig,
                    actualProviderType: currentType,
                    isFallback: currentType !== providerType
                };
            }
        }

        // ==========================
        // 优先级 2: Model Fallback Mapping (跨协议/特定模型的回退)
        // ==========================

        if (requestedModel && this.modelFallbackMapping && this.modelFallbackMapping[requestedModel]) {
            const mapping = this.modelFallbackMapping[requestedModel];
            const targetProviderType = mapping.targetProviderType;
            const targetModel = mapping.targetModel;

            if (targetProviderType && targetModel) {
                this._log('info', `Trying Model Fallback Mapping for ${requestedModel}: -> ${targetProviderType} (${targetModel})`);
                
                // 递归调用 selectProviderWithFallback，但这次针对目标提供商类型
                // 注意：这里我们直接尝试从目标提供商池中选择，因为如果再次递归可能会导致死循环或逻辑复杂化
                // 简单起见，我们直接尝试选择目标提供商
                
                // 检查目标类型是否有配置的池
                if (this.providerStatus[targetProviderType] && this.providerStatus[targetProviderType].length > 0) {
                    // 尝试从目标类型选择提供商（使用转换后的模型名，现在是异步的）
                    const selectedConfig = await this.selectProvider(targetProviderType, targetModel, options);
                    
                    if (selectedConfig) {
                        this._log('info', `Fallback activated (Model Mapping): ${providerType} (${requestedModel}) -> ${targetProviderType} (${targetModel}) (uuid: ${selectedConfig.uuid})`);
                        return {
                            config: selectedConfig,
                            actualProviderType: targetProviderType,
                            isFallback: true,
                            actualModel: targetModel // 返回实际使用的模型名，供上层进行请求转换
                        };
                    } else {
                        // 如果目标类型的主池也不可用，尝试目标类型的 fallback chain
                        // 例如 claude-kiro-oauth (mapped) -> claude-custom (chain)
                        // 这需要我们小心处理，避免无限递归。
                        // 我们可以手动检查目标类型的 fallback chain
                        
                        const targetFallbackTypes = this.fallbackChain[targetProviderType] || [];
                        for (const fallbackType of targetFallbackTypes) {
                             // 检查协议兼容性 (目标类型 vs 它的 fallback)
                             const targetProtocol = getProtocolPrefix(targetProviderType);
                             const fallbackProtocol = getProtocolPrefix(fallbackType);
                             
                             if (targetProtocol !== fallbackProtocol) continue;
                             
                             // 检查模型支持
                             const supportedModels = getProviderModels(fallbackType);
                             if (supportedModels.length > 0 && !supportedModels.includes(targetModel)) continue;
                             
                             const fallbackSelectedConfig = await this.selectProvider(fallbackType, targetModel, options);
                             if (fallbackSelectedConfig) {
                                 this._log('info', `Fallback activated (Model Mapping -> Chain): ${providerType} (${requestedModel}) -> ${targetProviderType} -> ${fallbackType} (${targetModel}) (uuid: ${fallbackSelectedConfig.uuid})`);
                                 return {
                                     config: fallbackSelectedConfig,
                                     actualProviderType: fallbackType,
                                     isFallback: true,
                                     actualModel: targetModel
                                 };
                             }
                        }
                    }
                } else {
                    this._log('warn', `Model Fallback target provider ${targetProviderType} not configured or empty.`);
                }
            }
        }

        this._log('warn', `None available provider found for ${providerType} (Model: ${requestedModel}) after checking fallback chain and model mapping.`);
        return null;
    }

    /**
     * Gets the fallback chain for a given provider type.
     * @param {string} providerType - The provider type to get fallback chain for.
     * @returns {Array<string>} The fallback chain array, or empty array if not configured.
     */
    getFallbackChain(providerType) {
        return this.fallbackChain[providerType] || [];
    }

    /**
     * Sets or updates the fallback chain for a provider type.
     * @param {string} providerType - The provider type to set fallback chain for.
     * @param {Array<string>} fallbackTypes - Array of fallback provider types.
     */
    setFallbackChain(providerType, fallbackTypes) {
        if (!Array.isArray(fallbackTypes)) {
            this._log('error', `Invalid fallbackTypes: must be an array`);
            return;
        }
        this.fallbackChain[providerType] = fallbackTypes;
        this._log('info', `Updated fallback chain for ${providerType}: ${fallbackTypes.join(' -> ')}`);
    }

    /**
     * Checks if all providers of a given type are unhealthy.
     * @param {string} providerType - The provider type to check.
     * @returns {boolean} True if all providers are unhealthy or disabled.
     */
    isAllProvidersUnhealthy(providerType) {
        const providers = this.providerStatus[providerType] || [];
        if (providers.length === 0) {
            return true;
        }
        return providers.every(p => !p.config.isHealthy || p.config.isDisabled);
    }

    /**
     * Gets statistics about provider health for a given type.
     * @param {string} providerType - The provider type to get stats for.
     * @returns {Object} Statistics object with total, healthy, unhealthy, and disabled counts.
     */
    getProviderStats(providerType) {
        const providers = this.providerStatus[providerType] || [];
        const stats = {
            total: providers.length,
            healthy: 0,
            unhealthy: 0,
            disabled: 0
        };
        
        for (const p of providers) {
            if (p.config.isDisabled) {
                stats.disabled++;
            } else if (p.config.isHealthy) {
                stats.healthy++;
            } else {
                stats.unhealthy++;
            }
        }
        
        return stats;
    }

    /**
     * Gets all available models across all provider pools, with optional format conversion.
     * @param {string} [endpointType] - Optional endpoint type for format conversion (OPENAI_MODEL_LIST or GEMINI_MODEL_LIST).
     * @returns {Promise<Object|Array>} Formatted model list or raw array of model objects.
     */
    async getAllAvailableModels(endpointType = null) {
        const allModels = [];
        
        // 获取所有已注册的提供商和号池中的提供商
        const registeredProviders = getRegisteredProviders();
        const allProviderTypes = Array.from(new Set([...registeredProviders]));

        for (const providerType of allProviderTypes) {
            if (this.providerStatus[providerType]) {
                let models = getProviderModels(providerType);
                const configuredSupportedModels = normalizeModelIds(
                    this.providerStatus[providerType].flatMap(providerStatus =>
                        getConfiguredSupportedModels(providerType, providerStatus.config)
                    )
                );

                if (configuredSupportedModels.length > 0) {
                    models = configuredSupportedModels;
                }
                
                // 如果硬编码的模型列表为空，或者该类型的提供商在号池中没有配置节点，尝试从服务获取
                // 只有在非号池模式，或者号池中有节点时才尝试获取，避免无节点时读取全局默认配置
                if (models.length === 0 && (!this.providerStatus[providerType] || this.providerStatus[providerType].length > 0)) {
                    try {
                        // 确定使用的配置：优先使用号池中第一个节点的配置，否则使用全局配置
                        let targetConfig = this.globalConfig;
                        if (this.providerStatus[providerType] && this.providerStatus[providerType].length > 0) {
                            targetConfig = this.providerStatus[providerType][0].config;
                        } else {
                            // 如果该提供商是属于号池类型的提供商（在 PROVIDER_MAPPINGS 中），且号池为空，则不应尝试读取全局配置
                            const { PROVIDER_MAPPINGS } = await import('../utils/provider-utils.js');
                            const isPoolable = PROVIDER_MAPPINGS.some(m => m.providerType === providerType);
                            if (isPoolable) {
                                this._log('debug', `Skipping model fetch for poolable provider ${providerType} with empty pool to avoid reading default config.`);
                                continue;
                            }
                        }

                        const tempConfig = {
                            ...this.globalConfig,
                            ...targetConfig,
                            MODEL_PROVIDER: providerType
                        };
                        const serviceAdapter = getServiceAdapter(tempConfig);
                        
                        if (typeof serviceAdapter.listModels === 'function') {
                            const nativeModels = await serviceAdapter.listModels();
                            // 统一转换为 OpenAI 格式以便提取 ID
                            const convertedData = convertData(nativeModels, 'modelList', providerType, MODEL_PROVIDER.OPENAI_CUSTOM);
                            if (convertedData && Array.isArray(convertedData.data)) {
                                const fetchedModels = convertedData.data.map(m => m.id);
                                if (fetchedModels.length > 0) {
                                    models = fetchedModels;
                                }
                            }
                        }
                    } catch (err) {
                        this._log('debug', `Failed to fetch model list for ${providerType} from service: ${err.message}`);
                        // 保持原有的 models (可能是硬编码的空列表或 getProviderModels 返回的结果)
                    }
                }

                for (const model of models) {
                    allModels.push({
                        id: `${providerType}:${model}`,
                        provider: providerType,
                        model: model
                    });
                }
            }
        }
        
        // 如果没有指定 endpointType，返回原始数组
        if (!endpointType) {
            return allModels;
        }
        
        // 根据 endpointType 转换为对应格式        
        if (endpointType === ENDPOINT_TYPE.OPENAI_MODEL_LIST) {
            // OpenAI 格式聚合
            return {
                object: "list",
                data: allModels.map(m => ({
                    id: m.id,
                    object: "model",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: m.provider
                }))
            };
        } else if (endpointType === ENDPOINT_TYPE.GEMINI_MODEL_LIST) {
            // Gemini 格式聚合
            return {
                models: allModels.map(m => ({
                    name: `models/${m.id}`,
                    baseModelId: m.model,
                    version: "v1",
                    displayName: `${m.model} (${m.provider})`,
                    description: `Model ${m.model} provided by ${m.provider}`,
                    supportedGenerationMethods: ["generateContent", "countTokens"]
                }))
            };
        }
        
        // 默认返回空列表
        return { data: [] };
    }

    /**
     * 标记提供商需要刷新并推入刷新队列
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置（包含 uuid）
     */
    markProviderNeedRefresh(providerType, providerConfig) {

        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in markProviderNeedRefresh');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            // 防并发机制 A: 如果已经在刷新中，忽略请求
            if (this.refreshingUuids.has(provider.uuid)) {
                this._log('debug', `Provider ${providerConfig.uuid} is already in refresh queue, ignoring duplicate request.`);
                return;
            }

            // 防并发机制 B: 如果 30 秒内刚刷新过，忽略请求（防止滞后的 401 错误导致重复刷新）
            const now = Date.now();
            const lastRefreshTime = provider.config.lastRefreshTime || 0;
            if (now - lastRefreshTime < 30000) {
                this._log('info', `Provider ${providerConfig.uuid} was refreshed recently (${Math.round((now - lastRefreshTime)/1000)}s ago), ignoring refresh request.`);
                return;
            }

            provider.config.needsRefresh = true;
            this._log('info', `Marked provider ${providerConfig.uuid} as needsRefresh. Enqueuing...`);
            
            // 推入异步刷新队列
            this._enqueueRefresh(providerType, provider, true);
            
            this._debouncedSave(providerType);
        }
    }

    /**
     * Marks a provider as unhealthy (e.g., after an API error).
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to mark.
     * @param {string} [errorMessage] - Optional error message to store.
     */
    markProviderUnhealthy(providerType, providerConfig, errorMessage = null) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in markProviderUnhealthy');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            const wasHealthy = provider.config.isHealthy;
            const now = Date.now();
            const lastErrorTime = provider.config.lastErrorTime ? new Date(provider.config.lastErrorTime).getTime() : 0;
            const errorWindowMs = 10000; // 10 秒窗口期

            // 如果距离上次错误超过窗口期，重置错误计数
            if (now - lastErrorTime > errorWindowMs) {
                provider.config.errorCount = 1;
            } else {
                provider.config.errorCount++;
            }

            provider.config.lastErrorTime = new Date().toISOString();
            // 更新 lastUsed 时间，避免因 LRU 策略导致失败节点被重复选中
            provider.config.lastUsed = new Date().toISOString();
            
            // 只要报错，就清除刷新标记，由下次触发或健康检查决定是否需要刷新
            provider.config.needsRefresh = false;
            provider.config.refreshCount = 0;

            // 保存错误信息
            if (errorMessage) {
                provider.config.lastErrorMessage = errorMessage;
            }

            if (this.maxErrorCount > 0 && provider.config.errorCount >= this.maxErrorCount) {
                provider.config.isHealthy = false;
                
                // 健康状态变化日志
                if (wasHealthy) {
                    this._logHealthStatusChange(providerType, provider.config, 'healthy', 'unhealthy', errorMessage);
                }
                
                this._log('warn', `Marked provider as unhealthy: ${providerConfig.uuid} for type ${providerType}. Total errors: ${provider.config.errorCount}`);
            } 

            this._debouncedSave(providerType);
        }
    }

    /**
     * Marks a provider as unhealthy immediately (without accumulating error count).
     * Used for definitive authentication errors like 401/403.
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to mark.
     * @param {string} [errorMessage] - Optional error message to store.
     */
    markProviderUnhealthyImmediately(providerType, providerConfig, errorMessage = null) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in markProviderUnhealthyImmediately');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            const wasHealthy = provider.config.isHealthy;
            provider.config.isHealthy = false;
            provider.config.needsRefresh = false; // 报错时不健康，清除刷新标记，防止卡死
            provider.config.refreshCount = 0;
            provider.config.errorCount = this.maxErrorCount; // Set to max to indicate definitive failure
            provider.config.lastErrorTime = new Date().toISOString();
            provider.config.lastUsed = new Date().toISOString();

            if (errorMessage) {
                provider.config.lastErrorMessage = errorMessage;
            }

            // 健康状态变化日志
            if (wasHealthy) {
                this._logHealthStatusChange(providerType, provider.config, 'healthy', 'unhealthy', errorMessage);
            }

            this._log('warn', `Immediately marked provider as unhealthy: ${providerConfig.uuid} for type ${providerType}. Reason: ${errorMessage || 'Authentication error'}`);
           
            this._debouncedSave(providerType);
        }
    }

    /**
     * Marks a provider as unhealthy with a scheduled recovery time.
     * Used for quota exhaustion errors (402) where the quota will reset at a specific time.
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to mark.
     * @param {string} [errorMessage] - Optional error message to store.
     * @param {Date|string} [recoveryTime] - Optional recovery time when the provider should be marked healthy again.
     */
    markProviderUnhealthyWithRecoveryTime(providerType, providerConfig, errorMessage = null, recoveryTime = null) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in markProviderUnhealthyWithRecoveryTime');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            provider.config.isHealthy = false;
            provider.config.needsRefresh = false; // 报错时不健康，清除刷新标记，防止卡死
            provider.config.refreshCount = 0;
            provider.config.errorCount = this.maxErrorCount; // Set to max to indicate definitive failure
            provider.config.lastErrorTime = new Date().toISOString();
            provider.config.lastUsed = new Date().toISOString();

            if (errorMessage) {
                provider.config.lastErrorMessage = errorMessage;
            }

            // Set recovery time if provided
            if (recoveryTime) {
                const recoveryDate = recoveryTime instanceof Date ? recoveryTime : new Date(recoveryTime);
                provider.config.scheduledRecoveryTime = recoveryDate.toISOString();
                this._log('warn', `Marked provider as unhealthy with recovery time: ${providerConfig.uuid} for type ${providerType}. Recovery at: ${recoveryDate.toISOString()}. Reason: ${errorMessage || 'Quota exhausted'}`);
            } else {
                this._log('warn', `Marked provider as unhealthy: ${providerConfig.uuid} for type ${providerType}. Reason: ${errorMessage || 'Quota exhausted'}`);
            }

            this._debouncedSave(providerType);
        }
    }

    /**
     * Marks a provider as healthy.
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to mark.
     * @param {boolean} resetUsageCount - Whether to reset usage count (optional, default: false).
     * @param {string} [healthCheckModel] - Optional model name used for health check.
     */
    markProviderHealthy(providerType, providerConfig, resetUsageCount = false, healthCheckModel = null) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in markProviderHealthy');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            const wasHealthy = provider.config.isHealthy;
            provider.config.isHealthy = true;
            provider.config.errorCount = 0;
            provider.config.refreshCount = 0;
            provider.config.needsRefresh = false;
            provider.config.lastRefreshTime = Date.now(); // 标记为健康时也视为刚刷新完成
            provider.config.lastErrorTime = null;
            provider.config.lastErrorMessage = null;
            provider.config._lastSelectionSeq = 0;
            
            // 更新健康检测信息
            if (healthCheckModel) {
                provider.config.lastHealthCheckTime = new Date().toISOString();
                provider.config.lastHealthCheckModel = healthCheckModel;
            }
            
            // 只有在明确要求重置使用计数时才重置
            if (resetUsageCount) {
                provider.config.usageCount = 0;
            }else{
                provider.config.usageCount++;
                provider.config.lastUsed = new Date().toISOString();
            }
            
            // 健康状态变化日志
            if (!wasHealthy) {
                this._logHealthStatusChange(providerType, provider.config, 'unhealthy', 'healthy', null);
            }
            
            this._log('info', `Marked provider as healthy: ${provider.config.uuid} for type ${providerType}${resetUsageCount ? ' (usage count reset)' : ''}`);
            
            this._debouncedSave(providerType);
        }
    }

    /**
     * 重置提供商的刷新状态（needsRefresh 和 refreshCount）
     * 并将其标记为健康，以便立即投入使用
     * @param {string} providerType - 提供商类型
     * @param {string} uuid - 提供商 UUID
     */
    resetProviderRefreshStatus(providerType, uuid) {
        if (!providerType || !uuid) {
            this._log('error', 'Invalid parameters in resetProviderRefreshStatus');
            return;
        }

        const provider = this._findProvider(providerType, uuid);
        if (provider) {
            provider.config.needsRefresh = false;
            provider.config.refreshCount = 0;
            provider.config.lastRefreshTime = Date.now(); // 显式重置时也更新刷新时间
            // 更新为可用
            provider.config.lastHealthCheckTime = new Date().toISOString();
            // 标记为健康，以便立即投入使用
            this._log('info', `Reset refresh status and marked healthy for provider ${uuid} (${providerType})`);

            this._debouncedSave(providerType);
        }
    }

    /**
     * 重置提供商的计数器（错误计数和使用计数）
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to mark.
     */
    resetProviderCounters(providerType, providerConfig) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in resetProviderCounters');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            provider.config.errorCount = 0;
            provider.config.usageCount = 0;
            provider.config._lastSelectionSeq = 0;
            this._log('info', `Reset provider counters: ${provider.config.uuid} for type ${providerType}`);
            
            this._debouncedSave(providerType);
        }
    }

    /**
     * 禁用指定提供商
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置
     */
    disableProvider(providerType, providerConfig) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in disableProvider');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            provider.config.isDisabled = true;
            this._log('info', `Disabled provider: ${providerConfig.uuid} for type ${providerType}`);
            this._debouncedSave(providerType);
        }
    }

    /**
     * 启用指定提供商
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置
     */
    enableProvider(providerType, providerConfig) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in enableProvider');
            return;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            provider.config.isDisabled = false;
            this._log('info', `Enabled provider: ${providerConfig.uuid} for type ${providerType}`);
            this._debouncedSave(providerType);
        }
    }

    /**
     * 刷新指定提供商的 UUID
     * 用于在认证错误（如 401）时更换 UUID，以便重新尝试
     * @param {string} providerType - 提供商类型
     * @param {object} providerConfig - 提供商配置（包含当前 uuid）
     * @returns {string|null} 新的 UUID，如果失败则返回 null
     */
    refreshProviderUuid(providerType, providerConfig) {
        if (!providerConfig?.uuid) {
            this._log('error', 'Invalid providerConfig in refreshProviderUuid');
            return null;
        }

        const provider = this._findProvider(providerType, providerConfig.uuid);
        if (provider) {
            const oldUuid = provider.config.uuid;
            // 生成新的 UUID
            const newUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            
            // 更新 provider 的 UUID
            provider.uuid = newUuid;
            provider.config.uuid = newUuid;
            
            // 同时更新 providerPools 中的原始数据
            const poolArray = this.providerPools[providerType];
            if (poolArray) {
                const originalProvider = poolArray.find(p => p.uuid === oldUuid);
                if (originalProvider) {
                    originalProvider.uuid = newUuid;
                }
            }
            
            this._log('info', `Refreshed provider UUID: ${oldUuid} -> ${newUuid} for type ${providerType}`);
            this._debouncedSave(providerType);
            
            return newUuid;
        }
        
        this._log('warn', `Provider not found for UUID refresh: ${providerConfig.uuid} in ${providerType}`);
        return null;
    }

    /**
     * 检查并恢复已到恢复时间的提供商
     * @param {string} [providerType] - 可选，指定要检查的提供商类型。如果不提供，检查所有类型
     * @private
     */
    _checkAndRecoverScheduledProviders(providerType = null) {
        const now = new Date();
        const typesToCheck = providerType ? [providerType] : Object.keys(this.providerStatus);
        
        for (const type of typesToCheck) {
            const providers = this.providerStatus[type] || [];
            for (const providerStatus of providers) {
                const config = providerStatus.config;
                
                // 检查是否有 scheduledRecoveryTime 且已到恢复时间
                if (config.scheduledRecoveryTime && !config.isHealthy) {
                    const recoveryTime = new Date(config.scheduledRecoveryTime);
                    if (now >= recoveryTime) {
                        this._log('info', `Auto-recovering provider ${config.uuid} (${type}). Scheduled recovery time reached: ${recoveryTime.toISOString()}`);
                        
                        // 恢复健康状态
                        config.isHealthy = true;
                        config.errorCount = 0;
                        config.lastErrorTime = null;
                        config.lastErrorMessage = null;
                        config.scheduledRecoveryTime = null; // 清除恢复时间
                        
                        // 保存更改
                        this._debouncedSave(type);
                    }
                }
            }
        }
    }

    /**
     * Performs initial (startup) health checks on selected providers.
     * Respects SCHEDULED_HEALTH_CHECK.providerTypes configuration.
     * Called once at server startup.
     *
     * 设计决策：如果没有选择任何 provider types，则不进行检查任何 provider。
     * 这是有意为之的设计 - 如果用户没有明确选择，则不需要自动健康检查。
     * 区别于原来的逻辑（检查所有 provider），现在的行为更符合用户预期。
     */
    async performInitialHealthChecks() {
        const scheduledConfig = this.globalConfig?.SCHEDULED_HEALTH_CHECK;
        const selectedProviderTypes = scheduledConfig?.providerTypes;
        
        // 如果没有选择任何 provider types，不进行检查
        // 设计决策：如果用户没有选择任何 provider，明确不执行健康检查是合理的
        if (!Array.isArray(selectedProviderTypes) || selectedProviderTypes.length === 0) {
            return;
        }
        
        this._log('info', 'Performing health checks on selected providers...');
        const now = new Date();
        
        // 首先检查并恢复已到恢复时间的提供商
        this._checkAndRecoverScheduledProviders();
        
        for (const providerType in this.providerStatus) {
            // Only check selected provider types
            if (!selectedProviderTypes.includes(providerType)) {
                continue;
            }
            
            for (const providerStatus of this.providerStatus[providerType]) {
                const providerConfig = providerStatus.config;

                // 如果提供商有 scheduledRecoveryTime 且未到恢复时间，跳过健康检查
                if (providerConfig.scheduledRecoveryTime && !providerConfig.isHealthy) {
                    const recoveryTime = new Date(providerConfig.scheduledRecoveryTime);
                    if (now < recoveryTime) {
                        this._log('debug', `Skipping health check for ${providerConfig.uuid} (${providerType}). Waiting for scheduled recovery at ${recoveryTime.toISOString()}`);
                        continue;
                    }
                }

                // Only attempt to health check unhealthy providers after a certain interval
                if (!providerStatus.config.isHealthy && providerStatus.config.lastErrorTime &&
                    (now.getTime() - new Date(providerStatus.config.lastErrorTime).getTime() < this.healthCheckInterval)) {
                    this._log('debug', `Skipping health check for ${providerConfig.uuid} (${providerType}). Last error too recent.`);
                    continue;
                }

                try {
                    // Perform actual health check based on provider type
                    const healthResult = await this._checkProviderHealth(providerType, providerConfig);
                    
                    if (healthResult === null) {
                        this._log('debug', `Health check for ${providerConfig.uuid} (${providerType}) skipped: Check not implemented.`);
                        this.resetProviderCounters(providerType, providerConfig);
                        continue;
                    }
                    
                    if (healthResult.success) {
                        if (!providerStatus.config.isHealthy) {
                            // Provider was unhealthy but is now healthy
                            // 恢复健康时不重置使用计数，保持原有值
                            this.markProviderHealthy(providerType, providerConfig, true, healthResult.modelName);
                            this._log('info', `Health check for ${providerConfig.uuid} (${providerType}): Marked Healthy (actual check)`);
                        } else {
                            // Provider was already healthy and still is
                            // 只在初始化时重置使用计数
                            this.markProviderHealthy(providerType, providerConfig, true, healthResult.modelName);
                            this._log('debug', `Health check for ${providerConfig.uuid} (${providerType}): Still Healthy`);
                        }
                    } else {
                        // Provider is not healthy
                        this._log('warn', `Health check for ${providerConfig.uuid} (${providerType}) failed: ${healthResult.errorMessage || 'Provider is not responding correctly.'}`);
                        this.markProviderUnhealthy(providerType, providerConfig, healthResult.errorMessage);
                        
                        // 更新健康检测时间和模型（即使失败也记录）
                        providerStatus.config.lastHealthCheckTime = new Date().toISOString();
                        if (healthResult.modelName) {
                            providerStatus.config.lastHealthCheckModel = healthResult.modelName;
                        }
                    }

                } catch (error) {
                    this._log('error', `Health check for ${providerConfig.uuid} (${providerType}) failed: ${error.message}`);
                    // If a health check fails, mark it unhealthy, which will update error count and lastErrorTime
                    this.markProviderUnhealthy(providerType, providerConfig, error.message);
                }
            }
        }
    }

    /**
     * Performs scheduled health checks on all providers.
     * This method is designed to be called periodically to proactively check provider health.
     * It respects provider-level isDisabled flag.
     */
    async performHealthChecks() {
        const scheduledConfig = this.globalConfig?.SCHEDULED_HEALTH_CHECK;
        const checkStartTime = Date.now();
        
        // Check if scheduled health checks are disabled
        if (!scheduledConfig?.enabled) {
            this._log('debug', '[ScheduledHealthCheck] Scheduled health checks are disabled via configuration');
            return;
        }
        
        // Get selected provider types
        let selectedProviderTypes = scheduledConfig?.providerTypes;
        
        // Validate providerTypes is an array
        if (!Array.isArray(selectedProviderTypes) || selectedProviderTypes.length === 0) {
            this._log('info', '[ScheduledHealthCheck] No provider types selected, skipping health check');
            return;
        }
        
        // Count providers to be checked
        let totalProviders = 0;
        let providersToCheck = [];
        
        for (const providerType in this.providerStatus) {
            // Only check selected provider types
            if (!selectedProviderTypes.includes(providerType)) {
                this._log('debug', `[ScheduledHealthCheck] Skipping provider type ${providerType}: not in selected types`);
                continue;
            }
            
            for (const provider of this.providerStatus[providerType]) {
                // Skip manually disabled providers
                if (provider.config.isDisabled === true) {
                    this._log('debug', `[ScheduledHealthCheck] Skipping ${provider.config.uuid} (${providerType}): manually disabled`);
                    continue;
                }
                
                totalProviders++;
                providersToCheck.push({ providerType, provider, uuid: provider.config.uuid, customName: provider.config.customName });
            }
        }
        
        this._log('info', `[ScheduledHealthCheck] Starting scheduled health checks: ${totalProviders} provider(s) to check (interval: ${scheduledConfig.interval}ms, types: ${selectedProviderTypes.join(', ')})`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const { providerType, provider, uuid, customName } of providersToCheck) {
            const providerCheckStart = Date.now();
            const baseProviderType = this._getBaseProviderType(providerType);
            const checkModelName = provider.config.checkModelName || 
                                ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[providerType] || 
                                ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[baseProviderType] || 
                                'unknown';
            const displayName = customName || uuid.substring(0, 8);

            try {
                // Perform health check (health check is based on providerTypes configuration, not per-provider checkHealth flag)
                const result = await this._checkProviderHealth(providerType, provider.config);
                const checkDuration = Date.now() - providerCheckStart;
                
                if (!result.success) {
                    // Provider is unhealthy
                    failCount++;
                    this._log('warn', `[ScheduledHealthCheck] ${displayName} (${providerType}) FAILED: ${result.errorMessage || 'Provider is not responding correctly.'} (${checkDuration}ms)`);
                    this.markProviderUnhealthyImmediately(providerType, provider.config, result.errorMessage);
                } else {
                    // Provider is healthy
                    successCount++;
                    this._log('info', `[ScheduledHealthCheck] ${displayName} (${providerType}) PASSED: model=${result.modelName || checkModelName} (${checkDuration}ms)`);
                    this.markProviderHealthy(providerType, provider.config, false, result.modelName);
                }
            } catch (error) {
                const checkDuration = Date.now() - providerCheckStart;
                failCount++;
                this._log('error', `[ScheduledHealthCheck] ${displayName} (${providerType}) EXCEPTION: ${error.message} (${checkDuration}ms)`);
                this.markProviderUnhealthyImmediately(providerType, provider.config, error.message);
            }
        }
        
        const totalDuration = Date.now() - checkStartTime;
        this._log('info', `[ScheduledHealthCheck] Completed: ${successCount} passed, ${failCount} failed, ${totalDuration}ms total`);
    }

    /**
     * 对指定 providerType 执行健康检查（仅检查该类型下的所有供应商节点）
     * 用于 health-check-timer.js 按类型定时触发健康检查
     * @param {string} providerType - 提供商类型
     */
    async performHealthChecksByType(providerType) {
        const scheduledConfig = this.globalConfig?.SCHEDULED_HEALTH_CHECK;
        const checkStartTime = Date.now();

        // Check if scheduled health checks are disabled
        if (!scheduledConfig?.enabled) {
            this._log('debug', '[ScheduledHealthCheck] Scheduled health checks are disabled via configuration');
            return;
        }

        // Get selected provider types
        const selectedProviderTypes = scheduledConfig?.providerTypes;

        // Validate providerTypes is an array
        if (!Array.isArray(selectedProviderTypes) || selectedProviderTypes.length === 0) {
            this._log('info', '[ScheduledHealthCheck] No provider types selected, skipping health check');
            return;
        }

        // Check if this providerType is selected
        if (!selectedProviderTypes.includes(providerType)) {
            this._log('debug', `[ScheduledHealthCheck] Skipping provider type ${providerType}: not in selected types`);
            return;
        }

        const providers = this.providerStatus[providerType];
        if (!providers || providers.length === 0) {
            this._log('debug', `[ScheduledHealthCheck] No providers found for type ${providerType}`);
            return;
        }

        let totalProviders = 0;
        let providersToCheck = [];

        for (const provider of providers) {
            // Skip manually disabled providers
            if (provider.config.isDisabled === true) {
                this._log('debug', `[ScheduledHealthCheck] Skipping ${provider.config.uuid} (${providerType}): manually disabled`);
                continue;
            }

            totalProviders++;
            providersToCheck.push({ provider, uuid: provider.config.uuid, customName: provider.config.customName });
        }

        this._log('info', `[ScheduledHealthCheck] Starting scheduled health check for type ${providerType}: ${totalProviders} provider(s) to check`);

        let successCount = 0;
        let failCount = 0;

        // 使用 Promise.all 并行执行所有健康检查，提升效率
        const MAX_CONCURRENT = 4; // 每批最多4个并发检查
        for (let i = 0; i < providersToCheck.length; i += MAX_CONCURRENT) {
            const batch = providersToCheck.slice(i, i + MAX_CONCURRENT);
            const batchResults = await Promise.all(batch.map(async ({ provider, uuid, customName }) => {
                const providerCheckStart = Date.now();
                const baseProviderType = this._getBaseProviderType(providerType);
                const checkModelName = provider.config.checkModelName ||
                                    ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[providerType] ||
                                    ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[baseProviderType] ||
                                    'unknown';
                const displayName = customName || uuid.substring(0, 8);

                try {
                    // Perform health check
                    const result = await this._checkProviderHealth(providerType, provider.config);
                    const checkDuration = Date.now() - providerCheckStart;

                    if (!result.success) {
                        return { success: false, displayName, providerType, errorMessage: result.errorMessage, checkDuration, provider };
                    } else {
                        return { success: true, displayName, providerType, modelName: result.modelName, checkDuration, provider };
                    }
                } catch (error) {
                    const checkDuration = Date.now() - providerCheckStart;
                    return { success: false, displayName, providerType, errorMessage: error.message, checkDuration, provider, isException: true };
                }
            }));

            // 处理批次结果
            for (const result of batchResults) {
                if (result.success) {
                    successCount++;
                    this._log('info', `[ScheduledHealthCheck] ${result.displayName} (${result.providerType}) PASSED: model=${result.modelName || checkModelName} (${result.checkDuration}ms)`);
                    this.markProviderHealthy(result.providerType, result.provider.config, false, result.modelName);
                } else if (result.isException) {
                    failCount++;
                    this._log('error', `[ScheduledHealthCheck] ${result.displayName} (${result.providerType}) EXCEPTION: ${result.errorMessage} (${result.checkDuration}ms)`);
                    this.markProviderUnhealthyImmediately(result.providerType, result.provider.config, result.errorMessage);
                } else {
                    failCount++;
                    this._log('warn', `[ScheduledHealthCheck] ${result.displayName} (${result.providerType}) FAILED: ${result.errorMessage || 'Provider is not responding correctly.'} (${result.checkDuration}ms)`);
                    this.markProviderUnhealthyImmediately(result.providerType, result.provider.config, result.errorMessage);
                }
            }
        }

        const totalDuration = Date.now() - checkStartTime;
        this._log('info', `[ScheduledHealthCheck] Completed for ${providerType}: ${successCount} passed, ${failCount} failed, ${totalDuration}ms total`);
    }

    /**
     * 构建健康检查请求（返回多种格式用于重试）
     * @private
     * @returns {Array} 请求格式数组，按优先级排序
     */
    _buildHealthCheckRequests(providerType, modelName) {
        const baseMessage = { role: 'user', content: 'Hi' };
        const requests = [];
        
        // Gemini 使用 contents 格式
        if (providerType.startsWith('gemini')) {
            requests.push({
                contents: [{
                    role: 'user',
                    parts: [{ text: baseMessage.content }]
                }]
            });
            return requests;
        }
        
        // Kiro OAuth 只支持 messages 格式
        if (providerType.startsWith('claude-kiro')) {
            requests.push({
                messages: [baseMessage],
                model: modelName,
                max_tokens: 1
            });
            return requests;
        }
        
        // OpenAI Custom Responses 使用特殊格式
        if (this._getBaseProviderType(providerType) === MODEL_PROVIDER.OPENAI_CUSTOM_RESPONSES) {
            requests.push({
                input: [baseMessage],
                model: modelName
            });
            return requests;
        }

        // Codex OAuth 健康检查直接调用原生适配器，需要使用 Codex responses 原生 input 格式
        if (this._getBaseProviderType(providerType) === MODEL_PROVIDER.CODEX_API) {
            requests.push({
                model: modelName,
                input: [{
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_text',
                        text: baseMessage.content
                    }]
                }]
            });
            return requests;
        }
        
        // 其他提供商（OpenAI、Claude、Qwen）使用标准 messages 格式
        requests.push({
            messages: [baseMessage],
            model: modelName
        });
        
        return requests;
    }

    /**
     * 根据提供商类型获取基准提供商类型（用于查找配置和模型）
     * 例如：openai-custom-1 -> openai-custom
     * @private
     */
    _getBaseProviderType(providerType) {
        if (ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[providerType]) {
            return providerType;
        }
        
        // 尝试前缀匹配
        for (const key of Object.keys(ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS)) {
            if (providerType === key || providerType.startsWith(key + '-')) {
                return key;
            }
        }
        
        return providerType;
    }

    /**
     * Performs an actual health check for a specific provider.
     * 
     * 设计决策：不检查 providerConfig.checkHealth 标志。
     * 健康检查是否执行由上层调用方（performHealthChecks / performInitialHealthChecks）
     * 通过 providerTypes 数组来决定，不在每个 provider 级别控制。
     * 这样简化了逻辑，避免 per-provider 的 checkHealth flag 变得无用。
     * 
     * @param {string} providerType - The type of the provider.
     * @param {object} providerConfig - The configuration of the provider to check.
     * @returns {Promise<{success: boolean, modelName: string, errorMessage: string}>} - Health check result object.
     */
    async _checkProviderHealth(providerType, providerConfig) {
        // 确定健康检查使用的模型名称
        const baseProviderType = this._getBaseProviderType(providerType);
        let modelName = providerConfig.checkModelName ||
                        ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[providerType] ||
                        ProviderPoolManager.DEFAULT_HEALTH_CHECK_MODELS[baseProviderType];

        // 安全验证：确保 modelName 是非空字符串
        if (typeof modelName !== 'string' || modelName.trim() === '') {
            this._log('warn', `Invalid model name for health check: ${providerType}. Expected non-empty string, got: ${JSON.stringify(modelName)}`);
            return {
                success: false,
                modelName: null,
                errorMessage: `Invalid model name for provider type '${providerType}'.`
            };
        }
        modelName = modelName.trim();

        // ========== 实际 API 健康检查（带超时保护）==========
        const tempConfig = {
            ...providerConfig,
            MODEL_PROVIDER: providerType
        };
        const serviceAdapter = getServiceAdapter(tempConfig);

        // 获取所有可能的请求格式
        const healthCheckRequests = this._buildHealthCheckRequests(providerType, modelName);

        // 健康检查超时时间（15秒，避免长时间阻塞）
        const healthCheckTimeout = 15000;
        let lastError = null;

        // 重试机制：尝试不同的请求格式
        for (let i = 0; i < healthCheckRequests.length; i++) {
            const healthCheckRequest = healthCheckRequests[i];
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), healthCheckTimeout);

            try {
                // 尝试将 signal 注入请求体，供支持的适配器使用
                const requestWithSignal = {
                    ...healthCheckRequest,
                    // signal: abortController.signal
                };

                await serviceAdapter.generateContent(modelName, requestWithSignal);
                
                clearTimeout(timeoutId);
                // 注意：使用量计数由调用方处理（performHealthChecks/performInitialHealthChecks）
                // 这里只返回成功结果，让调用方统一处理状态更新和计数
                return { success: true, modelName, errorMessage: null };
            } catch (error) {
                clearTimeout(timeoutId);
                lastError = error;
            }
        }

        // 所有尝试都失败
        this._log('warn', `[HealthCheck] ${providerType} failed after ${healthCheckRequests.length} attempts: ${lastError?.message}`);
        return { success: false, modelName, errorMessage: lastError?.message || 'All health check attempts failed' };
    }

    /**
     * 优化1: 添加防抖保存方法
     * 延迟保存操作，避免频繁的文件 I/O
     * @private
     */
    _debouncedSave(providerType) {
        // 将待保存的 providerType 添加到集合中
        // Set.add 是原子操作，异步上下文中安全
        this.pendingSaves.add(providerType);

        // 清除之前的定时器
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }

        // 设置新的定时器
        this.saveTimer = setTimeout(() => {
            this._flushPendingSaves();
        }, this.saveDebounceTime);
        // 防止定时器阻止进程退出
        if (this.saveTimer.unref) this.saveTimer.unref();
    }

    /**
     * 批量保存所有待保存的 providerType（优化为单次文件写入）
     * @private
     */
    async _flushPendingSaves() {
        // 原子交换：获取当前待保存列表并清空
        // 这样新的保存请求会进入下一批次
        const typesToSave = [];
        for (const type of this.pendingSaves) {
            typesToSave.push(type);
        }
        this.pendingSaves.clear();

        // 清除定时器引用
        this.saveTimer = null;

        if (typesToSave.length === 0) return;
        
        try {
            const filePath = this.globalConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
            let currentPools = {};
            
            // 一次性读取文件
            try {
                const fileContent = await fs.promises.readFile(filePath, 'utf8');
                currentPools = JSON.parse(fileContent);
            } catch (readError) {
                if (readError.code === 'ENOENT') {
                    this._log('info', 'configs/provider_pools.json does not exist, creating new file.');
                } else {
                    throw readError;
                }
            }

            // 更新所有待保存的 providerType
            for (const providerType of typesToSave) {
                if (this.providerStatus[providerType]) {
                    currentPools[providerType] = this.providerStatus[providerType].map(p => {
                        // Convert Date objects to ISOString if they exist
                        const config = { ...p.config };
                        if (config.lastUsed instanceof Date) {
                            config.lastUsed = config.lastUsed.toISOString();
                        }
                        if (config.lastErrorTime instanceof Date) {
                            config.lastErrorTime = config.lastErrorTime.toISOString();
                        }
                        if (config.lastHealthCheckTime instanceof Date) {
                            config.lastHealthCheckTime = config.lastHealthCheckTime.toISOString();
                        }
                        return config;
                    });
                } else {
                    this._log('warn', `Attempted to save unknown providerType: ${providerType}`);
                }
            }
            
            // 一次性写入文件
            await fs.promises.writeFile(filePath, JSON.stringify(currentPools, null, 2), 'utf8');
            this._log('info', `configs/provider_pools.json updated successfully for types: ${typesToSave.join(', ')}`);
        } catch (error) {
            this._log('error', `Failed to write provider_pools.json: ${error.message}`);
        }
    }

}

