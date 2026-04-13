/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { getProviderPoolManager } from './service-manager.js';
import { HEALTH_CHECK } from '../utils/constants.js';

// 获取 CONFIG 的辅助函数
// 生产环境: config-manager.js 设置到 module 级别，然后 api-server.js 设置到 globalThis.CONFIG
// 测试环境: 通过 setup 设置到 globalThis.CONFIG
function getConfig() {
    // 优先使用 globalThis.CONFIG（运行时由 api-server.js 设置）
    // 回退到直接导入的 CONFIG（测试环境由 jest.setup.js 设置）
    return globalThis.CONFIG ?? null;
}

// 使用模块级私有变量存储状态，避免全局污染
let timerState = {
    timerId: null,
    activeInterval: null,
    checkPromise: null
};

// 记录每个 providerType 上次检查时间（毫秒）
let lastCheckTimes = new Map();

// 注意：返回的是原始 timerState 对象的引用，不要直接替换整个对象
const _getState = () => timerState;
// 深拷贝 lastCheckTimes，避免外部修改影响模块内部状态（仅在需要时拷贝）
const _getLastCheckTimes = () => new Map(lastCheckTimes);

/**
 * 重置模块状态（仅供测试使用）
 * 清除所有计时器和状态
 */
export function _resetModuleState() {
    const state = _getState();
    if (state.timerId) {
        clearInterval(state.timerId);
    }
    state.timerId = null;
    state.activeInterval = null;
    state.checkPromise = null;
    lastCheckTimes.clear();
}

/**
 * 获取可变引用用于修改 lastCheckTimes（仅供测试使用）
 */
export function _getMutableLastCheckTimes() {
    return lastCheckTimes;
}

/**
 * 执行健康检查
 * 支持按供应商自定义间隔和健康检查常数：
 * - 异常状态供应商：使用原有的 interval/customIntervals
 * - 健康状态供应商：使用 healthyCheckInterval/healthyCustomIntervals（若为0则跳过）
 */
