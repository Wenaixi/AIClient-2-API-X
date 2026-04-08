/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { getProviderPoolManager } from './service-manager.js';
import { HEALTH_CHECK } from '../utils/constants.js';

// 使用模块级私有变量存储状态，避免全局污染
let timerState = {
    timerId: null,
    activeInterval: null,
    checkPromise: null
};

// 记录每个 providerType 上次检查时间（毫秒）
let lastCheckTimes = new Map();

const _getState = () => Object.freeze({ ...timerState });
// 深拷贝 lastCheckTimes，避免外部修改影响模块内部状态
const _getLastCheckTimes = () => new Map(lastCheckTimes);

// 用于更新模块内部的 lastCheckTimes 引用（返回真实 Map，非拷贝）
const _getMutableLastCheckTimes = () => lastCheckTimes;

/**
 * 执行健康检查
 * 支持按供应商自定义间隔：全局定时器触发后，对有自定义间隔的 providerType 判断是否到期
 */
async function executeHealthCheck() {
    const poolManager = getProviderPoolManager();
    if (!poolManager) {
        logger.warn('[HealthCheckTimer] No pool manager available');
        return;
    }

    const config = globalThis.CONFIG?.SCHEDULED_HEALTH_CHECK;
    if (!config?.enabled) return;

    const globalInterval = config.interval || HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    const customIntervals = config.customIntervals || {};
    const configuredProviderTypes = new Set(config.providerTypes || []);
    const now = Date.now();
    // 使用深拷贝避免外部修改影响，同时获取可变引用用于后续更新
    const lastCheckTimesCopy = _getLastCheckTimes();
    const mutableLastCheckTimes = _getMutableLastCheckTimes();

    // 清理不再配置的 providerType 条目
    for (const key of lastCheckTimesCopy.keys()) {
        if (!configuredProviderTypes.has(key)) {
            mutableLastCheckTimes.delete(key);
        }
    }

    // 防止内存泄漏：限制 Map 大小（仅在超过阈值时清理）
    if (mutableLastCheckTimes.size > HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES) {
        logger.warn(`[HealthCheckTimer] lastCheckTimes Map size (${mutableLastCheckTimes.size}) exceeds limit, clearing oldest entries`);
        // 使用迭代器直接删除最旧的条目，避免完整排序
        const targetSize = Math.floor(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES * 0.8);
        const entriesToRemove = mutableLastCheckTimes.size - targetSize;
        let deleted = 0;
        for (const [key, ts] of mutableLastCheckTimes.entries()) {
            if (deleted >= entriesToRemove) break;
            mutableLastCheckTimes.delete(key);
            deleted++;
        }
    }

    // 并行执行各类型健康检查，限制并发数
    const MAX_CONCURRENT = HEALTH_CHECK.MAX_CONCURRENT_CHECKS;
    const totalTypes = config.providerTypes.length;
    for (let i = 0; i < totalTypes; i += MAX_CONCURRENT) {
        const batchEnd = Math.min(i + MAX_CONCURRENT, totalTypes);
        const batch = config.providerTypes.slice(i, batchEnd);
        await Promise.all(batch.map(async (providerType) => {
            let customInterval = customIntervals[providerType];

            // 验证自定义间隔，防止无效值
            if (customInterval !== undefined) {
                if (typeof customInterval !== 'number' || customInterval < HEALTH_CHECK.MIN_INTERVAL_MS) {
                    customInterval = globalInterval;
                } else if (customInterval > HEALTH_CHECK.MAX_INTERVAL_MS) {
                    customInterval = HEALTH_CHECK.MAX_INTERVAL_MS;
                }
            }

            const effectiveInterval = customInterval ?? globalInterval;

            const lastTime = lastCheckTimes.get(providerType) || 0;
            const checkStartTime = Date.now();

            // 添加非负随机抖动，防止时序攻击（0 ~ jitter）
            const jitter = crypto.randomInt(0, HEALTH_CHECK.JITTER_MS + 1);

            if (checkStartTime - lastTime + jitter < effectiveInterval) {
                // 跳过检查是正常行为，不需要记录日志
                return;
            }

            logger.info(`[HealthCheckTimer] Executing health check for ${providerType} (custom interval: ${customInterval ? customInterval + 'ms' : 'using global ' + globalInterval + 'ms'})`);
            try {
                await poolManager.performHealthChecksByType(providerType);
                // 使用实际完成时间而非批次开始时间，更新到模块级状态
                mutableLastCheckTimes.set(providerType, Date.now());
            } catch (error) {
                logger.error(`[HealthCheckTimer] Error during health check for ${providerType}:`, error);
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
    }, safeInterval);

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
        logger.info('[HealthCheckTimer] Stopped');
    }
}

/**
 * 重新加载健康检查计时器（用于配置热更新）
 * @param {number} newInterval - 新的检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function reloadHealthCheckTimer(newInterval) {
    const config = globalThis.CONFIG?.SCHEDULED_HEALTH_CHECK;
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
        setTimeout(async () => {
            try {
                await executeHealthCheck();
                resolve();
            } catch (error) {
                logger.error('[HealthCheckTimer] Startup health check error:', error);
                reject(error);
            }
        }, 100);
    });
}
