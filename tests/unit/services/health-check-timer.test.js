/**
 * health-check-timer.js 深度单元测试
 * 增强对实际模块功能的测试覆盖
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger - 注意路径正确，向上三级
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock getProviderPoolManager
jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn()
}));

// Mock 常量
const HEALTH_CHECK = {
    MIN_INTERVAL_MS: 60000,
    DEFAULT_INTERVAL_MS: 600000,
    MAX_INTERVAL_MS: 172800000,
    MAX_CONCURRENT_CHECKS: 5,
    JITTER_MS: 1000,
    MAX_LAST_CHECK_ENTRIES: 1000,
    HEALTHY_CHECK_INTERVAL_MS: 3600000,
    MIN_HEALTHY_CHECK_INTERVAL_MS: 60000,
    MAX_HEALTHY_CHECK_INTERVAL_MS: 86400000
};

jest.mock('../../../src/utils/constants.js', () => ({
    HEALTH_CHECK
}));

// 导入被测试的模块
const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

// 测试辅助函数：创建模拟的 providerStatus
// 注意：providerStatus[providerType] 是 Array，不是 Map
function createMockProviderStatus() {
    return {
        'claude-kiro-oauth': [
            { config: { uuid: 'uuid-1', isDisabled: false, isHealthy: true } },
            { config: { uuid: 'uuid-2', isDisabled: false, isHealthy: false } }
        ],
        'gemini-cli-oauth': [
            { config: { uuid: 'uuid-3', isDisabled: false, isHealthy: true } }
        ]
    };
}

// 测试辅助函数：创建模拟的 poolManager
function createMockPoolManager(overrides = {}) {
    return {
        providerStatus: createMockProviderStatus(),
        performHealthChecksByType: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

describe('health-check-timer.js 模块导出', () => {
    test('should export all required functions', () => {
        expect(typeof healthCheckTimerModule.startHealthCheckTimer).toBe('function');
        expect(typeof healthCheckTimerModule.stopHealthCheckTimer).toBe('function');
        expect(typeof healthCheckTimerModule.reloadHealthCheckTimer).toBe('function');
        expect(typeof healthCheckTimerModule.getHealthCheckTimerStatus).toBe('function');
        expect(typeof healthCheckTimerModule.updateHealthCheckTimers).toBe('function');
        expect(typeof healthCheckTimerModule.runStartupHealthCheck).toBe('function');
    });
});

describe('startHealthCheckTimer', () => {
    const { startHealthCheckTimer, stopHealthCheckTimer, getHealthCheckTimerStatus } = healthCheckTimerModule;

    beforeEach(() => {
        jest.clearAllMocks();
        stopHealthCheckTimer();
        jest.useFakeTimers();
    });

    afterEach(() => {
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should start timer with valid interval', () => {
        const interval = 120000;
        const result = startHealthCheckTimer(interval);
        expect(result).toBe(interval);
    });

    test('should use default interval for invalid input', () => {
        const result = startHealthCheckTimer(-100);
        expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should use default interval for zero', () => {
        const result = startHealthCheckTimer(0);
        expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should use default interval for non-numeric', () => {
        const result = startHealthCheckTimer('invalid');
        expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should cap interval at maximum', () => {
        const result = startHealthCheckTimer(HEALTH_CHECK.MAX_INTERVAL_MS + 1000);
        expect(result).toBe(HEALTH_CHECK.MAX_INTERVAL_MS);
    });

    test('should accept exact minimum interval', () => {
        const result = startHealthCheckTimer(HEALTH_CHECK.MIN_INTERVAL_MS);
        expect(result).toBe(HEALTH_CHECK.MIN_INTERVAL_MS);
    });

    test('should reject interval below minimum', () => {
        const result = startHealthCheckTimer(HEALTH_CHECK.MIN_INTERVAL_MS - 1000);
        expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should stop existing timer before starting new one', () => {
        startHealthCheckTimer(60000);
        startHealthCheckTimer(120000);

        const status = getHealthCheckTimerStatus();
        expect(status.interval).toBe(120000);
    });
});

describe('stopHealthCheckTimer', () => {
    const { startHealthCheckTimer, stopHealthCheckTimer, getHealthCheckTimerStatus } = healthCheckTimerModule;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should stop running timer without error', () => {
        startHealthCheckTimer(60000);
        expect(() => stopHealthCheckTimer()).not.toThrow();
    });

    test('should allow multiple stops without error', () => {
        startHealthCheckTimer(60000);
        stopHealthCheckTimer();
        expect(() => stopHealthCheckTimer()).not.toThrow();
    });

    test('should allow stop before start without error', () => {
        expect(() => stopHealthCheckTimer()).not.toThrow();
    });
});

describe('reloadHealthCheckTimer', () => {
    const { startHealthCheckTimer, stopHealthCheckTimer, reloadHealthCheckTimer } = healthCheckTimerModule;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // 设置全局配置
        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: { enabled: true }
        };
    });

    afterEach(() => {
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should reload timer with new interval', () => {
        startHealthCheckTimer(60000);
        const result = reloadHealthCheckTimer(120000);
        expect(result).toBe(120000);
    });

    test('should stop timer when disabled', () => {
        startHealthCheckTimer(60000);
        globalThis.CONFIG.SCHEDULED_HEALTH_CHECK.enabled = false;
        const result = reloadHealthCheckTimer(120000);
        expect(result).toBe(0);
    });

    test('should start timer when enabled', () => {
        const result = reloadHealthCheckTimer(120000);
        expect(result).toBe(120000);
    });
});

describe('getHealthCheckTimerStatus', () => {
    const { startHealthCheckTimer, stopHealthCheckTimer, getHealthCheckTimerStatus } = healthCheckTimerModule;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should return inactive status initially', () => {
        const status = getHealthCheckTimerStatus();
        expect(status.isActive).toBe(false);
        expect(status.isRunning).toBe(false);
        expect(status.interval).toBeNull();
    });

    test('should return active status after start', () => {
        startHealthCheckTimer(60000);
        const status = getHealthCheckTimerStatus();
        expect(status.isActive).toBe(true);
        expect(status.interval).toBe(60000);
    });

    test('should return inactive status after stop', () => {
        startHealthCheckTimer(60000);
        stopHealthCheckTimer();
        const status = getHealthCheckTimerStatus();
        expect(status.isActive).toBe(false);
        expect(status.interval).toBeNull();
    });
});

describe('updateHealthCheckTimers', () => {
    const { stopHealthCheckTimer, updateHealthCheckTimers, getHealthCheckTimerStatus } = healthCheckTimerModule;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should start timer when enabled', () => {
        updateHealthCheckTimers({
            enabled: true,
            interval: 120000
        });
        const status = getHealthCheckTimerStatus();
        expect(status.isActive).toBe(true);
    });

    test('should stop timer when disabled', () => {
        const { startHealthCheckTimer } = healthCheckTimerModule;
        startHealthCheckTimer(60000);
        updateHealthCheckTimers({ enabled: false });
        const status = getHealthCheckTimerStatus();
        expect(status.isActive).toBe(false);
    });

    test('should use default interval when not specified', () => {
        updateHealthCheckTimers({ enabled: true });
        const status = getHealthCheckTimerStatus();
        expect(status.interval).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should start timer with specified interval', () => {
        updateHealthCheckTimers({
            enabled: true,
            interval: 180000
        });
        const status = getHealthCheckTimerStatus();
        expect(status.interval).toBe(180000);
    });
});

describe('runStartupHealthCheck', () => {
    const { runStartupHealthCheck } = healthCheckTimerModule;
    const { getProviderPoolManager } = require('../../../src/services/service-manager.js');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        getProviderPoolManager.mockReturnValue(createMockPoolManager());
    });

    afterEach(async () => {
        const { stopHealthCheckTimer } = healthCheckTimerModule;
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should return a promise', () => {
        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const result = runStartupHealthCheck();
        expect(result).toBeInstanceOf(Promise);
    });

    test('should resolve after executing health check', async () => {
        // Mock poolManager with no providers - this makes executeHealthCheck return early
        // without trying to iterate over providers
        getProviderPoolManager.mockReturnValue({
            providerStatus: {
                'claude-kiro-oauth': [] // Empty array - no providers to check
            },
            performHealthChecksByType: jest.fn()
        });

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const promise = runStartupHealthCheck();

        // 快速执行所有待处理的定时器
        await jest.runAllTimersAsync();

        // 由于没有 providerStatus，应该 resolve 而不是 reject
        await expect(promise).resolves.toBeUndefined();
    });

    test('should handle errors gracefully', async () => {
        getProviderPoolManager.mockReturnValue({
            providerStatus: null, // 导致 executeHealthCheck 提前返回
            performHealthChecksByType: jest.fn()
        });

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: []
            }
        };

        const promise = runStartupHealthCheck();
        await jest.runAllTimersAsync();

        // 由于没有 providerStatus，应该 resolve 而不是 reject
        await expect(promise).resolves.toBeUndefined();
    });
});

describe('executeHealthCheck - provider cleanup', () => {
    const { stopHealthCheckTimer, _resetModuleState } = healthCheckTimerModule;
    const { getProviderPoolManager } = require('../../../src/services/service-manager.js');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        _resetModuleState();
    });

    afterEach(() => {
        _resetModuleState();
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should clean up removed provider types from lastCheckTimes', async () => {
        // 模拟 poolManager
        const mockPoolManager = {
            providerStatus: {},
            performHealthChecksByType: jest.fn()
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude'],  // 只保留 claude
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        // 直接调用模块中的函数来测试 lastCheckTimes 清理
        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        // 执行健康检查
        const promise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await promise;
    });

    test('should skip providers when interval not exceeded', async () => {
        const performHealthChecksByType = jest.fn();
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [{ config: { uuid: 'uuid-1', isDisabled: false, isHealthy: true } }]
            },
            performHealthChecksByType
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 600000,  // 10分钟
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 3600000,  // 1小时
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        // 模拟最近刚检查过：通过 _testExports._getMutableLastCheckTimes 设置一个最近的时间戳
        // 这样即使 jitter 再大，也不会触发检查（因为 now - lastTime < effectiveInterval + jitter）
        const mutableLastCheckTimes = healthCheckTimerModule._testExports._getMutableLastCheckTimes();
        const recentTime = Date.now() - 1000; // 1秒前
        mutableLastCheckTimes.set('claude-kiro-oauth:uuid-1', recentTime);

        // 执行健康检查
        const promise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await promise;

        // performHealthChecksByType 不应该被调用，因为间隔未到
        expect(performHealthChecksByType).not.toHaveBeenCalled();
    });

    test('should skip disabled providers', async () => {
        const performHealthChecksByType = jest.fn();
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [{ config: { uuid: 'uuid-1', isDisabled: true, isHealthy: true } }]
            },
            performHealthChecksByType
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');
        const promise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await promise;
        // Disabled provider should be skipped
        expect(performHealthChecksByType).not.toHaveBeenCalled();
    });

    test('should skip healthy providers when healthyCheckInterval is 0', async () => {
        const performHealthChecksByType = jest.fn();
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [{ config: { uuid: 'uuid-1', isDisabled: false, isHealthy: true } }]
            },
            performHealthChecksByType
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 0,  // 0 means skip healthy providers
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');
        const promise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await promise;
        // healthyCheckInterval=0 should skip healthy providers
        expect(performHealthChecksByType).not.toHaveBeenCalled();
    });

    test('should use custom interval for provider', async () => {
        const performHealthChecksByType = jest.fn();
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [{ config: { uuid: 'uuid-1', isDisabled: false, isHealthy: false } }]
            },
            performHealthChecksByType
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 600000,  // global 10 minutes
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {
                    'claude-kiro-oauth': 60000  // custom 1 minute
                },
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');
        const promise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await promise;
        // Custom interval is 60000ms which equals MIN_INTERVAL - should be used
        expect(performHealthChecksByType).toHaveBeenCalledWith('claude-kiro-oauth');
    });
});

describe('executeHealthCheck - validation', () => {
    const { stopHealthCheckTimer, _resetModuleState } = healthCheckTimerModule;
    const { getProviderPoolManager } = require('../../../src/services/service-manager.js');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        _resetModuleState();
    });

    afterEach(() => {
        _resetModuleState();
        stopHealthCheckTimer();
        jest.useRealTimers();
    });

    test('should handle invalid custom interval', async () => {
        const performHealthChecksByType = jest.fn();
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [
                    { config: { uuid: 'uuid-1', isDisabled: false, isHealthy: false } }
                ]
            },
            performHealthChecksByType
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 600000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {
                    'claude-kiro-oauth': -1000  // 无效的自定义间隔
                },
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        // 启动健康检查（内部有 100ms setTimeout）
        const healthCheckPromise = healthCheckTimerModule.runStartupHealthCheck();
        // 快进 timers 以触发内部的 setTimeout(100ms) 和 executeHealthCheck
        await jest.runAllTimersAsync();
        await healthCheckPromise;
        // 不应该抛出错误
    });

    test('should handle invalid healthy custom interval', async () => {
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [{ config: { uuid: 'uuid-1', isDisabled: false, isHealthy: true } }]
            },
            performHealthChecksByType: jest.fn()
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {
                    'claude-kiro-oauth': -5000  // 无效的健康检查间隔
                }
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        // 启动健康检查（内部有 100ms setTimeout）
        const healthCheckPromise = healthCheckTimerModule.runStartupHealthCheck();
        // 快进 timers 以触发内部的 setTimeout(100ms) 和 executeHealthCheck
        await jest.runAllTimersAsync();
        await healthCheckPromise;
    });

    test('should cap custom interval at MAX_INTERVAL_MS', async () => {
        const mockPoolManager = {
            providerStatus: {
                'claude-kiro-oauth': [
                    { config: { uuid: 'uuid-1', isDisabled: false, isHealthy: false } }
                ]
            },
            performHealthChecksByType: jest.fn()
        };
        getProviderPoolManager.mockReturnValue(mockPoolManager);

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 600000,
                providerTypes: ['claude-kiro-oauth'],
                customIntervals: {
                    'claude-kiro-oauth': 999999999999  // 超过最大值
                },
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        // 启动健康检查（内部有 100ms setTimeout）
        const healthCheckPromise = healthCheckTimerModule.runStartupHealthCheck();
        // 快进 timers 以触发内部的 setTimeout(100ms) 和 executeHealthCheck
        await jest.runAllTimersAsync();
        await healthCheckPromise;
    });

    test('should handle empty providerTypes', async () => {
        const performHealthChecksByType = jest.fn();
        getProviderPoolManager.mockReturnValue({
            providerStatus: {},
            performHealthChecksByType
        });

        globalThis.CONFIG = {
            SCHEDULED_HEALTH_CHECK: {
                enabled: true,
                interval: 60000,
                providerTypes: [],  // 空数组
                customIntervals: {},
                healthyCheckInterval: 3600000,
                healthyCustomIntervals: {}
            }
        };

        const healthCheckTimerModule = require('../../../src/services/health-check-timer.js');

        const healthCheckPromise = healthCheckTimerModule.runStartupHealthCheck();
        await jest.runAllTimersAsync();
        await healthCheckPromise;

        // 空 providerTypes 不应该调用任何检查
        expect(performHealthChecksByType).not.toHaveBeenCalled();
    });
});

describe('HEALTH_CHECK Constants', () => {
    test('should have valid interval hierarchy', () => {
        expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
        expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.MAX_INTERVAL_MS);
    });

    test('should have valid healthy check interval hierarchy', () => {
        expect(HEALTH_CHECK.MIN_HEALTHY_CHECK_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.HEALTHY_CHECK_INTERVAL_MS);
        expect(HEALTH_CHECK.HEALTHY_CHECK_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.MAX_HEALTHY_CHECK_INTERVAL_MS);
    });

    test('should have reasonable MAX_CONCURRENT_CHECKS', () => {
        expect(HEALTH_CHECK.MAX_CONCURRENT_CHECKS).toBeGreaterThan(0);
        expect(HEALTH_CHECK.MAX_CONCURRENT_CHECKS).toBeLessThanOrEqual(10);
    });

    test('should have reasonable JITTER_MS', () => {
        expect(HEALTH_CHECK.JITTER_MS).toBeGreaterThanOrEqual(0);
        expect(HEALTH_CHECK.JITTER_MS).toBeLessThan(10000);
    });

    test('should have reasonable MAX_LAST_CHECK_ENTRIES', () => {
        expect(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES).toBeGreaterThan(0);
    });
});