async function executeHealthCheck() {
    const poolManager = getProviderPoolManager();
    if (!poolManager) {
        logger.warn('[HealthCheckTimer] No pool manager available');
        return;
    }

    const config = getConfig()?.SCHEDULED_HEALTH_CHECK;
    if (!config?.enabled) return;

    const globalInterval = config.interval || HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    const customIntervals = config.customIntervals || {};
    const healthyCheckInterval = config.healthyCheckInterval ?? HEALTH_CHECK.HEALTHY_CHECK_INTERVAL_MS;
    const healthyCustomIntervals = config.healthyCustomIntervals || {};
    const configuredProviderTypes = config.providerTypes || [];
    const now = Date.now();
    // 使用深拷贝避免外部修改影响，同时获取可变引用用于后续更新
    const lastCheckTimesCopy = _getLastCheckTimes();
    const mutableLastCheckTimes = _getMutableLastCheckTimes();

    // 清理不再配置的 providerType 条目（使用旧格式的key需要清理）
    for (const key of lastCheckTimesCopy.keys()) {
        const [pt] = key.split(':');
        if (!configuredProviderTypes.includes(pt)) {
            mutableLastCheckTimes.delete(key);
        }
    }

    // 防止内存泄漏：限制 Map 大小（仅在超过阈值时清理）
    if (mutableLastCheckTimes.size > HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES) {
        logger.warn(`[HealthCheckTimer] lastCheckTimes Map size (${mutableLastCheckTimes.size}) exceeds limit, clearing oldest entries`);
        // 使用迭代器直接删除最旧的条目，避免完整排序
        const targetSize = Math.floor(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES * 0.8);
        const entriesToRemove = mutableLastCheckTimes.size - targetSize;
        // 先收集要删除的键，避免在迭代中删除导致未定义行为
        const keysToRemove = [];
        for (const [key, ts] of mutableLastCheckTimes.entries()) {
            if (keysToRemove.length >= entriesToRemove) break;
            keysToRemove.push(key);
        }
        for (const key of keysToRemove) {
            mutableLastCheckTimes.delete(key);
        }
    }

    // 获取 providerStatus 以便按单个供应商追踪
    const providerStatus = poolManager.providerStatus;
    if (!providerStatus) {
        logger.warn('[HealthCheckTimer] No providerStatus available');
        return;
    }

    // 添加非负随机抖动，防止时序攻击（0 ~ jitter）
    const jitter = crypto.randomInt(0, HEALTH_CHECK.JITTER_MS + 1);

    // 收集所有需要检查的供应商
    const providersToCheck = [];

    for (const providerType of configuredProviderTypes) {
        // 验证自定义间隔
        let customInterval = customIntervals[providerType];
        if (customInterval !== undefined) {
            if (typeof customInterval !== 'number' || customInterval < HEALTH_CHECK.MIN_INTERVAL_MS) {
                logger.warn(`[HealthCheckTimer] Invalid custom interval for ${providerType}: ${customInterval}, using global interval ${globalInterval}ms`);
                customInterval = globalInterval;
            } else if (customInterval > HEALTH_CHECK.MAX_INTERVAL_MS) {
                customInterval = HEALTH_CHECK.MAX_INTERVAL_MS;
            }
        }

        // 获取健康检查常数
        let healthyCustomInterval = healthyCustomIntervals[providerType];
        // healthyCustomInterval 可以是0（表示禁用），或者是有效数字
        if (healthyCustomInterval !== undefined && healthyCustomInterval !== 0) {
            if (typeof healthyCustomInterval !== 'number' || healthyCustomInterval < HEALTH_CHECK.MIN_HEALTHY_CHECK_INTERVAL_MS) {
                logger.warn(`[HealthCheckTimer] Invalid healthy custom interval for ${providerType}: ${healthyCustomInterval}, using global healthyCheckInterval ${healthyCheckInterval}ms`);
                healthyCustomInterval = healthyCheckInterval;
            } else if (healthyCustomInterval > HEALTH_CHECK.MAX_HEALTHY_CHECK_INTERVAL_MS) {
                healthyCustomInterval = HEALTH_CHECK.MAX_HEALTHY_CHECK_INTERVAL_MS;
            }
        }

        const effectiveHealthyInterval = healthyCustomInterval ?? healthyCheckInterval;

        const providers = providerStatus[providerType];
        if (!providers || providers.length === 0) {
            continue;
        }

        for (const provider of providers) {
            // 跳过禁用的供应商
            if (provider.config.isDisabled === true) {
                continue;
            }

            const uuid = provider.config.uuid;
            const key = `${providerType}:${uuid}`;
            const lastTime = mutableLastCheckTimes.get(key) || 0;
            const isHealthy = provider.config.isHealthy === true;

            // 确定使用的间隔
            let effectiveInterval;
            if (!isHealthy) {
                // 异常状态：使用原有间隔
                effectiveInterval = customInterval ?? globalInterval;
            } else {
                // 健康状态：使用健康检查常数
                if (effectiveHealthyInterval === 0) {
                    // healthyCheckInterval = 0 表示跳过健康供应商
                    continue;
                }
                effectiveInterval = effectiveHealthyInterval;
            }

            // 检查是否到期（jitter 应该是增加间隔，随机延迟检查以防止时序攻击）
            if (now - lastTime < effectiveInterval + jitter) {
                continue;
            }

            providersToCheck.push({ providerType, uuid, isHealthy, effectiveInterval });
        }
    }

    if (providersToCheck.length === 0) {
        // 所有供应商都未到期，正常行为不需要日志
        return;
    }

    logger.info(`[HealthCheckTimer] Executing health check for ${providersToCheck.length} provider(s)`);

    // 分批执行，每批最多 MAX_CONCURRENT_CHECKS 个类型
    const MAX_CONCURRENT = HEALTH_CHECK.MAX_CONCURRENT_CHECKS;
    for (let i = 0; i < providersToCheck.length; i += MAX_CONCURRENT) {
        const batchEnd = Math.min(i + MAX_CONCURRENT, providersToCheck.length);
        const batch = providersToCheck.slice(i, batchEnd);

        await Promise.all(batch.map(async ({ providerType, uuid, isHealthy, effectiveInterval }) => {
            const key = `${providerType}:${uuid}`;
            try {
                await poolManager.performHealthChecksByType(providerType);
                // 更新该供应商的上次检查时间
                mutableLastCheckTimes.set(key, Date.now());
            } catch (error) {
                logger.error(`[HealthCheckTimer] Error during health check for ${providerType}:${uuid}:`, error);
            }
        }));
    }
}

