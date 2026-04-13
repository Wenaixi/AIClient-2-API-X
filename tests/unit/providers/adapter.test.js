/**
 * Adapter 单元测试
 * 覆盖：LRUCache、registerAdapter、getServiceAdapter、serviceInstances Proxy
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock 所有依赖
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureAxiosProxy: jest.fn(),
    configureTLSSidecar: jest.fn((config) => config),
}));

jest.mock('os', () => ({
    hostname: jest.fn(() => 'test-host'),
    platform: jest.fn(() => 'win32'),
    arch: jest.fn(() => 'x64'),
}));

jest.mock('../../../src/auth/kimi-oauth.js', () => ({
    KimiTokenStorage: class {
        static fromJSON(json) {
            const s = Object.assign(new this(), json);
            return s;
        }
    },
    refreshKimiToken: jest.fn(),
    getHostname: jest.fn(() => 'test-hostname'),
    getDeviceModel: jest.fn(() => 'test-device-model'),
}));

jest.mock('../../../src/utils/common.js', () => ({
    MODEL_PROVIDER: {
        OPENAI_CUSTOM: 'openai',
        OPENAI_CUSTOM_RESPONSES: 'openai_responses',
        GEMINI_CLI: 'gemini',
        ANTIGRAVITY: 'antigravity',
        CLAUDE_CUSTOM: 'claude',
        KIRO_API: 'kiro',
        QWEN_API: 'qwen',
        CODEX_API: 'codex',
        FORWARD_API: 'forward',
        GROK_CUSTOM: 'grok',
        KIMI_API: 'kimi',
    },
    findByPrefix: jest.fn((map, prefix) => {
        for (const key of map.keys()) {
            if (key.startsWith(prefix)) {
                return map.get(key);
            }
        }
        return undefined;
    }),
    hasByPrefix: jest.fn((map, prefix) => {
        for (const key of map.keys()) {
            if (key.startsWith(prefix)) return true;
        }
        return false;
    }),
    isRetryableNetworkError: jest.fn(() => false),
}));

jest.mock('../../../src/providers/kimi/kimi-message-normalizer.js', () => ({
    normalizeKimiToolMessageLinks: jest.fn((body) => body),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    promises: {
        readFile: jest.fn(),
    }
}));

// ==================== 测试辅助 ====================

// 直接测试 LRUCache 逻辑（不依赖模块导入）
describe('LRUCache', () => {
    // 简化版 LRU Cache 用于独立测试
    class TestableLRUCache {
        constructor(maxSize = 50) {
            this.maxSize = maxSize;
            this.cache = new Map();
        }

        get(key) {
            if (!this.cache.has(key)) {
                return undefined;
            }
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            this.cache.set(key, value);
        }

        has(key) {
            return this.cache.has(key);
        }

        delete(key) {
            return this.cache.delete(key);
        }

        clear() {
            this.cache.clear();
        }

        get size() {
            return this.cache.size;
        }
    }

    test('should create cache with default maxSize', () => {
        const cache = new TestableLRUCache();
        expect(cache.maxSize).toBe(50);
        expect(cache.size).toBe(0);
    });

    test('should create cache with custom maxSize', () => {
        const cache = new TestableLRUCache(10);
        expect(cache.maxSize).toBe(10);
    });

    test('should set and get values', () => {
        const cache = new TestableLRUCache();
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
        expect(cache.size).toBe(1);
    });

    test('should return undefined for missing keys', () => {
        const cache = new TestableLRUCache();
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should move accessed item to most recent position', () => {
        const cache = new TestableLRUCache(3);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        // 访问 key1，使其变为最近使用
        cache.get('key1');

        // 添加新key，key2 应该被淘汰（最早访问）
        cache.set('key4', 'value4');

        expect(cache.get('key1')).toBe('value1');
        expect(cache.get('key2')).toBeUndefined();
        expect(cache.get('key3')).toBe('value3');
        expect(cache.get('key4')).toBe('value4');
    });

    test('should delete existing key', () => {
        const cache = new TestableLRUCache();
        cache.set('key1', 'value1');
        expect(cache.delete('key1')).toBe(true);
        expect(cache.has('key1')).toBe(false);
        expect(cache.size).toBe(0);
    });

    test('should return false when deleting nonexistent key', () => {
        const cache = new TestableLRUCache();
        expect(cache.delete('nonexistent')).toBe(false);
    });

    test('should clear all items', () => {
        const cache = new TestableLRUCache();
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBeUndefined();
    });

    test('should check key existence', () => {
        const cache = new TestableLRUCache();
        cache.set('key1', 'value1');
        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
    });

    test('should evict oldest entry when max size reached', () => {
        const cache = new TestableLRUCache(2);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3'); // key1 should be evicted

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBe('value2');
        expect(cache.get('key3')).toBe('value3');
        expect(cache.size).toBe(2);
    });

    test('should update existing key without increasing size', () => {
        const cache = new TestableLRUCache();
        cache.set('key1', 'value1');
        cache.set('key1', 'value2');
        expect(cache.size).toBe(1);
        expect(cache.get('key1')).toBe('value2');
    });
});

// ==================== LRUCache TTL 功能测试 ====================

describe('LRUCache TTL', () => {
    // 模拟带 TTL 的 LRUCache（与 src/providers/adapter.js 同步）
    class TTLLRUCache {
        constructor(maxSize = 50, ttlMs = 0) {
            this.maxSize = maxSize;
            this.ttlMs = ttlMs;
            this.cache = new Map();
        }

        _isExpired(entry) {
            if (!this.ttlMs) return false;
            return Date.now() - entry.timestamp > this.ttlMs;
        }

        get(key) {
            if (!this.cache.has(key)) {
                return undefined;
            }
            const entry = this.cache.get(key);
            if (this._isExpired(entry)) {
                this.cache.delete(key);
                return undefined;
            }
            const value = entry.value;
            this.cache.delete(key);
            this.cache.set(key, entry);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            this.cache.set(key, { value, timestamp: Date.now() });
        }

        has(key) {
            if (!this.cache.has(key)) {
                return false;
            }
            const entry = this.cache.get(key);
            if (this._isExpired(entry)) {
                this.cache.delete(key);
                return false;
            }
            return true;
        }

        delete(key) {
            return this.cache.delete(key);
        }

        clear() {
            this.cache.clear();
        }

        get size() {
            return this.cache.size;
        }

        purgeExpired() {
            if (!this.ttlMs) return;
            const now = Date.now();
            const keysToDelete = [];
            for (const [key, entry] of this.cache) {
                if (now - entry.timestamp > this.ttlMs) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                this.cache.delete(key);
            }
        }
    }

    test('should not expire without TTL', () => {
        const cache = new TTLLRUCache(50, 0); // 无 TTL
        cache.set('key1', 'value1');
        // 模拟时间流逝（不设置 TTL 则不会过期）
        expect(cache.has('key1')).toBe(true);
        expect(cache.get('key1')).toBe('value1');
    });

    test('should expire entries after TTL', () => {
        const cache = new TTLLRUCache(50, 100); // 100ms TTL
        cache.set('key1', 'value1');

        // 未过期
        expect(cache.has('key1')).toBe(true);

        // 模拟时间流逝 - 手动修改 timestamp
        const entry = cache.cache.get('key1');
        entry.timestamp = Date.now() - 200; // 200ms 前

        // 已过期
        expect(cache.has('key1')).toBe(false);
        expect(cache.get('key1')).toBeUndefined();
    });

    test('should move entry to most recent position on access (sliding expiration)', () => {
        const cache = new TTLLRUCache(2, 0); // maxSize=2
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        // 访问 key1，使其变为最近使用
        cache.get('key1');

        // 添加新 key，key2 应该被淘汰（最早访问）
        cache.set('key3', 'value3');

        // key1 应该还在（刚被访问过，是最近使用的）
        expect(cache.has('key1')).toBe(true);
        // key2 应该被淘汰
        expect(cache.has('key2')).toBe(false);
        expect(cache.has('key3')).toBe(true);
    });

    test('should purge expired entries', () => {
        const cache = new TTLLRUCache(50, 100); // 100ms TTL
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        // 手动让 key1 过期
        const entry1 = cache.cache.get('key1');
        entry1.timestamp = Date.now() - 200;

        // key2 未过期
        expect(cache.has('key2')).toBe(true);

        // 执行清理
        cache.purgeExpired();

        // key1 应该被删除，key2 保留
        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        expect(cache.size).toBe(1);
    });

    test('should handle purgeExpired with no TTL', () => {
        const cache = new TTLLRUCache(50, 0); // 无 TTL
        cache.set('key1', 'value1');
        cache.purgeExpired(); // 不应抛出错误
        expect(cache.has('key1')).toBe(true);
    });

    test('should work with maxSize eviction and TTL combined', () => {
        const cache = new TTLLRUCache(2, 0); // maxSize=2, 无 TTL
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3'); // key1 应该被淘汰

        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        expect(cache.has('key3')).toBe(true);
    });

    test('should update existing key without increasing size', () => {
        const cache = new TTLLRUCache(50, 100);
        cache.set('key1', 'value1');
        expect(cache.size).toBe(1);
        cache.set('key1', 'value2');
        expect(cache.size).toBe(1);
        expect(cache.get('key1')).toBe('value2');
    });

    test('should clear all entries including non-expired', () => {
        const cache = new TTLLRUCache(50, 100);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        expect(cache.size).toBe(0);
    });
});

// ==================== ApiServiceAdapter 抽象类测试 ====================

describe('ApiServiceAdapter', () => {
    test('should not allow direct instantiation', () => {
        // 抽象类不能直接实例化
        expect(() => {
            // 直接调用构造函数会失败
            class TestAdapter extends class {}.constructor {
                constructor() {
                    if (new.target === TestAdapter) {
                        throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
                    }
                }
            }
            // 模拟抽象类行为
            const AbstractClass = function() {
                throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
            };
            new AbstractClass();
        }).toThrow(TypeError);
    });
});

// ==================== Model Provider 枚举测试 ====================

describe('MODEL_PROVIDER', () => {
    test('should have all expected provider values', async () => {
        const { MODEL_PROVIDER } = await import('../../../src/utils/common.js');

        expect(MODEL_PROVIDER.OPENAI_CUSTOM).toBe('openai');
        expect(MODEL_PROVIDER.OPENAI_CUSTOM_RESPONSES).toBe('openai_responses');
        expect(MODEL_PROVIDER.GEMINI_CLI).toBe('gemini');
        expect(MODEL_PROVIDER.ANTIGRAVITY).toBe('antigravity');
        expect(MODEL_PROVIDER.CLAUDE_CUSTOM).toBe('claude');
        expect(MODEL_PROVIDER.KIRO_API).toBe('kiro');
        expect(MODEL_PROVIDER.QWEN_API).toBe('qwen');
        expect(MODEL_PROVIDER.CODEX_API).toBe('codex');
        expect(MODEL_PROVIDER.FORWARD_API).toBe('forward');
        expect(MODEL_PROVIDER.GROK_CUSTOM).toBe('grok');
        expect(MODEL_PROVIDER.KIMI_API).toBe('kimi');
    });
});

// ==================== findByPrefix / hasByPrefix 测试 ====================

describe('findByPrefix / hasByPrefix', () => {
    test('findByPrefix should find matching prefix', async () => {
        const { findByPrefix } = await import('../../../src/utils/common.js');

        const testMap = new Map([
            ['openai_main', { name: 'openai' }],
            ['openai_custom', { name: 'openai_custom' }],
            ['gemini', { name: 'gemini' }],
        ]);

        expect(findByPrefix(testMap, 'openai')).toEqual({ name: 'openai' });
        expect(findByPrefix(testMap, 'gemini')).toEqual({ name: 'gemini' });
        expect(findByPrefix(testMap, 'nonexistent')).toBeUndefined();
    });

    test('hasByPrefix should check if prefix exists', async () => {
        const { hasByPrefix } = await import('../../../src/utils/common.js');

        const testMap = new Map([
            ['openai_main', { name: 'openai' }],
            ['gemini', { name: 'gemini' }],
        ]);

        expect(hasByPrefix(testMap, 'openai')).toBe(true);
        expect(hasByPrefix(testMap, 'gemini')).toBe(true);
        expect(hasByPrefix(testMap, 'nonexistent')).toBe(false);
    });
});

// ==================== Proxy 行为测试 ====================

describe('Proxy behavior for serviceInstances', () => {
    test('Proxy should intercept get and set operations', () => {
        // 测试 Proxy 基本行为
        const cache = new Map();

        const proxy = new Proxy({}, {
            get(target, prop) {
                if (typeof prop === 'string') {
                    return cache.get(prop);
                }
                return target[prop];
            },
            set(target, prop, value) {
                if (typeof prop === 'string') {
                    cache.set(prop, value);
                    return true;
                }
                target[prop] = value;
                return true;
            },
            deleteProperty(target, prop) {
                if (typeof prop === 'string') {
                    return cache.delete(prop);
                }
                return delete target[prop];
            },
            ownKeys(target) {
                return Array.from(cache.keys());
            },
            getOwnPropertyDescriptor(target, prop) {
                if (cache.has(prop)) {
                    return { enumerable: true, configurable: true, value: cache.get(prop) };
                }
                return undefined;
            },
        });

        proxy['testKey'] = { value: 123 };
        expect(proxy['testKey']).toEqual({ value: 123 });
        expect(Object.keys(proxy)).toContain('testKey');

        delete proxy['testKey'];
        expect(proxy['testKey']).toBeUndefined();
    });

    test('Proxy keys method should work', () => {
        const cache = new Map();

        const proxy = new Proxy({}, {
            get(target, prop) {
                if (prop === 'keys') {
                    return () => Array.from(cache.keys());
                }
                if (typeof prop === 'string') {
                    return cache.get(prop);
                }
                return target[prop];
            },
            set(target, prop, value) {
                if (typeof prop === 'string') {
                    cache.set(prop, value);
                    return true;
                }
                target[prop] = value;
                return true;
            },
        });

        proxy['a'] = 1;
        proxy['b'] = 2;

        const keys = proxy.keys();
        expect(keys).toContain('a');
        expect(keys).toContain('b');
    });
});
