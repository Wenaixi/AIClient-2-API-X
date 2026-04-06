/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

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

const _getState = () => timerState;
const _getLastCheckTimes = () => lastCheckTimes;

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
    const lastCheckTimes = _getLastCheckTimes();

    // 清理不再配置的 providerType 条目
    for (const key of lastCheckTimes.keys()) {
        if (!configuredProviderTypes.has(key)) {
            lastCheckTimes.delete(key);
        }
    }

    // 防止内存泄漏：限制 Map 大小（仅在超过阈值时清理）
    if (lastCheckTimes.size > HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES) {
        logger.warn(`[HealthCheckTimer] lastCheckTimes Map size (${lastCheckTimes.size}) exceeds limit, clearing oldest entries`);
        // 使用更高效的清理策略：只删除最旧的20%条目
        const targetSize = Math.floor(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES * 0.8);
        const entriesToRemove = lastCheckTimes.size - targetSize;

        // 找出最旧的条目并删除
        const entries = Array.from(lastCheckTimes.entries());
        entries.sort((a, b) => a[1] - b[1]); // 按时间戳升序排序

        for (let i = 0; i < entriesToRemove; i++) {
            lastCheckTimes.delete(entries[i][0]);
        }
    }

    // 并行执行各类型健康检查，限制并发数
    const MAX_CONCURRENT = HEALTH_CHECK.MAX_CONCURRENT_CHECKS;
    for (let i = 0; i < config.providerTypes.length; i += MAX_CONCURRENT) {
        const batch = config.providerTypes.slice(i, i + MAX_CONCURRENT);
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
            const jitter = Math.floor(Math.random() * HEALTH_CHECK.JITTER_MS);

            if (checkStartTime - lastTime + jitter < effectiveInterval) {
                // 跳过检查是正常行为，不需要记录日志
                return;
            }

            logger.info(`[HealthCheckTimer] Executing health check for ${providerType} (custom interval: ${customInterval ? customInterval + 'ms' : 'using global ' + globalInterval + 'ms'})`);
            try {
                await poolManager.performHealthChecksByType(providerType);
                // 使用实际完成时间而非批次开始时间
                lastCheckTimes.set(providerType, Date.now());
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
        // 使用 Promise 确保原子性，防止竞态条件
        if (state.checkPromise) {
            return;
        }
        state.checkPromise = executeHealthCheck().finally(() => {
            state.checkPromise = null;
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
    return new Promise((resolve) => {
        setTimeout(async () => {
            try {
                await executeHealthCheck();
                resolve();
            } catch (error) {
                logger.error('[HealthCheckTimer] Startup health check error:', error);
                resolve();
            }
        }, 100);
    });
}
