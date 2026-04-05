/**
 * ProviderPoolManager 单元测试
 *
 * 测试策略：
 * - 测试不依赖外部资源的核心逻辑
 * - 使用 Mock 隔离依赖
 * - 测试边界条件和错误处理
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ==================== Mock 依赖 ====================

// Mock logger
const mockLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock broadcastEvent
const mockBroadcastEvent = jest.fn();

// Mock fs module
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
};

// ==================== 测试辅助函数 ====================

/**
 * 创建测试用的 ProviderPoolManager（简化版，测试核心逻辑）
 */
class TestableProviderPoolManager {
  constructor(providerPools = {}, options = {}) {
    this.providerPools = providerPools;
    this.globalConfig = options.globalConfig || {};
    this.providerStatus = {};
    this.roundRobinIndex = {};
    this.maxErrorCount = options.maxErrorCount ?? 10;
    this.healthCheckInterval = options.healthCheckInterval ?? 10 * 60 * 1000;
    this.refreshConcurrency = {
      global: options.globalConfig?.REFRESH_CONCURRENCY_GLOBAL ?? 2,
      perProvider: options.globalConfig?.REFRESH_CONCURRENCY_PER_PROVIDER ?? 1
    };
    this.activeProviderRefreshes = 0;
    this.warmupTarget = options.globalConfig?.WARMUP_TARGET || 0;
    this.refreshingUuids = new Set();
    this.refreshQueues = {};
    this.fallbackChain = options.globalConfig?.providerFallbackChain || {};
    this.modelFallbackMapping = options.globalConfig?.modelFallbackMapping || {};
    this._selectionSequence = 0;
    this._selectionLocks = {};
    this._isSelecting = {};

    this.initializeProviderStatus();
  }

  initializeProviderStatus() {
    for (const [type, providers] of Object.entries(this.providerPools)) {
      this.providerStatus[type] = providers.map(config => ({
        config: { ...config },
        isHealthy: config.isHealthy !== false,
        consecutiveErrors: 0,
        lastError: null,
        isRefreshing: false,
      }));
      this.roundRobinIndex[type] = 0;
    }
  }

  _log(level, ...args) {
    const prefix = `[ProviderPoolManager:${level.toUpperCase()}]`;
    mockLogger[level]?.(`${prefix}`, ...args);
  }

  getProviderStatus(providerType, uuid) {
    const providers = this.providerStatus[providerType];
    if (!providers) return null;
    return providers.find(p => p.config.uuid === uuid);
  }

  markProviderHealthy(providerType, config, notify = true, modelName = null) {
    const status = this.getProviderStatus(providerType, config.uuid);
    if (!status) return;

    status.isHealthy = true;
    status.consecutiveErrors = 0;
    status.lastError = null;
    if (modelName) {
      status.lastHealthCheckModel = modelName;
    }
    if (notify) {
      mockBroadcastEvent('provider_healthy', { providerType, uuid: config.uuid });
    }
  }

  markProviderUnhealthy(providerType, config, errorMessage) {
    const status = this.getProviderStatus(providerType, config.uuid);
    if (!status) return;

    status.consecutiveErrors++;
    status.lastError = errorMessage;

    if (status.consecutiveErrors >= this.maxErrorCount) {
      status.isHealthy = false;
      mockBroadcastEvent('provider_unhealthy', {
        providerType,
        uuid: config.uuid,
        error: errorMessage,
        consecutiveErrors: status.consecutiveErrors
      });
    }
  }

  markProviderUnhealthyImmediately(providerType, config, errorMessage) {
    const status = this.getProviderStatus(providerType, config.uuid);
    if (!status) return;

    status.isHealthy = false;
    status.consecutiveErrors = this.maxErrorCount;
    status.lastError = errorMessage;

    mockBroadcastEvent('provider_unhealthy', {
      providerType,
      uuid: config.uuid,
      error: errorMessage,
      immediate: true
    });
  }

  disableProvider(providerType, config) {
    const status = this.getProviderStatus(providerType, config.uuid);
    if (!status) return;
    status.config.isDisabled = true;
    status.isHealthy = false;
  }

  enableProvider(providerType, config) {
    const status = this.getProviderStatus(providerType, config.uuid);
    if (!status) return;
    status.config.isDisabled = false;
  }

  getHealthyProviders(providerType) {
    const providers = this.providerStatus[providerType];
    if (!providers) return [];
    return providers.filter(p => p.isHealthy && !p.config.isDisabled);
  }

  getAllProviders(providerType) {
    return this.providerStatus[providerType] || [];
  }

  getHealthyCount(providerType) {
    return this.getHealthyProviders(providerType).length;
  }

  getTotalCount(providerType) {
    return this.getAllProviders(providerType).length;
  }
}

// ==================== 测试数据工厂 ====================

