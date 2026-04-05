/**
 * 定时健康检查计时器管理模块
 * 封装健康检查计时器的状态和操作方法
 */

import logger from '../utils/logger.js';
import { getProviderPoolManager } from './service-manager.js';
import { HEALTH_CHECK } from '../utils/constants.js';

// 使用模块级私有变量存储状态，避免全局污染
let timerState = {
    isRunning: false,
    timerId: null,
    activeInterval: null
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

    // 防止内存泄漏：限制 Map 大小
    if (lastCheckTimes.size > HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES) {
        logger.warn(`[HealthCheckTimer] lastCheckTimes Map size (${lastCheckTimes.size}) exceeds limit, clearing oldest entries`);
        // 保留最近使用的条目
        const entries = Array.from(lastCheckTimes.entries())
            .sort((a, b) => b[1] - a[1]) // 按时间戳降序排序
            .slice(0, Math.floor(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES * 0.8)); // 保留80%
        lastCheckTimes.clear();
        entries.forEach(([key, value]) => lastCheckTimes.set(key, value));
    }

    // 并行执行各类型健康检查，限制并发数
    const MAX_CONCURRENT = HEALTH_CHECK.MAX_CONCURRENT_CHECKS;
    for (let i = 0; i < config.providerTypes.length; i += MAX_CONCURRENT) {
        const batch = config.providerTypes.slice(i, i + MAX_CONCURRENT);
        await Promise.all(batch.map(async (providerType) => {
            const customInterval = customIntervals[providerType];
            const effectiveInterval = customInterval ?? globalInterval;

            const lastTime = lastCheckTimes.get(providerType) || 0;
            const checkStartTime = Date.now();

            // 添加随机抖动，防止时序攻击
            const jitter = Math.floor(Math.random() * HEALTH_CHECK.JITTER_MS);

            if (checkStartTime - lastTime < effectiveInterval - jitter) {
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

    // 重置运行状态
    state.isRunning = false;

    // 验证并规范化间隔时间（范围：60秒 ~ 48小时）
    let safeInterval = HEALTH_CHECK.DEFAULT_INTERVAL_MS;
    if (typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS) {
        safeInterval = Math.min(interval, HEALTH_CHECK.MAX_INTERVAL_MS);
    }

    state.timerId = setInterval(async () => {
        if (state.isRunning) {
            // 跳过检查是正常行为，不需要记录日志
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
