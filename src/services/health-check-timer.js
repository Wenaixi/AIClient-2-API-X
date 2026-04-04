/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

import logger from '../utils/logger.js';
import { getProviderPoolManager } from '../providers/adapter.js';
import { HEALTH_CHECK } from '../utils/constants.js';

/**
 * 健康检查计时器状态
 */
class HealthCheckTimerState {
    constructor() {
        this.isRunning = false;
        this.timerId = null;
        this.activeInterval = null;
    }
}

const state = new HealthCheckTimerState();

// 记录每个 providerType 上次检查时间（毫秒）
const lastCheckTimes = new Map();

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
    const providerTypes = config.providerTypes || [];
    const now = Date.now();

    for (const providerType of providerTypes) {
        const customInterval = customIntervals[providerType];
        const effectiveInterval = customInterval ?? globalInterval;

        const lastTime = lastCheckTimes.get(providerType) || 0;
        if (now - lastTime < effectiveInterval) {
            logger.debug(`[HealthCheckTimer] Skipping ${providerType} - not yet due (last: ${lastTime}, interval: ${effectiveInterval}ms)`);
            continue;
        }

        logger.info(`[HealthCheckTimer] Executing health check for ${providerType} (custom interval: ${customInterval ? customInterval + 'ms' : 'using global ' + globalInterval + 'ms'})`);
        try {
            await poolManager.performHealthChecksByType(providerType);
            lastCheckTimes.set(providerType, now);
        } catch (error) {
            logger.error(`[HealthCheckTimer] Error during health check for ${providerType}:`, error);
        }
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

    // 重置运行状态
    state.isRunning = false;

    // 验证并规范化间隔时间
    const safeInterval = (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS)
        ? interval
        : HEALTH_CHECK.DEFAULT_INTERVAL_MS;

    state.timerId = setInterval(async () => {
        if (state.isRunning) {
            logger.debug('[HealthCheckTimer] Skipping - previous run still in progress');
            return;
        }
        state.isRunning = true;
        try {
            await executeHealthCheck();
        } finally {
            state.isRunning = false;
        }
    }, safeInterval);

    state.activeInterval = safeInterval;
    logger.info(`[HealthCheckTimer] Started with interval ${safeInterval}ms`);
    return safeInterval;
}

/**
 * 停止健康检查计时器
 */
export function stopHealthCheckTimer() {
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
    return {
        isActive: state.timerId !== null,
        isRunning: state.isRunning,
        interval: state.activeInterval
    };
}

/**
 * 在启动时执行一次健康检查
 */
export async function runStartupHealthCheck() {
    logger.info('[HealthCheckTimer] Running startup health check...');
    setTimeout(async () => {
        try {
            await executeHealthCheck();
        } catch (error) {
            logger.error('[HealthCheckTimer] Startup health check error:', error);
        }
    }, 100);
}
