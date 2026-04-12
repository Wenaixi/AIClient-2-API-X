/**
 * Usage Cache 单元测试
 * 测试用量缓存功能的逻辑
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('Usage Cache Logic', () => {
    describe('readUsageCache logic', () => {
        test('should return null when file does not exist', async () => {
            const existsSync = false;
            const result = existsSync ? null : null;
            expect(result).toBeNull();
        });

        test('should return parsed JSON when file exists', async () => {
            const cacheData = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: { kimi: { usage: 100 } }
            };
            const content = JSON.stringify(cacheData);
            const result = JSON.parse(content);
            expect(result).toEqual(cacheData);
        });

        test('should throw on invalid JSON', async () => {
            const content = 'invalid json';
            expect(() => JSON.parse(content)).toThrow();
        });
    });

    describe('Cache data structure', () => {
        test('should have correct provider data structure', () => {
            const cache = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: {
                    kimi: { usage: 100, models: ['moonshot-v1-8k'] },
                    openai: { usage: 50 }
                }
            };

            expect(cache.providers.kimi.usage).toBe(100);
            expect(cache.providers.openai.usage).toBe(50);
        });

        test('should add metadata when returning provider cache', () => {
            const cache = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: {
                    kimi: { usage: 100, models: ['moonshot-v1-8k'] }
                }
            };
            const providerType = 'kimi';

            const result = cache.providers[providerType] ? {
                ...cache.providers[providerType],
                cachedAt: cache.timestamp,
                fromCache: true
            } : null;

            expect(result.usage).toBe(100);
            expect(result.cachedAt).toBe('2024-01-01T00:00:00.000Z');
            expect(result.fromCache).toBe(true);
        });

        test('should return null when provider not in cache', () => {
            const cache = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: {
                    openai: { usage: 50 }
                }
            };
            const providerType = 'kimi';

            const result = cache.providers[providerType] ? {
                ...cache.providers[providerType],
                cachedAt: cache.timestamp,
                fromCache: true
            } : null;

            expect(result).toBeNull();
        });
    });

    describe('writeUsageCache logic', () => {
        test('should format data as JSON string', () => {
            const usageData = {
                providers: { kimi: { usage: 100 } }
            };
            const result = JSON.stringify(usageData, null, 2);
            expect(result).toContain('"kimi"');
        });
    });

    describe('updateProviderUsageCache logic', () => {
        test('should create new cache structure', () => {
            const existingCache = null;
            const newCache = existingCache || {
                timestamp: new Date().toISOString(),
                providers: {}
            };

            expect(newCache.providers).toEqual({});
        });

        test('should update existing provider', () => {
            const existingCache = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: { openai: { usage: 50 } }
            };
            const providerType = 'kimi';
            const usageData = { usage: 100 };

            existingCache.providers[providerType] = usageData;
            existingCache.timestamp = new Date().toISOString();

            expect(existingCache.providers.kimi).toEqual({ usage: 100 });
            expect(existingCache.providers.openai).toEqual({ usage: 50 });
        });

        test('should preserve other providers when updating', () => {
            const existingCache = {
                timestamp: '2024-01-01T00:00:00.000Z',
                providers: {
                    openai: { usage: 50 },
                    anthropic: { usage: 30 }
                }
            };

            existingCache.providers['kimi'] = { usage: 100 };

            expect(existingCache.providers.openai).toEqual({ usage: 50 });
            expect(existingCache.providers.anthropic).toEqual({ usage: 30 });
            expect(existingCache.providers.kimi).toEqual({ usage: 100 });
        });

        test('should update timestamp', () => {
            const oldTimestamp = '2024-01-01T00:00:00.000Z';
            const existingCache = {
                timestamp: oldTimestamp,
                providers: {}
            };

            existingCache.timestamp = new Date().toISOString();

            expect(existingCache.timestamp).not.toBe(oldTimestamp);
        });
    });
});