function createTestProvider(overrides = {}) {
  return {
    uuid: `test-uuid-${Math.random().toString(36).slice(2, 10)}`,
    customName: 'Test Provider',
    credPath: 'configs/test.json',
    isHealthy: true,
    isDisabled: false,
    lastUsed: null,
    usageCount: 0,
    errorCount: 0,
    checkModelName: null,
    ...overrides
  };
}

// ==================== 测试用例 ====================

describe('ProviderPoolManager Core', () => {
  describe('Initialization', () => {
    test('should initialize with empty pools', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.providerStatus).toEqual({});
      expect(manager.roundRobinIndex).toEqual({});
    });

    test('should initialize with provider pools', () => {
      const pools = {
        'gemini': [
          createTestProvider({ uuid: 'gemini-1', isHealthy: true }),
          createTestProvider({ uuid: 'gemini-2', isHealthy: false }),
        ],
        'openai': [
          createTestProvider({ uuid: 'openai-1', isHealthy: true }),
        ]
      };

      const manager = new TestableProviderPoolManager(pools);

      expect(manager.getTotalCount('gemini')).toBe(2);
      expect(manager.getTotalCount('openai')).toBe(1);
      expect(manager.getHealthyCount('gemini')).toBe(1);
      expect(manager.getHealthyCount('openai')).toBe(1);
    });

    test('should use default maxErrorCount', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.maxErrorCount).toBe(10);
    });

    test('should accept custom maxErrorCount', () => {
      const manager = new TestableProviderPoolManager({}, { maxErrorCount: 5 });
      expect(manager.maxErrorCount).toBe(5);
    });
  });

  describe('Provider Health Management', () => {
    let manager;
    let testProvider;

    beforeEach(() => {
      testProvider = createTestProvider({ uuid: 'test-health' });
      const pools = {
        'test': [testProvider]
      };
      manager = new TestableProviderPoolManager(pools);
    });

    test('should mark provider as healthy', () => {
      manager.markProviderHealthy('test', testProvider);
      const status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.isHealthy).toBe(true);
      expect(status.consecutiveErrors).toBe(0);
    });

    test('should reset consecutive errors when marked healthy', () => {
      const status = manager.getProviderStatus('test', testProvider.uuid);
      status.consecutiveErrors = 5;
      status.lastError = 'Previous error';

      manager.markProviderHealthy('test', testProvider);

      expect(status.consecutiveErrors).toBe(0);
      expect(status.lastError).toBeNull();
    });

    test('should increment consecutive errors on unhealthy', () => {
      manager.markProviderUnhealthy('test', testProvider, 'Network error');

      const status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.consecutiveErrors).toBe(1);
      expect(status.lastError).toBe('Network error');
    });

    test('should mark unhealthy immediately', () => {
      manager.markProviderUnhealthyImmediately('test', testProvider, 'Auth error');

      const status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.isHealthy).toBe(false);
      expect(status.consecutiveErrors).toBe(10); // maxErrorCount
      expect(status.lastError).toBe('Auth error');
    });

    test('should mark unhealthy after max errors', () => {
      // 达到 maxErrorCount (10) 次错误后才会被标记为不健康
      for (let i = 0; i < 9; i++) {
        manager.markProviderUnhealthy('test', testProvider, 'Error');
      }

      let status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.isHealthy).toBe(true); // Still healthy

      manager.markProviderUnhealthy('test', testProvider, 'Error');
      status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.isHealthy).toBe(false); // Now unhealthy
    });

    test('should get healthy providers only', () => {
      const pools = {
        'test': [
          createTestProvider({ uuid: 'p1', isHealthy: true }),
          createTestProvider({ uuid: 'p2', isHealthy: false }),
          createTestProvider({ uuid: 'p3', isHealthy: true }),
        ]
      };

      const manager = new TestableProviderPoolManager(pools);
      const healthy = manager.getHealthyProviders('test');

      expect(healthy.length).toBe(2);
      expect(healthy.map(p => p.config.uuid)).toContain('p1');
      expect(healthy.map(p => p.config.uuid)).toContain('p3');
    });
  });

  describe('Provider Enable/Disable', () => {
    let manager;
    let testProvider;

    beforeEach(() => {
      testProvider = createTestProvider({ uuid: 'test-disable' });
      const pools = { 'test': [testProvider] };
      manager = new TestableProviderPoolManager(pools);
    });

    test('should disable provider', () => {
      manager.disableProvider('test', testProvider);
      const status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.config.isDisabled).toBe(true);
      expect(status.isHealthy).toBe(false);
    });

    test('should enable provider', () => {
      manager.disableProvider('test', testProvider);
      manager.enableProvider('test', testProvider);
      const status = manager.getProviderStatus('test', testProvider.uuid);
      expect(status.config.isDisabled).toBe(false);
    });

    test('should not return disabled providers as healthy', () => {
      manager.disableProvider('test', testProvider);
      const healthy = manager.getHealthyProviders('test');
      expect(healthy.length).toBe(0);
    });
  });

  describe('getProviderStatus', () => {
    test('should return null for non-existent provider type', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.getProviderStatus('nonexistent', 'uuid')).toBeNull();
    });

    test('should return undefined/null for non-existent uuid', () => {
      const pools = { 'test': [createTestProvider({ uuid: 'exists' })] };
      const manager = new TestableProviderPoolManager(pools);
      // getProviderStatus returns undefined when not found
      expect(manager.getProviderStatus('test', 'not-exists')).toBeUndefined();
    });

    test('should return correct status', () => {
      const provider = createTestProvider({ uuid: 'correct' });
      const pools = { 'test': [provider] };
      const manager = new TestableProviderPoolManager(pools);

      const status = manager.getProviderStatus('test', 'correct');
      expect(status).not.toBeNull();
      expect(status.config.uuid).toBe('correct');
    });
  });

  describe('Health Counts', () => {
    test('should return 0 for non-existent provider type', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.getHealthyCount('nonexistent')).toBe(0);
      expect(manager.getTotalCount('nonexistent')).toBe(0);
    });

    test('should count total and healthy providers correctly', () => {
      const pools = {
        'test': [
          createTestProvider({ uuid: 'p1', isHealthy: true }),
          createTestProvider({ uuid: 'p2', isHealthy: false }),
          createTestProvider({ uuid: 'p3', isHealthy: true }),
          createTestProvider({ uuid: 'p4', isHealthy: false }),
        ]
      };

      const manager = new TestableProviderPoolManager(pools);
      expect(manager.getTotalCount('test')).toBe(4);
      expect(manager.getHealthyCount('test')).toBe(2);
    });
  });

  describe('Concurrency Configuration', () => {
    test('should use default concurrency settings', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.refreshConcurrency.global).toBe(2);
      expect(manager.refreshConcurrency.perProvider).toBe(1);
    });

    test('should accept custom concurrency settings', () => {
      const manager = new TestableProviderPoolManager({}, {
        globalConfig: {
          REFRESH_CONCURRENCY_GLOBAL: 5,
          REFRESH_CONCURRENCY_PER_PROVIDER: 2
        }
      });
      expect(manager.refreshConcurrency.global).toBe(5);
      expect(manager.refreshConcurrency.perProvider).toBe(2);
    });
  });

  describe('Fallback Configuration', () => {
    test('should use empty fallback chain by default', () => {
      const manager = new TestableProviderPoolManager();
      expect(manager.fallbackChain).toEqual({});
    });

    test('should accept custom fallback chain', () => {
      const chain = { 'gemini': ['openai', 'claude'] };
      const manager = new TestableProviderPoolManager({}, {
        globalConfig: { providerFallbackChain: chain }
      });
      expect(manager.fallbackChain).toEqual(chain);
    });
  });

  describe('Error Handling', () => {
    test('should handle marking non-existent provider as unhealthy', () => {
      const manager = new TestableProviderPoolManager();
      expect(() => {
        manager.markProviderUnhealthy('nonexistent', { uuid: 'test' }, 'Error');
      }).not.toThrow();
    });

    test('should handle enabling non-existent provider', () => {
      const manager = new TestableProviderPoolManager();
      expect(() => {
        manager.enableProvider('nonexistent', { uuid: 'test' });
      }).not.toThrow();
    });

    test('should handle disabling non-existent provider', () => {
      const manager = new TestableProviderPoolManager();
      expect(() => {
        manager.disableProvider('nonexistent', { uuid: 'test' });
      }).not.toThrow();
    });
  });
});

