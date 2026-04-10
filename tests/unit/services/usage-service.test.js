/**
 * usage-service.js 深度单元测试
 * 增强对 UsageService 类和各种 format 函数的测试覆盖
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

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

// Mock service-manager
jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn()
}));

// Mock adapter
jest.mock('../../../src/providers/adapter.js', () => ({
    serviceInstances: {},
    MODEL_PROVIDER: {
        KIRO_API: 'claude-kiro-oauth',
        GEMINI_CLI: 'gemini-cli-oauth',
        ANTIGRAVITY: 'gemini-antigravity',
        CODEX_API: 'openai-codex-oauth',
        GROK_CUSTOM: 'grok-custom',
        KIMI_API: 'kimi-oauth'
    }
}));

// Mock common utils
jest.mock('../../../src/utils/common.js', () => ({
    MODEL_PROVIDER: {
        KIRO_API: 'claude-kiro-oauth',
        GEMINI_CLI: 'gemini-cli-oauth',
        ANTIGRAVITY: 'gemini-antigravity',
        CODEX_API: 'openai-codex-oauth',
        GROK_CUSTOM: 'grok-custom',
        KIMI_API: 'kimi-oauth'
    }
}));

// 导入被测试的模块
const usageServiceModule = require('../../../src/services/usage-service.js');
const {
    UsageService,
    usageService,
    formatKiroUsage,
    formatGeminiUsage,
    formatAntigravityUsage,
    formatGrokUsage,
    formatCodexUsage,
    formatKimiUsage
} = usageServiceModule;

// ============ UsageService 类测试 ============

describe('UsageService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new UsageService();
    });

    describe('构造函数', () => {
        test('should initialize with all provider handlers', () => {
            expect(service.providerHandlers).toBeDefined();
            expect(typeof service.providerHandlers['claude-kiro-oauth']).toBe('function');
            expect(typeof service.providerHandlers['gemini-cli-oauth']).toBe('function');
            expect(typeof service.providerHandlers['gemini-antigravity']).toBe('function');
            expect(typeof service.providerHandlers['openai-codex-oauth']).toBe('function');
            expect(typeof service.providerHandlers['grok-custom']).toBe('function');
            expect(typeof service.providerHandlers['kimi-oauth']).toBe('function');
        });
    });

    describe('getUsage', () => {
        test('should throw error for unsupported provider', async () => {
            await expect(service.getUsage('unsupported-provider')).rejects.toThrow('不支持的提供商类型');
        });

        test('should call correct handler for supported provider', async () => {
            const mockHandler = jest.fn().mockResolvedValue({ usage: 'test' });
            service.providerHandlers['claude-kiro-oauth'] = mockHandler;

            const result = await service.getUsage('claude-kiro-oauth', 'uuid-1');
            expect(mockHandler).toHaveBeenCalledWith('uuid-1');
            expect(result).toEqual({ usage: 'test' });
        });

        test('should pass null uuid to handler when not provided', async () => {
            const mockHandler = jest.fn().mockResolvedValue({ usage: 'test' });
            service.providerHandlers['claude-kiro-oauth'] = mockHandler;

            await service.getUsage('claude-kiro-oauth');
            expect(mockHandler).toHaveBeenCalledWith(null);
        });
    });

    describe('getSupportedProviders', () => {
        test('should return array of supported provider types', () => {
            const providers = service.getSupportedProviders();
            expect(Array.isArray(providers)).toBe(true);
            expect(providers).toContain('claude-kiro-oauth');
            expect(providers).toContain('gemini-cli-oauth');
            expect(providers).toContain('kimi-oauth');
        });

        test('should return all registered providers', () => {
            const providers = service.getSupportedProviders();
            expect(providers.length).toBe(6); // 6 providers without AUTO
        });
    });
});

// ============ formatKimiUsage 测试 ============

describe('formatKimiUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatKimiUsage(null)).toBeNull();
        });

        test('should return null for undefined input', () => {
            expect(formatKimiUsage(undefined)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatKimiUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription.title).toBe('Kimi OAuth');
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('ACCOUNT');
        });
    });

    describe('用户信息解析', () => {
        test('should parse user.email', () => {
            const result = formatKimiUsage({ user: { email: 'test@kimi.com' } });
            expect(result.user.email).toBe('test@kimi.com');
        });

        test('should parse user.id as userId', () => {
            const result = formatKimiUsage({ user: { id: 'user-123' } });
            expect(result.user.userId).toBe('user-123');
        });

        test('should parse user.user_id as userId', () => {
            const result = formatKimiUsage({ user: { user_id: 'user-456' } });
            expect(result.user.userId).toBe('user-456');
        });

        test('should prefer user.id over user.user_id', () => {
            const result = formatKimiUsage({ user: { id: 'primary', user_id: 'secondary' } });
            expect(result.user.userId).toBe('primary');
        });
    });

    describe('订阅信息解析', () => {
        test('should parse subscription.name as title', () => {
            const result = formatKimiUsage({ subscription: { name: 'Kimi Pro' } });
            expect(result.subscription.title).toBe('Kimi Pro');
        });

        test('should parse subscription.title as title', () => {
            const result = formatKimiUsage({ subscription: { title: 'Kimi Plus' } });
            expect(result.subscription.title).toBe('Kimi Plus');
        });

        test('should fallback to default title when no name/title', () => {
            const result = formatKimiUsage({ subscription: { type: 'basic' } });
            expect(result.subscription.title).toBe('Kimi OAuth');
        });

        test('should parse reset_date', () => {
            const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
            const result = formatKimiUsage({ subscription: { reset_date: futureDate } });
            expect(result.nextDateReset).toBe(futureDate);
            expect(result.daysUntilReset).toBeGreaterThan(0);
        });

        test('should parse billing_cycle_end', () => {
            const futureDate = new Date(Date.now() + 86400000 * 15).toISOString();
            const result = formatKimiUsage({ subscription: { billing_cycle_end: futureDate } });
            expect(result.nextDateReset).toBe(futureDate);
        });

        test('should prefer reset_date over billing_cycle_end', () => {
            const date1 = new Date(Date.now() + 86400000).toISOString();
            const date2 = new Date(Date.now() + 86400000 * 2).toISOString();
            const result = formatKimiUsage({
                subscription: { reset_date: date1, billing_cycle_end: date2 }
            });
            expect(result.nextDateReset).toBe(date1);
        });

        test('should handle plan field as fallback for subscription', () => {
            const result = formatKimiUsage({ plan: { name: 'Kimi Plan' } });
            expect(result.subscription.title).toBe('Kimi Plan');
        });
    });

    describe('用量解析 - breakdown 数组', () => {
        test('should parse quota.breakdown array', () => {
            const result = formatKimiUsage({
                quota: {
                    breakdown: [{
                        resource_type: 'MESSAGES',
                        display_name: 'Messages',
                        unit: 'count',
                        used: 50,
                        total: 100
                    }]
                }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0]).toMatchObject({
                resourceType: 'MESSAGES',
                displayName: 'Messages',
                currentUsage: 50,
                usageLimit: 100
            });
        });

        test('should handle multiple breakdown items', () => {
            const result = formatKimiUsage({
                quota: {
                    breakdown: [
                        { resource_type: 'R1', display_name: 'Resource 1', used: 10, total: 100 },
                        { resource_type: 'R2', display_name: 'Resource 2', used: 20, total: 200 }
                    ]
                }
            });
            expect(result.usageBreakdown).toHaveLength(2);
        });

        test('should set default values for missing breakdown fields', () => {
            const result = formatKimiUsage({
                quota: { breakdown: [{}] }
            });
            expect(result.usageBreakdown[0]).toMatchObject({
                resourceType: 'USAGE',
                displayName: 'Usage',
                unit: 'requests',
                currentUsage: 0,
                usageLimit: 0
            });
        });
    });

    describe('用量解析 - 简单格式', () => {
        test('should parse quota.used and quota.total', () => {
            const result = formatKimiUsage({
                quota: { used: 75, total: 200 }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].currentUsage).toBe(75);
            expect(result.usageBreakdown[0].usageLimit).toBe(200);
        });
    });

    describe('Raw data handling', () => {
        test('should include raw data when no usage breakdown exists', () => {
            const result = formatKimiUsage({
                raw: { some: 'data', status: 200 }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('RAW_DATA');
            expect(result.usageBreakdown[0].rawData).toEqual({ some: 'data', status: 200 });
        });

        test('should not include raw data when usage breakdown exists', () => {
            const result = formatKimiUsage({
                raw: { some: 'data' },
                quota: { used: 10, total: 100 }
            });
            expect(result.usageBreakdown[0].resourceType).toBe('USAGE');
            expect(result.usageBreakdown[0].rawData).toBeUndefined();
        });
    });

    describe('默认 ACCOUNT fallback', () => {
        test('should create default ACCOUNT entry when no usage data', () => {
            const result = formatKimiUsage({ user: { email: 'test@kimi.com' } });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('ACCOUNT');
        });
    });

    describe('边界情况', () => {
        test('should handle negative days until reset', () => {
            const pastDate = new Date(Date.now() - 86400000 * 5).toISOString();
            const result = formatKimiUsage({ subscription: { reset_date: pastDate } });
            expect(result.daysUntilReset).toBeLessThan(0);
        });

        test('should handle large usage values', () => {
            const result = formatKimiUsage({
                quota: { used: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER * 2 }
            });
            expect(result.usageBreakdown[0].currentUsage).toBe(Number.MAX_SAFE_INTEGER);
        });

        test('should handle zero usage', () => {
            const result = formatKimiUsage({ quota: { used: 0, total: 100 } });
            expect(result.usageBreakdown[0].currentUsage).toBe(0);
            expect(result.usageBreakdown[0].usageLimit).toBe(100);
        });
    });
});

// ============ formatKiroUsage 测试 ============

describe('formatKiroUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatKiroUsage(null)).toBeNull();
        });

        test('should return null for undefined input', () => {
            expect(formatKiroUsage(undefined)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatKiroUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription).toBeNull();
            expect(result.usageBreakdown).toHaveLength(0);
        });
    });

    describe('订阅信息解析', () => {
        test('should parse subscriptionInfo', () => {
            const result = formatKiroUsage({
                subscriptionInfo: {
                    subscriptionTitle: 'Kiro Pro',
                    type: 'pro',
                    upgradeCapability: true,
                    overageCapability: false
                }
            });
            expect(result.subscription).toEqual({
                title: 'Kiro Pro',
                type: 'pro',
                upgradeCapability: true,
                overageCapability: false
            });
        });
    });

    describe('用户信息解析', () => {
        test('should parse userInfo', () => {
            const result = formatKiroUsage({
                userInfo: {
                    email: 'test@kiro.com',
                    userId: 'user-123'
                }
            });
            expect(result.user).toEqual({
                email: 'test@kiro.com',
                userId: 'user-123'
            });
        });
    });

    describe('用量明细解析', () => {
        test('should parse usageBreakdownList', () => {
            const result = formatKiroUsage({
                usageBreakdownList: [{
                    resourceType: 'MESSAGES',
                    displayName: 'Messages',
                    displayNamePlural: 'Messages',
                    unit: 'count',
                    currency: 'USD',
                    currentUsage: 50,
                    usageLimit: 100,
                    currentOverages: 0,
                    overageCap: 10,
                    overageRate: 0.01,
                    overageCharges: 0.5,
                    nextDateReset: 1704067200
                }]
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('MESSAGES');
            expect(result.usageBreakdown[0].currentUsage).toBe(50);
            expect(result.usageBreakdown[0].nextDateReset).toBeDefined();
        });

        test('should handle freeTrialInfo', () => {
            const result = formatKiroUsage({
                usageBreakdownList: [{
                    resourceType: 'TRIAL',
                    displayName: 'Trial',
                    currentUsageWithPrecision: 5.5,
                    usageLimitWithPrecision: 10,
                    freeTrialInfo: {
                        freeTrialStatus: 'active',
                        currentUsageWithPrecision: 2,
                        usageLimitWithPrecision: 5,
                        freeTrialExpiry: 1704067200
                    }
                }]
            });
            expect(result.usageBreakdown[0].freeTrial).toEqual({
                status: 'active',
                currentUsage: 2,
                usageLimit: 5,
                expiresAt: expect.any(String)
            });
        });

        test('should handle bonuses', () => {
            const result = formatKiroUsage({
                usageBreakdownList: [{
                    resourceType: 'BONUS',
                    displayName: 'Bonus',
                    bonuses: [{
                        bonusCode: 'BONUS123',
                        displayName: 'Referral Bonus',
                        description: 'For referring friends',
                        status: 'active',
                        currentUsage: 1,
                        usageLimit: 5,
                        redeemedAt: 1704067200,
                        expiresAt: 1704153600
                    }]
                }]
            });
            expect(result.usageBreakdown[0].bonuses).toHaveLength(1);
            expect(result.usageBreakdown[0].bonuses[0].code).toBe('BONUS123');
        });
    });

    describe('日期处理', () => {
        test('should convert nextDateReset timestamp to ISO string', () => {
            const result = formatKiroUsage({
                nextDateReset: 1704067200,
                usageBreakdownList: []
            });
            expect(result.nextDateReset).toBeDefined();
            expect(new Date(result.nextDateReset).toString()).not.toBe('Invalid Date');
        });

        test('should handle null nextDateReset', () => {
            const result = formatKiroUsage({
                nextDateReset: null,
                usageBreakdownList: []
            });
            expect(result.nextDateReset).toBeNull();
        });
    });
});

// ============ formatGeminiUsage 测试 ============

describe('formatGeminiUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatGeminiUsage(null)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatGeminiUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription.title).toBe('Gemini CLI OAuth');
            expect(result.usageBreakdown).toHaveLength(0);
        });
    });

    describe('配额信息解析', () => {
        test('should parse quotaInfo', () => {
            const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
            const result = formatGeminiUsage({
                quotaInfo: {
                    currentTier: 'Pro',
                    quotaResetTime: futureDate
                }
            });
            expect(result.subscription.title).toBe('Pro');
            expect(result.nextDateReset).toBe(futureDate);
            expect(result.daysUntilReset).toBeGreaterThan(0);
        });
    });

    describe('模型配额解析', () => {
        test('should parse models with remaining percentage', () => {
            const result = formatGeminiUsage({
                models: {
                    'gemini-pro:token': {
                        remaining: 0.75,
                        resetTime: '2024-01-01T00:00:00Z',
                        resetTimeRaw: '2024-01-01T00:00:00Z'
                    }
                }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].currentUsage).toBe(25); // 100 - 75
            expect(result.usageBreakdown[0].remaining).toBe(0.75);
            expect(result.usageBreakdown[0].modelName).toBe('gemini-pro');
            expect(result.usageBreakdown[0].tokenType).toBe('token');
        });

        test('should handle multiple models', () => {
            const result = formatGeminiUsage({
                models: {
                    'gemini-pro:text': { remaining: 0.5, resetTime: '2024-01-01' },
                    'gemini-pro:audio': { remaining: 0.8, resetTime: '2024-01-01' }
                }
            });
            expect(result.usageBreakdown).toHaveLength(2);
        });

        test('should use inputTokenLimit and outputTokenLimit', () => {
            const result = formatGeminiUsage({
                models: {
                    'gemini-pro:text': {
                        remaining: 0.9,
                        inputTokenLimit: 1000000,
                        outputTokenLimit: 100000
                    }
                }
            });
            expect(result.usageBreakdown[0].inputTokenLimit).toBe(1000000);
            expect(result.usageBreakdown[0].outputTokenLimit).toBe(100000);
        });
    });
});

// ============ formatAntigravityUsage 测试 ============

describe('formatAntigravityUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatAntigravityUsage(null)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatAntigravityUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription.title).toBe('Gemini Antigravity');
        });
    });

    describe('配额信息解析', () => {
        test('should parse quotaInfo', () => {
            const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
            const result = formatAntigravityUsage({
                quotaInfo: {
                    currentTier: 'Advanced',
                    quotaResetTime: futureDate
                }
            });
            expect(result.subscription.title).toBe('Advanced');
        });
    });

    describe('模型配额解析', () => {
        test('should parse models with displayName', () => {
            const result = formatAntigravityUsage({
                models: {
                    'gemini-2.0-flash': {
                        remaining: 0.6,
                        displayName: 'Gemini 2.0 Flash',
                        resetTime: '2024-01-01'
                    }
                }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].displayName).toBe('Gemini 2.0 Flash');
            expect(result.usageBreakdown[0].modelName).toBe('gemini-2.0-flash');
        });

        test('should use modelName as displayName fallback', () => {
            const result = formatAntigravityUsage({
                models: {
                    'custom-model': {
                        remaining: 0.5
                    }
                }
            });
            expect(result.usageBreakdown[0].displayName).toBe('custom-model');
        });
    });
});

// ============ formatGrokUsage 测试 ============

describe('formatGrokUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatGrokUsage(null)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatGrokUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription.title).toBe('Grok Custom');
            expect(result.usageBreakdown).toHaveLength(0);
        });
    });

    describe('用量解析 - tokens', () => {
        test('should parse totalLimit and usedQueries', () => {
            const result = formatGrokUsage({
                unit: 'tokens',
                totalLimit: 10000,
                usedQueries: 2500
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('TOKEN_USAGE');
            expect(result.usageBreakdown[0].displayName).toBe('Remaining Tokens');
            expect(result.usageBreakdown[0].currentUsage).toBe(2500);
            expect(result.usageBreakdown[0].usageLimit).toBe(10000);
        });
    });

    describe('用量解析 - queries', () => {
        test('should parse remainingTokens', () => {
            const result = formatGrokUsage({
                remainingTokens: 5000
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].displayName).toBe('Remaining Tokens');
            expect(result.usageBreakdown[0].usageLimit).toBe(5000);
        });
    });
});

// ============ formatCodexUsage 测试 ============

describe('formatCodexUsage', () => {
    describe('空值处理', () => {
        test('should return null for null input', () => {
            expect(formatCodexUsage(null)).toBeNull();
        });

        test('should return default structure for empty object', () => {
            const result = formatCodexUsage({});
            expect(result).not.toBeNull();
            expect(result.subscription.title).toBe('Codex OAuth');
            expect(result.usageBreakdown).toHaveLength(0);
        });
    });

    describe('计划信息解析', () => {
        test('should parse raw.planType', () => {
            const result = formatCodexUsage({
                raw: { planType: 'pro' }
            });
            expect(result.subscription.title).toBe('Codex (pro)');
        });
    });

    describe('配额信息解析', () => {
        test('should parse rateLimit.primaryWindow.resetAt', () => {
            const futureDate = new Date(Date.now() + 86400000 * 30);
            const result = formatCodexUsage({
                raw: {
                    rateLimit: {
                        primaryWindow: {
                            resetAt: futureDate.getTime() / 1000
                        }
                    }
                }
            });
            expect(result.nextDateReset).toBeDefined();
            expect(result.daysUntilReset).toBeGreaterThan(0);
        });
    });

    describe('模型配额解析', () => {
        test('should parse models with remaining percentage', () => {
            const result = formatCodexUsage({
                models: {
                    'codex-plus:text': {
                        remaining: 0.7,
                        resetTime: '2024-01-01T00:00:00Z',
                        resetTimeRaw: 1704067200 // Unix timestamp in seconds
                    }
                }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].currentUsage).toBe(30); // 100 - 70
            expect(result.usageBreakdown[0].remaining).toBe(0.7);
            expect(result.usageBreakdown[0].modelName).toBe('codex-plus:text');
        });

        test('should include rateLimit in breakdown item', () => {
            const result = formatCodexUsage({
                models: {
                    'codex': { remaining: 0.5 }
                },
                raw: {
                    rateLimit: {
                        primaryWindow: { resetAt: 1704067200 }
                    }
                }
            });
            expect(result.usageBreakdown[0].rateLimit).toBeDefined();
        });
    });
});

// ============ usageService 单例测试 ============

describe('usageService singleton', () => {
    test('should be instance of UsageService', () => {
        expect(usageService).toBeInstanceOf(UsageService);
    });

    test('should have all provider handlers registered', () => {
        const providers = usageService.getSupportedProviders();
        expect(providers).toContain('claude-kiro-oauth');
        expect(providers).toContain('gemini-cli-oauth');
        expect(providers).toContain('gemini-antigravity');
        expect(providers).toContain('openai-codex-oauth');
        expect(providers).toContain('grok-custom');
        expect(providers).toContain('kimi-oauth');
    });
});
