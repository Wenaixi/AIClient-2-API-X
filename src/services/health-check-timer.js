/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

import logger from '../utils/logger.js';
import { getProviderPoolManager } from './service-manager.js';
import { HEALTH_CHECK } from '../utils/constants.js';

// 健康检查计时器状态存储在 globalThis 上以支持热更新后状态恢复
const _getState = () => {
    if (!globalThis._healthCheckTimerState) {
        globalThis._healthCheckTimerState = {
            isRunning: false,
            timerId: null,
            activeInterval: null
        };
    }
    return globalThis._healthCheckTimerState;
};

// 记录每个 providerType 上次检查时间（毫秒）- 使用 globalThis 存储
const _getLastCheckTimes = () => {
    if (!globalThis._healthCheckLastCheckTimes) {
        globalThis._healthCheckLastCheckTimes = new Map();
    }
    return globalThis._healthCheckLastCheckTimes;
};

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

    // Clean up stale entries for providerTypes no longer in config
    for (const key of lastCheckTimes.keys()) {
        if (!configuredProviderTypes.has(key)) {
            lastCheckTimes.delete(key);
        }
    }

    // 并行执行各类型健康检查
    const checkPromises = config.providerTypes.map(async (providerType) => {
        const customInterval = customIntervals[providerType];
        const effectiveInterval = customInterval ?? globalInterval;

        const lastTime = lastCheckTimes.get(providerType) || 0;
        if (now - lastTime < effectiveInterval) {
            logger.debug(`[HealthCheckTimer] Skipping ${providerType} - not yet due (last: ${lastTime}, interval: ${effectiveInterval}ms)`);
            return;
        }

        logger.info(`[HealthCheckTimer] Executing health check for ${providerType} (custom interval: ${customInterval ? customInterval + 'ms' : 'using global ' + globalInterval + 'ms'})`);
        try {
            await poolManager.performHealthChecksByType(providerType);
            lastCheckTimes.set(providerType, now);
        } catch (error) {
            logger.error(`[HealthCheckTimer] Error during health check for ${providerType}:`, error);
        }
    });

    await Promise.all(checkPromises);
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

    // 重置运行状态
    state.isRunning = false;

    // 验证并规范化间隔时间（范围：60秒 ~ 48小时）
    let safeInterval = HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    if (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS) {
        safeInterval = Math.min(interval, HEALTH_CHECK.MAX_INTERVAL_MS);
    }

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
        isRunning: state.isRunning,
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