describe('Provider Creation', () => {
  test('should create provider with default values', () => {
    const provider = createTestProvider();
    expect(provider).toHaveProperty('uuid');
    expect(provider).toHaveProperty('customName');
    expect(provider).toHaveProperty('isHealthy');
    expect(provider.isHealthy).toBe(true);
  });

  test('should override default values', () => {
    const provider = createTestProvider({
      uuid: 'custom-uuid',
      customName: 'Custom Name',
      isHealthy: false
    });
    expect(provider.uuid).toBe('custom-uuid');
    expect(provider.customName).toBe('Custom Name');
    expect(provider.isHealthy).toBe(false);
  });

  test('should create unique uuids', () => {
    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      uuids.add(createTestProvider().uuid);
    }
    expect(uuids.size).toBe(100);
  });
});

describe('Configuration Validation', () => {
  test('should use default maxErrorCount when not provided', () => {
    const manager = new TestableProviderPoolManager();
    expect(manager.maxErrorCount).toBe(10);
  });

  test('should use nullish coalescing for maxErrorCount', () => {
    const manager = new TestableProviderPoolManager({}, { maxErrorCount: 0 });
    expect(manager.maxErrorCount).toBe(0);
  });

  test('should use nullish coalescing for healthCheckInterval', () => {
    const manager = new TestableProviderPoolManager({}, { healthCheckInterval: 0 });
    expect(manager.healthCheckInterval).toBe(0);
  });
});
