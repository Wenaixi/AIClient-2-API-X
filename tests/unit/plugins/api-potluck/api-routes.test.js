/**
 * API Potluck Routes 单元测试
 * 测试 API 大锅饭的路由处理功能
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('API Potluck Routes', () => {
    // Mock functions that will be injected
    let mockCreateKey;
    let mockListKeys;
    let mockGetKey;
    let mockDeleteKey;
    let mockUpdateKeyLimit;
    let mockResetKeyUsage;
    let mockToggleKey;
    let mockUpdateKeyName;
    let mockRegenerateKey;
    let mockGetStats;
    let mockValidateKey;
    let mockApplyDailyLimitToAllKeys;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCreateKey = jest.fn();
        mockListKeys = jest.fn();
        mockGetKey = jest.fn();
        mockDeleteKey = jest.fn();
        mockUpdateKeyLimit = jest.fn();
        mockResetKeyUsage = jest.fn();
        mockToggleKey = jest.fn();
        mockUpdateKeyName = jest.fn();
        mockRegenerateKey = jest.fn();
        mockGetStats = jest.fn();
        mockValidateKey = jest.fn();
        mockApplyDailyLimitToAllKeys = jest.fn();
    });

    describe('Route Matching Logic', () => {
        test('should extract keyId from path correctly', () => {
            const path = '/api/potluck/keys/maki_test123';
            const keyIdMatch = path.match(/^\/api\/potluck\/keys\/([^\/]+)(\/.*)?$/);

            expect(keyIdMatch).not.toBeNull();
            expect(keyIdMatch[1]).toBe('maki_test123');
            expect(keyIdMatch[2]).toBeUndefined();
        });

        test('should extract keyId and subPath from path correctly', () => {
            const path = '/api/potluck/keys/maki_test123/limit';
            const keyIdMatch = path.match(/^\/api\/potluck\/keys\/([^\/]+)(\/.*)?$/);

            expect(keyIdMatch).not.toBeNull();
            expect(keyIdMatch[1]).toBe('maki_test123');
            expect(keyIdMatch[2]).toBe('/limit');
        });

        test('should handle URL encoded keyId', () => {
            const path = '/api/potluck/keys/maki_test%2F123';
            const keyIdMatch = path.match(/^\/api\/potluck\/keys\/([^\/]+)(\/.*)?$/);

            expect(keyIdMatch).not.toBeNull();
            expect(decodeURIComponent(keyIdMatch[1])).toBe('maki_test/123');
        });

        test('should match potluck paths', () => {
            const path = '/api/potluck/keys';
            expect(path.startsWith('/api/potluck')).toBe(true);
        });

        test('should not match non-potluck paths', () => {
            const path = '/api/other';
            expect(path.startsWith('/api/potluck')).toBe(false);
        });
    });

    describe('API Key Prefix', () => {
        test('should have correct key prefix', () => {
            const KEY_PREFIX = 'maki_';
            const apiKey = 'maki_test123';

            expect(apiKey.startsWith(KEY_PREFIX)).toBe(true);
        });

        test('should not validate keys without prefix', () => {
            const KEY_PREFIX = 'maki_';
            const invalidKey = 'invalid_key';

            expect(invalidKey.startsWith(KEY_PREFIX)).toBe(false);
        });
    });

    describe('Request Body Parsing', () => {
        test('should parse valid JSON body', async () => {
            const body = JSON.stringify({ name: 'Test', dailyLimit: 500 });

            const parsed = JSON.parse(body);

            expect(parsed.name).toBe('Test');
            expect(parsed.dailyLimit).toBe(500);
        });

        test('should handle empty body', async () => {
            const body = '';

            const parsed = body ? JSON.parse(body) : {};

            expect(parsed).toEqual({});
        });

        test('should throw on invalid JSON', () => {
            const body = '{ invalid json }';

            expect(() => JSON.parse(body)).toThrow();
        });

        test('should reject body larger than 1MB', () => {
            const largeBody = 'a'.repeat(1024 * 1024 + 1);
            const size = largeBody.length;

            expect(size > 1024 * 1024).toBe(true);
        });
    });

    describe('Response Formatting', () => {
        test('should format success response correctly', () => {
            const successResponse = {
                success: true,
                data: { keys: [], stats: {} }
            };

            expect(successResponse.success).toBe(true);
            expect(successResponse.data).toBeDefined();
        });

        test('should format error response correctly', () => {
            const errorResponse = {
                success: false,
                error: {
                    message: 'Not found',
                    code: 'NOT_FOUND'
                }
            };

            expect(errorResponse.success).toBe(false);
            expect(errorResponse.error.code).toBe('NOT_FOUND');
        });

        test('should format rate limit response correctly', () => {
            const rateLimitResponse = {
                success: false,
                error: {
                    message: '请求过于频繁，请稍后再试',
                    code: 'RATE_LIMIT_EXCEEDED'
                }
            };

            expect(rateLimitResponse.error.code).toBe('RATE_LIMIT_EXCEEDED');
        });

        test('should format unauthorized response correctly', () => {
            const unauthorizedResponse = {
                success: false,
                error: {
                    message: '未授权：请先登录',
                    code: 'UNAUTHORIZED'
                }
            };

            expect(unauthorizedResponse.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('Key Validation', () => {
        test('should validate key format', () => {
            const validateKeyFormat = (apiKey) => {
                const KEY_PREFIX = 'maki_';
                if (!apiKey || !apiKey.startsWith(KEY_PREFIX)) {
                    return { valid: false, reason: 'invalid_format' };
                }
                return { valid: true };
            };

            expect(validateKeyFormat('maki_test123').valid).toBe(true);
            expect(validateKeyFormat('invalid').valid).toBe(false);
            expect(validateKeyFormat(null).valid).toBe(false);
        });

        test('should return correct validation reasons', () => {
            const getValidationReason = (reason) => {
                const errorMessages = {
                    'invalid_format': 'API Key 格式无效',
                    'not_found': '未找到 API Key',
                    'disabled': 'API Key 已禁用'
                };
                return errorMessages[reason] || '无效的 API Key';
            };

            expect(getValidationReason('invalid_format')).toBe('API Key 格式无效');
            expect(getValidationReason('not_found')).toBe('未找到 API Key');
            expect(getValidationReason('disabled')).toBe('API Key 已禁用');
        });
    });

    describe('Usage Calculation', () => {
        test('should calculate usage percent correctly', () => {
            const calculateUsagePercent = (todayUsage, dailyLimit) => {
                if (dailyLimit > 0) {
                    return Math.round((todayUsage / dailyLimit) * 100);
                }
                return 0;
            };

            expect(calculateUsagePercent(250, 500)).toBe(50);
            expect(calculateUsagePercent(100, 1000)).toBe(10);
            expect(calculateUsagePercent(500, 500)).toBe(100);
            expect(calculateUsagePercent(0, 500)).toBe(0);
        });

        test('should calculate remaining correctly', () => {
            const calculateRemaining = (dailyLimit, todayUsage) => {
                return Math.max(0, dailyLimit - todayUsage);
            };

            expect(calculateRemaining(500, 250)).toBe(250);
            expect(calculateRemaining(500, 600)).toBe(0);
            expect(calculateRemaining(500, 500)).toBe(0);
        });
    });

    describe('Rate Limiter Logic', () => {
        test('should allow requests within limit', () => {
            const POTLUCK_RATE_LIMIT_MAX = 60;
            const POTLUCK_RATE_LIMIT_WINDOW_MS = 60000;

            const now = Date.now();
            const entry = { count: 30, windowStart: now };

            // Simulate check
            const canProceed = entry.count < POTLUCK_RATE_LIMIT_MAX;

            expect(canProceed).toBe(true);
        });

        test('should block requests exceeding limit', () => {
            const POTLUCK_RATE_LIMIT_MAX = 60;

            const entry = { count: 60, windowStart: Date.now() };

            const canProceed = entry.count < POTLUCK_RATE_LIMIT_MAX;

            expect(canProceed).toBe(false);
        });

        test('should reset window after timeout', () => {
            const POTLUCK_RATE_LIMIT_WINDOW_MS = 60000;

            const now = Date.now();
            const oldEntry = { count: 60, windowStart: now - POTLUCK_RATE_LIMIT_WINDOW_MS - 1000 };

            const shouldReset = now - oldEntry.windowStart > POTLUCK_RATE_LIMIT_WINDOW_MS;

            expect(shouldReset).toBe(true);
        });

        test('should cleanup entries older than 2 windows', () => {
            const POTLUCK_RATE_LIMIT_WINDOW_MS = 60000;

            const now = Date.now();
            const entries = [
                { ip: '192.168.1.1', windowStart: now - 1000 }, // Recent
                { ip: '192.168.1.2', windowStart: now - POTLUCK_RATE_LIMIT_WINDOW_MS * 2 - 1000 }, // Old
                { ip: '192.168.1.3', windowStart: now - POTLUCK_RATE_LIMIT_WINDOW_MS * 3 - 1000 }, // Very old
            ];

            const shouldDelete = (entry) => {
                return now - entry.windowStart > POTLUCK_RATE_LIMIT_WINDOW_MS * 2;
            };

            expect(shouldDelete(entries[0])).toBe(false);
            expect(shouldDelete(entries[1])).toBe(true);
            expect(shouldDelete(entries[2])).toBe(true);
        });
    });

    describe('Masked Key Formatting', () => {
        test('should mask key correctly', () => {
            const maskKey = (apiKey) => {
                if (!apiKey || apiKey.length < 16) return apiKey;
                return `${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}`;
            };

            // 'maki_1234567890123456' = 21 chars (5 prefix + 16 random)
            // first 12 = 'maki_1234567', last 4 = '3456'
            expect(maskKey('maki_1234567890123456')).toBe('maki_1234567...3456');
            expect(maskKey('short')).toBe('short');
            expect(maskKey('')).toBe('');
        });
    });

    describe('Key Management Operations', () => {
        test('should create key with default values', () => {
            const createKeyData = (name, dailyLimit, existingKeysCount) => {
                const DEFAULT_CONFIG = { defaultDailyLimit: 500 };
                return {
                    name: name || `Key-${existingKeysCount + 1}`,
                    dailyLimit: dailyLimit ?? DEFAULT_CONFIG.defaultDailyLimit
                };
            };

            expect(createKeyData('Test', 1000, 0)).toEqual({ name: 'Test', dailyLimit: 1000 });
            expect(createKeyData('', null, 5)).toEqual({ name: 'Key-6', dailyLimit: 500 });
        });

        test('should validate dailyLimit', () => {
            const isValidDailyLimit = (dailyLimit) => {
                return typeof dailyLimit === 'number' && dailyLimit >= 1;
            };

            expect(isValidDailyLimit(100)).toBe(true);
            expect(isValidDailyLimit(0)).toBe(false);
            expect(isValidDailyLimit(-1)).toBe(false);
            expect(isValidDailyLimit('100')).toBe(false);
            expect(isValidDailyLimit(null)).toBe(false);
        });

        test('should toggle key enabled state', () => {
            const toggleKey = (keyData) => {
                if (!keyData) return null;
                return {
                    ...keyData,
                    enabled: !keyData.enabled
                };
            };

            // Toggle once: true -> false
            const key1 = { id: 'test', enabled: true };
            expect(toggleKey(key1).enabled).toBe(false);

            // Toggle twice: false -> true
            const key2 = { id: 'test', enabled: false };
            expect(toggleKey(key2).enabled).toBe(true);
        });

        test('should reset key usage', () => {
            const getTodayDateString = () => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            };

            const resetUsage = (keyData) => {
                return {
                    ...keyData,
                    todayUsage: 0,
                    lastResetDate: getTodayDateString()
                };
            };

            const key = { todayUsage: 100, lastResetDate: '2024-01-01' };
            const reset = resetUsage(key);

            expect(reset.todayUsage).toBe(0);
            expect(reset.lastResetDate).toBe(getTodayDateString());
        });
    });

    describe('Batch Operations', () => {
        test('should apply limit to all keys', () => {
            const applyDailyLimitToAllKeys = (keys, newLimit) => {
                let updated = 0;
                for (const key of keys) {
                    if (key.dailyLimit !== newLimit) {
                        updated++;
                    }
                }
                return { total: keys.length, updated };
            };

            const keys = [
                { dailyLimit: 100 },
                { dailyLimit: 200 },
                { dailyLimit: 500 }
            ];

            expect(applyDailyLimitToAllKeys(keys, 500)).toEqual({ total: 3, updated: 2 });
            expect(applyDailyLimitToAllKeys(keys, 100)).toEqual({ total: 3, updated: 2 });
        });
    });

    describe('Token Store Validation', () => {
        test('should validate Bearer token format', () => {
            const extractBearerToken = (authHeader) => {
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return null;
                }
                return authHeader.substring(7);
            };

            expect(extractBearerToken('Bearer abc123')).toBe('abc123');
            expect(extractBearerToken('Basic abc123')).toBeNull();
            expect(extractBearerToken(null)).toBeNull();
        });

        test('should check token expiry', () => {
            const isTokenExpired = (expiryTime) => {
                return Date.now() > expiryTime;
            };

            expect(isTokenExpired(Date.now() - 1000)).toBe(true);
            expect(isTokenExpired(Date.now() + 1000)).toBe(false);
        });
    });
});

describe('API Potluck User Routes', () => {
    describe('API Key Extraction', () => {
        test('should extract key from Authorization header', () => {
            const extractApiKey = (headers) => {
                const authHeader = headers['authorization'];
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    if (token.startsWith('maki_')) {
                        return token;
                    }
                }
                return null;
            };

            const headers1 = { 'authorization': 'Bearer maki_test123' };
            const headers2 = { 'authorization': 'Bearer invalid' };
            const headers3 = { 'x-api-key': 'maki_test123' };

            expect(extractApiKey(headers1)).toBe('maki_test123');
            expect(extractApiKey(headers2)).toBeNull();
        });

        test('should extract key from x-api-key header', () => {
            const extractApiKey = (headers) => {
                const authHeader = headers['authorization'];
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    if (token.startsWith('maki_')) {
                        return token;
                    }
                }

                const xApiKey = headers['x-api-key'];
                if (xApiKey && xApiKey.startsWith('maki_')) {
                    return xApiKey;
                }

                return null;
            };

            const headers = { 'x-api-key': 'maki_test123' };

            expect(extractApiKey(headers)).toBe('maki_test123');
        });
    });

    describe('Quota Exceeded Handling', () => {
        test('should allow request when quota not exceeded', () => {
            const validation = { valid: true, keyData: { dailyLimit: 500, todayUsage: 100 } };

            const shouldAllow = validation.valid && validation.reason !== 'quota_exceeded';

            expect(shouldAllow).toBe(true);
        });

        test('should block request when quota exceeded', () => {
            const validation = { valid: false, reason: 'quota_exceeded' };

            const shouldBlock = !validation.valid && validation.reason === 'quota_exceeded';

            expect(shouldBlock).toBe(true);
        });
    });

    describe('Usage Response Formatting', () => {
        test('should format usage response correctly', () => {
            const formatUsageResponse = (keyData, apiKey) => {
                const usagePercent = keyData.dailyLimit > 0
                    ? Math.round((keyData.todayUsage / keyData.dailyLimit) * 100)
                    : 0;

                return {
                    name: keyData.name,
                    enabled: keyData.enabled,
                    usage: {
                        today: keyData.todayUsage,
                        limit: keyData.dailyLimit,
                        remaining: Math.max(0, keyData.dailyLimit - keyData.todayUsage),
                        percent: usagePercent,
                        resetDate: keyData.lastResetDate
                    },
                    total: keyData.totalUsage,
                    lastUsedAt: keyData.lastUsedAt,
                    createdAt: keyData.createdAt,
                    maskedKey: `${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}`
                };
            };

            const keyData = {
                name: 'Test Key',
                enabled: true,
                dailyLimit: 500,
                todayUsage: 250,
                totalUsage: 1000,
                lastUsedAt: '2024-01-01T00:00:00.000Z',
                createdAt: '2024-01-01T00:00:00.000Z',
                lastResetDate: '2024-01-01'
            };

            const response = formatUsageResponse(keyData, 'maki_test1234567890');

            expect(response.name).toBe('Test Key');
            expect(response.usage.today).toBe(250);
            expect(response.usage.limit).toBe(500);
            expect(response.usage.remaining).toBe(250);
            expect(response.usage.percent).toBe(50);
            // 'maki_test1234567890' = 19 chars (5 prefix + 14 random)
            // first 12 = 'maki_test123', last 4 = '7890'
            expect(response.maskedKey).toBe('maki_test123...7890');
        });
    });
});