/**
 * 启动健康检查计时器
 * @param {number} interval - 检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function startHealthCheckTimer(interval) {
    // 停止现有计时器
    stopHealthCheckTimer();

    const state = _getState();

    // 验证并规范化间隔时间（范围：60秒 ~ 48小时）
    let safeInterval = HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    if (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS) {
        safeInterval = Math.min(interval, HEALTH_CHECK.MAX_INTERVAL_MS);
    }

    state.timerId = setInterval(async () => {
        if (state.checkPromise) {
            return;
        }
        const promise = executeHealthCheck();
        state.checkPromise = promise;
        promise.finally(() => {
            if (state.checkPromise === promise) {
                state.checkPromise = null;
            }
        });
    }, safeInterval).unref(); // .unref() 防止定时器阻止进程退出

    state.activeInterval = safeInterval;
    logger.info(`[HealthCheckTimer] Started with interval ${safeInterval}ms`);
    return safeInterval;
}

/**
 * 停止健康检查计时器
 */
export function stopHealthCheckTimer() {
    const state = _getState();
    if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
        state.activeInterval = null;
        // Also clear checkPromise to prevent state pollution
        state.checkPromise = null;
        logger.info('[HealthCheckTimer] Stopped');
    }
}

/**
 * 重新加载健康检查计时器（用于配置热更新）
 * @param {number} newInterval - 新的检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function reloadHealthCheckTimer(newInterval) {
    const config = getConfig()?.SCHEDULED_HEALTH_CHECK;
    if (!config?.enabled) {
        stopHealthCheckTimer();
        return 0;
    }
    return startHealthCheckTimer(newInterval);
}

/**
 * 获取当前计时器状态
 * @returns {Object} 计时器状态信息
 */
export function getHealthCheckTimerStatus() {
    const state = _getState();
    return {
        isActive: state.timerId !== null,
        isRunning: state.checkPromise !== null,
        interval: state.activeInterval
    };
}

/**
 * 更新健康检查计时器（根据配置对象启动或重启）
 * @param {Object} scheduledConfig - SCHEDULED_HEALTH_CHECK 配置对象
 */
export function updateHealthCheckTimers(scheduledConfig) {
    if (!scheduledConfig?.enabled) {
        stopHealthCheckTimer();
        return;
    }
    const interval = scheduledConfig.interval || HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    startHealthCheckTimer(interval);
}

/**
 * 在启动时执行一次健康检查
 * @returns {Promise<void>}
 */
export function runStartupHealthCheck() {
    logger.info('[HealthCheckTimer] Running startup health check...');
    return new Promise((resolve, reject) => {
        const startupTimer = setTimeout(async () => {
            try {
                await executeHealthCheck();
                resolve();
            } catch (error) {
                logger.error('[HealthCheckTimer] Startup health check error:', error);
                reject(error);
            }
        }, 100);
        // 确保启动定时器不会阻止进程退出
        startupTimer.unref();
    });
}

// 测试辅助导出
export const _testExports = {
    _getMutableLastCheckTimes
};
