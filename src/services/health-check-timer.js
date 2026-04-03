/**
 * 定时健康检查计时器管理模块
 * 支持 per-provider-type 的独立定时器
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
        // per-provider-type timers: { 'gemini-cli-oauth': timerId, ... }
        this.timers = {};
        this.activeIntervals = {};
    }
}

const state = new HealthCheckTimerState();

/**
 * 执行指定类型的健康检查
 * @param {string} providerType - provider类型
 */
async function executeHealthCheckByType(providerType) {
    const poolManager = getProviderPoolManager();
    if (!poolManager) {
        logger.warn('[HealthCheckTimer] No pool manager available');
        return;
    }

    try {
        await poolManager.performHealthChecksByType(providerType);
    } catch (error) {
        logger.error(`[HealthCheckTimer] Error during health check for ${providerType}:`, error);
    }
}

/**
 * 停止指定类型的健康检查计时器
 * @param {string} providerType - provider类型
 */
function stopHealthCheckTimerByType(providerType) {
    if (state.timers[providerType]) {
        clearInterval(state.timers[providerType]);
        delete state.timers[providerType];
        delete state.activeIntervals[providerType];
        logger.info(`[HealthCheckTimer] Stopped timer for ${providerType}`);
    }
}

/**
 * 停止所有健康检查计时器
 */
export function stopHealthCheckTimer() {
    for (const providerType of Object.keys(state.timers)) {
        clearInterval(state.timers[providerType]);
    }
    state.timers = {};
    state.activeIntervals = {};
    state.isRunning = false;
    logger.info('[HealthCheckTimer] All timers stopped');
}

/**
 * 启动指定类型的健康检查计时器
 * @param {string} providerType - provider类型
 * @param {number} interval - 检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function startHealthCheckTimerByType(providerType, interval) {
    // 停止现有计时器
    stopHealthCheckTimerByType(providerType);

    // 验证并规范化间隔时间
    const safeInterval = (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS)
        ? interval
        : HEALTH_CHECK.DEFAULT_INTERVAL_MS;

    state.timers[providerType] = setInterval(async () => {
        try {
            await executeHealthCheckByType(providerType);
        } catch (error) {
            logger.error(`[HealthCheckTimer] Error for ${providerType}:`, error);
        }
    }, safeInterval);

    state.activeIntervals[providerType] = safeInterval;
    logger.info(`[HealthCheckTimer] Started ${providerType} with interval ${safeInterval}ms`);
    return safeInterval;
}

/**
 * 启动健康检查计时器（兼容旧接口，使用全局默认间隔）
 * @param {number} interval - 检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function startHealthCheckTimer(interval) {
    // 停止所有现有计时器
    stopHealthCheckTimer();

    // 重置运行状态
    state.isRunning = false;

    // 验证并规范化间隔时间
    const safeInterval = (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS)
        ? interval
        : HEALTH_CHECK.DEFAULT_INTERVAL_MS;

    // 不再使用单一计时器，而是由外部调用 startHealthCheckTimerByType
    // 此函数仅用于兼容旧接口
    logger.info(`[HealthCheckTimer] Using legacy startHealthCheckTimer with interval ${safeInterval}ms`);
    return safeInterval;
}

/**
 * 重新加载指定类型的健康检查计时器
 * @param {string} providerType - provider类型
 * @param {number} newInterval - 新的检查间隔（毫秒）
 * @returns {number} 实际使用的间隔时间
 */
export function reloadHealthCheckTimerByType(providerType, newInterval) {
    return startHealthCheckTimerByType(providerType, newInterval);
}

/**
 * 重新加载健康检查计时器（用于配置热更新）
 * @param {number} newInterval - 新的检查间隔（毫秒）- 已被忽略，保留兼容性
 * @returns {number} 实际使用的间隔时间
 */
export function reloadHealthCheckTimer(newInterval) {
    // 保留旧接口兼容性，实际重载由 updateHealthCheckTimers 处理
    logger.info('[HealthCheckTimer] reloadHealthCheckTimer called - use updateHealthCheckTimers for per-type');
    return newInterval || HEALTH_CHECK.DEFAULT_INTERVAL_MS;
}

/**
 * 更新所有 provider type 的健康检查计时器
 * @param {Object} scheduledConfig - SCHEDULED_HEALTH_CHECK 配置
 */
export function updateHealthCheckTimers(scheduledConfig) {
    if (!scheduledConfig?.enabled) {
        stopHealthCheckTimer();
        return;
    }

    const defaultInterval = scheduledConfig.interval || HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    const overrides = scheduledConfig.overrides || {};
    const providerTypes = scheduledConfig.providerTypes || [];

    // 停止不再需要的计时器
    for (const providerType of Object.keys(state.timers)) {
        if (!providerTypes.includes(providerType)) {
            stopHealthCheckTimerByType(providerType);
        }
    }

    // 为每个 provider type 启动/更新计时器
    for (const providerType of providerTypes) {
        const interval = overrides[providerType] || defaultInterval;
        startHealthCheckTimerByType(providerType, interval);
    }
}

/**
 * 获取当前计时器状态
 * @returns {Object} 计时器状态信息
 */
export function getHealthCheckTimerStatus() {
    return {
        isActive: Object.keys(state.timers).length > 0,
        isRunning: state.isRunning,
        intervals: { ...state.activeIntervals },
        defaultInterval: state.activeIntervals._default || null
    };
}

/**
 * 在启动时执行一次健康检查
 * @param {string|null} providerType - 指定类型，为空则检查所有
 */
export async function runStartupHealthCheck(providerType = null) {
    logger.info(`[HealthCheckTimer] Running startup health check${providerType ? ` for ${providerType}` : ''}...`);
    setTimeout(async () => {
        try {
            const poolManager = getProviderPoolManager();
            if (poolManager) {
                if (providerType) {
                    await poolManager.performHealthChecksByType(providerType);
                } else {
                    await poolManager.performHealthChecks();
                }
            }
        } catch (error) {
            logger.error('[HealthCheckTimer] Startup health check error:', error);
        }
    }, 100);
}
