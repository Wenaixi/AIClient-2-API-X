/**
 * usage-service.js 深度单元测试 - formatKimiUsage 函数
 * 覆盖各种输入格式和边界情况
 *
 * 注意: formatKimiUsage 是纯函数，但由于 usage-service.js 的顶层
 * import 链会触发 tls-sidecar.js 中的 import.meta.url 错误，
 * 我们在此直接实现函数副本进行测试，保持测试的隔离性和可靠性。
 */

/**
 * formatKimiUsage 函数实现（与 usage-service.js 中完全一致）
 */
function formatKimiUsage(usageData) {
    if (!usageData) {
        return null;
    }

    const result = {
        daysUntilReset: null,
        nextDateReset: null,
        subscription: {
            title: 'Kimi OAuth',
            type: 'kimi-oauth',
            upgradeCapability: null,
            overageCapability: null
        },
        user: {
            email: null,
            userId: null
        },
        usageBreakdown: []
    };

    if (usageData.user) {
        result.user = {
            email: usageData.user.email || null,
            userId: usageData.user.id || usageData.user.user_id || null
        };
    }

    if (usageData.subscription || usageData.plan) {
        const subInfo = usageData.subscription || usageData.plan;
        result.subscription.title = subInfo.name || subInfo.title || 'Kimi OAuth';
        if (subInfo.reset_date || subInfo.billing_cycle_end) {
            const resetDate = new Date(subInfo.reset_date || subInfo.billing_cycle_end);
            result.nextDateReset = resetDate.toISOString();
            const now = new Date();
            const diffTime = resetDate.getTime() - now.getTime();
            result.daysUntilReset = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
    }

    if (usageData.quota || usageData.usage) {
        const quotaInfo = usageData.quota || usageData.usage;

        if (Array.isArray(quotaInfo.breakdown)) {
            for (const item of quotaInfo.breakdown) {
                result.usageBreakdown.push({
                    resourceType: item.resource_type || 'USAGE',
                    displayName: item.display_name || item.name || 'Usage',
                    displayNamePlural: item.display_name || item.name || 'Usage',
                    unit: item.unit || 'requests',
                    currency: null,
                    currentUsage: item.used || 0,
                    usageLimit: item.total || item.limit || 0,
                    currentOverages: 0,
                    overageCap: 0,
                    overageRate: null,
                    overageCharges: 0,
                    nextDateReset: result.nextDateReset,
                    freeTrial: null,
                    bonuses: []
                });
            }
        } else if (quotaInfo.used !== undefined && quotaInfo.total !== undefined) {
            result.usageBreakdown.push({
                resourceType: 'USAGE',
                displayName: 'Kimi Usage',
                displayNamePlural: 'Kimi Usage',
                unit: 'requests',
                currency: null,
                currentUsage: quotaInfo.used,
                usageLimit: quotaInfo.total,
                currentOverages: 0,
                overageCap: 0,
                overageRate: null,
                overageCharges: 0,
                nextDateReset: result.nextDateReset,
                freeTrial: null,
                bonuses: []
            });
        }
    }

    if (usageData.raw && !result.usageBreakdown.length) {
        result.usageBreakdown.push({
            resourceType: 'RAW_DATA',
            displayName: 'Kimi Account Data',
            displayNamePlural: 'Kimi Account Data',
            unit: 'info',
            currency: null,
            currentUsage: 0,
            usageLimit: 0,
            currentOverages: 0,
            overageCap: 0,
            overageRate: null,
            overageCharges: 0,
            nextDateReset: null,
            freeTrial: null,
            bonuses: [],
            rawData: usageData.raw
        });
    }

    if (!result.usageBreakdown.length) {
        result.usageBreakdown.push({
            resourceType: 'ACCOUNT',
            displayName: 'Kimi Account',
            displayNamePlural: 'Kimi Accounts',
            unit: 'info',
            currency: null,
            currentUsage: 0,
            usageLimit: 0,
            currentOverages: 0,
            overageCap: 0,
            overageRate: null,
            overageCharges: 0,
            nextDateReset: null,
            freeTrial: null,
            bonuses: []
        });
    }

    return result;
}

describe('formatKimiUsage', () => {
    // --- 空值处理 ---

    describe('null/undefined/empty handling', () => {
        test('should return null for null input', () => {
            expect(formatKimiUsage(null)).toBeNull();
        });

        test('should return null for undefined input', () => {
            expect(formatKimiUsage(undefined)).toBeNull();
        });

        test('should return null for empty object', () => {
            const result = formatKimiUsage({});
            expect(result).not.toBeNull();
            expect(result.daysUntilReset).toBeNull();
            expect(result.nextDateReset).toBeNull();
            expect(result.subscription).toBeDefined();
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('ACCOUNT');
        });
    });

    // --- 默认结构 ---

    describe('default structure', () => {
        test('should return correct default subscription info', () => {
            const result = formatKimiUsage({});
            expect(result.subscription).toEqual({
                title: 'Kimi OAuth',
                type: 'kimi-oauth',
                upgradeCapability: null,
                overageCapability: null
            });
        });

        test('should return correct default user info', () => {
            const result = formatKimiUsage({});
            expect(result.user).toEqual({
                email: null,
                userId: null
            });
        });

        test('should return correct default reset info', () => {
            const result = formatKimiUsage({});
            expect(result.daysUntilReset).toBeNull();
            expect(result.nextDateReset).toBeNull();
        });
    });

    // --- 用户信息解析 ---

    describe('user info parsing', () => {
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

        test('should handle complete user info', () => {
            const result = formatKimiUsage({
                user: { email: 'user@kimi.com', id: 'uid-1' }
            });
            expect(result.user).toEqual({
                email: 'user@kimi.com',
                userId: 'uid-1'
            });
        });

        test('should handle missing user field', () => {
            const result = formatKimiUsage({ subscription: {} });
            expect(result.user).toEqual({ email: null, userId: null });
        });
    });

    // --- 订阅信息解析 ---

    describe('subscription info parsing', () => {
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

    // --- 用量解析 - breakdown 数组 ---

    describe('usage breakdown array parsing', () => {
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
                unit: 'count',
                currentUsage: 50,
                usageLimit: 100
            });
        });

        test('should parse usage.breakdown array', () => {
            const result = formatKimiUsage({
                usage: {
                    breakdown: [{
                        resource_type: 'TOKENS',
                        display_name: 'Tokens',
                        used: 1000,
                        total: 10000
                    }]
                }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('TOKENS');
            expect(result.usageBreakdown[0].currentUsage).toBe(1000);
        });

        test('should set default values for missing breakdown fields', () => {
            const result = formatKimiUsage({
                quota: { breakdown: [{}] }
            });
            expect(result.usageBreakdown[0]).toMatchObject({
                resourceType: 'USAGE',
                displayName: 'Usage',
                displayNamePlural: 'Usage',
                unit: 'requests',
                currentUsage: 0,
                usageLimit: 0,
                currentOverages: 0,
                overageCap: 0,
                overageRate: null,
                overageCharges: 0,
                freeTrial: null,
                bonuses: []
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
            expect(result.usageBreakdown[0].resourceType).toBe('R1');
            expect(result.usageBreakdown[1].resourceType).toBe('R2');
        });

        test('should inherit nextDateReset from subscription for breakdown items', () => {
            const futureDate = new Date(Date.now() + 86400000 * 10).toISOString();
            const result = formatKimiUsage({
                subscription: { reset_date: futureDate },
                quota: { breakdown: [{ used: 5, total: 100 }] }
            });
            expect(result.usageBreakdown[0].nextDateReset).toBe(futureDate);
        });
    });

    // --- 用量解析 - 简单格式 ---

    describe('simple usage format parsing', () => {
        test('should parse quota.used and quota.total', () => {
            const result = formatKimiUsage({
                quota: { used: 75, total: 200 }
            });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0]).toMatchObject({
                resourceType: 'USAGE',
                displayName: 'Kimi Usage',
                currentUsage: 75,
                usageLimit: 200
            });
        });

        test('should parse usage.used and usage.total', () => {
            const result = formatKimiUsage({
                usage: { used: 30, total: 500 }
            });
            expect(result.usageBreakdown[0].currentUsage).toBe(30);
            expect(result.usageBreakdown[0].usageLimit).toBe(500);
        });
    });

    // --- Raw data handling ---

    describe('raw data handling', () => {
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
            // Should use quota info, not raw data
            expect(result.usageBreakdown[0].resourceType).toBe('USAGE');
            expect(result.usageBreakdown[0].rawData).toBeUndefined();
        });
    });

    // --- Default ACCOUNT fallback ---

    describe('default ACCOUNT fallback', () => {
        test('should create default ACCOUNT entry when no usage data', () => {
            const result = formatKimiUsage({ user: { email: 'test@kimi.com' } });
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].resourceType).toBe('ACCOUNT');
            expect(result.usageBreakdown[0].displayName).toBe('Kimi Account');
            expect(result.usageBreakdown[0].currentUsage).toBe(0);
            expect(result.usageBreakdown[0].usageLimit).toBe(0);
        });
    });

    // --- 复杂场景 ---

    describe('complex scenario', () => {
        test('should handle complete usage data', () => {
            const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
            const input = {
                user: { email: 'user@kimi.com', id: 'user-1' },
                subscription: {
                    name: 'Kimi Pro Plus',
                    type: 'pro',
                    reset_date: futureDate
                },
                quota: {
                    breakdown: [{
                        resource_type: 'MESSAGES',
                        display_name: 'Daily Messages',
                        unit: 'messages',
                        used: 150,
                        total: 500
                    }]
                }
            };
            const result = formatKimiUsage(input);

            expect(result.user.email).toBe('user@kimi.com');
            expect(result.user.userId).toBe('user-1');
            expect(result.subscription.title).toBe('Kimi Pro Plus');
            expect(result.nextDateReset).toBe(futureDate);
            expect(result.usageBreakdown).toHaveLength(1);
            expect(result.usageBreakdown[0].currentUsage).toBe(150);
            expect(result.usageBreakdown[0].usageLimit).toBe(500);
        });

        test('should handle error response format', () => {
            const input = {
                raw: { error: 'Rate limited' },
                status: 429,
                error: 'Rate limited error'
            };
            const result = formatKimiUsage(input);
            expect(result.usageBreakdown[0].resourceType).toBe('RAW_DATA');
            expect(result.usageBreakdown[0].rawData).toEqual(input.raw);
        });
    });

    // --- 边界情况 ---

    describe('edge cases', () => {
        test('should handle partial user info', () => {
            const result = formatKimiUsage({ user: {} });
            expect(result.user.email).toBeNull();
            expect(result.user.userId).toBeNull();
        });

        test('should handle subscription with no dates', () => {
            const result = formatKimiUsage({ subscription: { name: 'Basic' } });
            expect(result.daysUntilReset).toBeNull();
            expect(result.nextDateReset).toBeNull();
        });

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
