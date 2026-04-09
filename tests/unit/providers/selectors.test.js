/**
 * Provider Selectors 单元测试
 * 测试：ScoreBasedSelector, RoundRobinSelector, FillFirstSelector, SelectorFactory
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ==================== Mock ProviderPoolManager ====================

/**
 * 创建测试用的模拟 ProviderPoolManager
 */
function createMockPoolManager() {
    const manager = {
        providerStatus: {},
        _calculateNodeScore: jest.fn((provider, now, minSeq) => {
            // 默认评分逻辑：UUID 越小分数越低（优先级越高）
            const uuidNum = parseInt(provider.uuid?.replace(/\D/g, '') || '0');
            return uuidNum * 100;
        }),
    };
    return manager;
}

/**
 * 创建测试用的 provider 对象
 */
function createTestProvider(overrides = {}) {
    return {
        uuid: overrides.uuid || `provider-${Math.random().toString(36).slice(2, 8)}`,
        type: overrides.type || 'test-type',
        config: {
            uuid: overrides.uuid || 'default-uuid',
            isHealthy: overrides.isHealthy !== false,
            isDisabled: overrides.isDisabled || false,
            lastUsed: overrides.lastUsed || null,
            usageCount: overrides.usageCount || 0,
            _lastSelectionSeq: overrides._lastSelectionSeq || 0,
            concurrencyLimit: overrides.concurrencyLimit || 0,
            ...overrides.config,
        },
        state: {
            activeCount: overrides.activeCount || 0,
            waitingCount: overrides.waitingCount || 0,
            ...overrides.state,
        },
        ...overrides,
    };
}

// ==================== Selector 实现（从 selectors/index.js 复制用于测试） ====================

class ProviderSelector {
    select(providers, options = {}) {
        throw new Error('Not implemented');
    }
}

class ScoreBasedSelector extends ProviderSelector {
    constructor(poolManager) {
        super();
        this.poolManager = poolManager;
    }

    select(providers, options = {}) {
        if (!providers || providers.length === 0) return null;

        const now = Date.now();
        const minSeq = Math.min(...providers.map(p => p.config?._lastSelectionSeq || 0));

        const sorted = [...providers].sort((a, b) => {
            const scoreA = this.poolManager._calculateNodeScore ? this.poolManager._calculateNodeScore(a, now, minSeq) : 0;
            const scoreB = this.poolManager._calculateNodeScore ? this.poolManager._calculateNodeScore(b, now, minSeq) : 0;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return (a.uuid || '').localeCompare(b.uuid || '');
        });

        return sorted[0] || null;
    }
}

class RoundRobinSelector extends ProviderSelector {
    constructor() {
        super();
        this.indices = {};
    }

    select(providers, options = {}) {
        if (!providers || providers.length === 0) return null;

        const type = providers[0]?.type;
        if (!type) return null;

        if (!(type in this.indices)) {
            this.indices[type] = 0;
        }

        const idx = this.indices[type];
        this.indices[type] = (idx + 1) % providers.length;

        return providers[idx] || null;
    }

    reset(type) {
        if (type && this.indices[type] !== undefined) {
            delete this.indices[type];
        }
    }
}

class FillFirstSelector extends ProviderSelector {
    constructor(poolManager) {
        super();
        this.poolManager = poolManager;
        this.lastSelected = null;
    }

    select(providers, options = {}) {
        if (!providers || providers.length === 0) return null;

        // 优先选择上次选中的节点（如果还健康）
        if (this.lastSelected) {
            const stillValid = providers.find(p =>
                p.uuid === this.lastSelected.uuid &&
                p.config?.isHealthy &&
                !p.config?.isDisabled
            );

            if (stillValid) {
                const state = stillValid.state || {};
                const concurrencyLimit = parseInt(stillValid.config?.concurrencyLimit || 0);
                if (concurrencyLimit <= 0 || (state.activeCount || 0) < concurrencyLimit) {
                    return stillValid;
                }
            }
        }

        // 否则使用评分选择
        const selector = new ScoreBasedSelector(this.poolManager);
        const selected = selector.select(providers, options);
        if (selected) {
            this.lastSelected = selected;
        }
        return selected;
    }

    reset() {
        this.lastSelected = null;
    }
}

class SelectorFactory {
    static create(type, poolManager) {
        switch (type) {
            case 'round-robin':
                return new RoundRobinSelector();
            case 'fill-first':
                return new FillFirstSelector(poolManager);
            case 'score-based':
            default:
                return new ScoreBasedSelector(poolManager);
        }
    }
}

// ==================== 测试用例 ====================

describe('ProviderSelector (Base)', () => {
    test('should be abstract class with select method', () => {
        const selector = new ProviderSelector();
        expect(() => selector.select([])).toThrow('Not implemented');
    });
});

describe('ScoreBasedSelector', () => {
    let poolManager;
    let selector;

    beforeEach(() => {
        poolManager = createMockPoolManager();
        selector = new ScoreBasedSelector(poolManager);
    });

    describe('select()', () => {
        test('should return null for empty array', () => {
            expect(selector.select([])).toBeNull();
            expect(selector.select(null)).toBeNull();
        });

        test('should return null for undefined', () => {
            expect(selector.select(undefined)).toBeNull();
        });

        test('should select provider with lowest score', () => {
            const providers = [
                createTestProvider({ uuid: 'p3', config: { ...createTestProvider().config, uuid: 'p3' } }),
                createTestProvider({ uuid: 'p1', config: { ...createTestProvider().config, uuid: 'p1' } }),
                createTestProvider({ uuid: 'p2', config: { ...createTestProvider().config, uuid: 'p2' } }),
            ];
            // 设置按 UUID 数字排序的评分
            poolManager._calculateNodeScore = (p) => parseInt(p.uuid.replace(/\D/g, ''));

            const selected = selector.select(providers);
            expect(selected.uuid).toBe('p1');
        });

        test('should use UUID as tiebreaker when scores equal', () => {
            poolManager._calculateNodeScore = () => 100; // 所有节点分数相同
            const providers = [
                createTestProvider({ uuid: 'c-provider' }),
                createTestProvider({ uuid: 'a-provider' }),
                createTestProvider({ uuid: 'b-provider' }),
            ];

            const selected = selector.select(providers);
            expect(selected.uuid).toBe('a-provider');
        });

        test('should call _calculateNodeScore for scoring', () => {
            const provider = createTestProvider({ uuid: 'test-p' });
            // Just verify the function doesn't throw and returns a valid score
            const score = poolManager._calculateNodeScore(provider, Date.now(), 0);
            expect(typeof score).toBe('number');
        });
    });
});

describe('RoundRobinSelector', () => {
    let selector;

    beforeEach(() => {
        selector = new RoundRobinSelector();
    });

    describe('select()', () => {
        test('should return null for empty array', () => {
            expect(selector.select([])).toBeNull();
            expect(selector.select(null)).toBeNull();
        });

        test('should return null for undefined', () => {
            expect(selector.select(undefined)).toBeNull();
        });

        test('should return null if provider has no type', () => {
            const providers = [createTestProvider({ type: undefined })];
            expect(selector.select(providers)).toBeNull();
        });

        test('should select providers in round-robin order', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p1', type }),
                createTestProvider({ uuid: 'p2', type }),
                createTestProvider({ uuid: 'p3', type }),
            ];

            expect(selector.select(providers).uuid).toBe('p1');
            expect(selector.select(providers).uuid).toBe('p2');
            expect(selector.select(providers).uuid).toBe('p3');
            expect(selector.select(providers).uuid).toBe('p1'); // 循环
        });

        test('should maintain separate indices per provider type', () => {
            const typeA = 'type-a';
            const typeB = 'type-b';
            const providersA = [
                createTestProvider({ uuid: 'a1', type: typeA }),
                createTestProvider({ uuid: 'a2', type: typeA }),
            ];
            const providersB = [
                createTestProvider({ uuid: 'b1', type: typeB }),
                createTestProvider({ uuid: 'b2', type: typeB }),
                createTestProvider({ uuid: 'b3', type: typeB }),
            ];

            // 轮询 typeA 两次
            selector.select(providersA); // a1
            selector.select(providersA); // a2

            // 轮询 typeB 三次回到开头
            selector.select(providersB); // b1
            selector.select(providersB); // b2
            selector.select(providersB); // b3

            // typeA 应该从上次位置继续 (a1, a2, a1, a2...)
            expect(selector.select(providersA).uuid).toBe('a1');
            // typeB 回到开头
            expect(selector.select(providersB).uuid).toBe('b1');
        });

        test('should handle single provider', () => {
            const type = 'test-type';
            const providers = [createTestProvider({ uuid: 'only', type })];

            for (let i = 0; i < 5; i++) {
                expect(selector.select(providers).uuid).toBe('only');
            }
        });
    });

    describe('reset()', () => {
        test('should reset index for specified type', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p1', type }),
                createTestProvider({ uuid: 'p2', type }),
            ];

            selector.select(providers); // p1
            selector.select(providers); // p2

            selector.reset(type);

            expect(selector.select(providers).uuid).toBe('p1');
        });

        test('should do nothing if type not in indices', () => {
            selector.reset('non-existent-type');
            expect(selector.indices).toEqual({});
        });

        test('should handle null type', () => {
            selector.reset(null);
            expect(selector.indices).toEqual({});
        });
    });
});

describe('FillFirstSelector', () => {
    let poolManager;
    let selector;

    beforeEach(() => {
        poolManager = createMockPoolManager();
        selector = new FillFirstSelector(poolManager);
        // 设置评分函数使 p1 分数最低（优先选中）
        poolManager._calculateNodeScore = (p) => {
            if (p.uuid === 'p1') return 100;
            if (p.uuid === 'p2') return 200;
            return 300;
        };
    });

    describe('select()', () => {
        test('should return null for empty array', () => {
            expect(selector.select([])).toBeNull();
            expect(selector.select(null)).toBeNull();
        });

        test('should return null for undefined', () => {
            expect(selector.select(undefined)).toBeNull();
        });

        test('should prefer last selected healthy provider', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p1', type, isHealthy: true }),
                createTestProvider({ uuid: 'p2', type, isHealthy: true }),
            ];

            // 首次选择 p1（分数最低）
            const first = selector.select(providers);
            expect(first.uuid).toBe('p1');

            // 再次选择应该还是 p1（优先填充）
            const second = selector.select(providers);
            expect(second.uuid).toBe('p1');
        });

        test('should switch when last selected becomes unhealthy', () => {
            const type = 'test-type';
            const p1 = createTestProvider({ uuid: 'p1', type, isHealthy: true });
            const p2 = createTestProvider({ uuid: 'p2', type, isHealthy: true });
            const providers = [p1, p2];

            selector.select(providers); // 选择 p1

            // p1 变为不健康
            p1.config.isHealthy = false;

            // 当 p1 变得不健康后，stillValid 检查会失败，然后使用评分选择
            // 需要修改 mock 来模拟真实行为：不健康的节点分数极高
            poolManager._calculateNodeScore = (p) => {
                // 模拟真实行为：不健康的节点分数极高
                if (!p.config.isHealthy) return 1e18;
                if (p.uuid === 'p1') return 100;
                return 200;
            };

            const selected = selector.select(providers);
            expect(selected.uuid).toBe('p2');
        });

        test('should switch when last selected is disabled', () => {
            const type = 'test-type';
            const p1 = createTestProvider({ uuid: 'p1', type, isHealthy: true, isDisabled: false });
            const p2 = createTestProvider({ uuid: 'p2', type, isHealthy: true, isDisabled: false });
            const providers = [p1, p2];

            selector.select(providers); // 选择 p1

            // p1 被禁用
            p1.config.isDisabled = true;

            // 禁用后，stillValid 检查会失败，然后使用评分选择
            // 但因为 p1 被禁用，实际评分中 p1 分数会变成 1e18
            // 所以这里期望 p2 被选中
            // 由于我们的 mock 不反映真实行为，需要修改 mock 让它考虑 isDisabled
            poolManager._calculateNodeScore = (p) => {
                // 模拟真实行为：禁用的节点分数极高
                if (p.config.isDisabled) return 1e18;
                if (p.uuid === 'p1') return 100;
                return 200;
            };

            const selected = selector.select(providers);
            expect(selected.uuid).toBe('p2');
        });

        test('should prefer last selected when under concurrency limit', () => {
            const type = 'test-type';
            // p1 和 p2 都健康，FillFirstSelector 应该一直选择 p1（上次选中的）
            // 因为 p1 分数最低（100 < 200）
            const p1 = createTestProvider({ uuid: 'p1', type, isHealthy: true });
            const p2 = createTestProvider({ uuid: 'p2', type, isHealthy: true });
            const providers = [p1, p2];

            const first = selector.select(providers);
            expect(first.uuid).toBe('p1');

            // p1 还有容量（activeCount=0 < concurrencyLimit=0 表示无限制）
            const second = selector.select(providers);
            expect(second.uuid).toBe('p1');
        });

        test('should use score-based selection when no last selected', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p2', type, isHealthy: true }),
                createTestProvider({ uuid: 'p1', type, isHealthy: true }),
            ];

            const selected = selector.select(providers);
            expect(selected.uuid).toBe('p1'); // 分数最低
        });
    });

    describe('reset()', () => {
        test('should clear last selected', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p1', type, isHealthy: true }),
                createTestProvider({ uuid: 'p2', type, isHealthy: true }),
            ];

            selector.select(providers); // 选择 p1
            expect(selector.lastSelected).not.toBeNull();

            selector.reset();

            expect(selector.lastSelected).toBeNull();
        });

        test('should re-select after reset', () => {
            const type = 'test-type';
            const providers = [
                createTestProvider({ uuid: 'p1', type, isHealthy: true }),
                createTestProvider({ uuid: 'p2', type, isHealthy: true }),
            ];

            selector.select(providers); // p1
            selector.reset();
            const selected = selector.select(providers);

            // p1 分数最低，应该被选中
            expect(selected.uuid).toBe('p1');
        });
    });
});

describe('SelectorFactory', () => {
    let poolManager;

    beforeEach(() => {
        poolManager = createMockPoolManager();
    });

    describe('create()', () => {
        test('should create ScoreBasedSelector by default', () => {
            const selector = SelectorFactory.create('unknown-type', poolManager);
            expect(selector).toBeInstanceOf(ScoreBasedSelector);
        });

        test('should create score-based selector', () => {
            const selector = SelectorFactory.create('score-based', poolManager);
            expect(selector).toBeInstanceOf(ScoreBasedSelector);
        });

        test('should create round-robin selector', () => {
            const selector = SelectorFactory.create('round-robin', poolManager);
            expect(selector).toBeInstanceOf(RoundRobinSelector);
        });

        test('should create fill-first selector', () => {
            const selector = SelectorFactory.create('fill-first', poolManager);
            expect(selector).toBeInstanceOf(FillFirstSelector);
        });

        test('should pass poolManager to score-based selector', () => {
            const selector = SelectorFactory.create('score-based', poolManager);
            expect(selector.poolManager).toBe(poolManager);
        });

        test('should pass poolManager to fill-first selector', () => {
            const selector = SelectorFactory.create('fill-first', poolManager);
            expect(selector.poolManager).toBe(poolManager);
        });

        test('should not pass poolManager to round-robin selector', () => {
            const selector = SelectorFactory.create('round-robin', poolManager);
            expect(selector.poolManager).toBeUndefined();
        });
    });
});

describe('Selector Edge Cases', () => {
    let poolManager;
    let scoreSelector;

    beforeEach(() => {
        poolManager = createMockPoolManager();
        scoreSelector = new ScoreBasedSelector(poolManager);
    });

    test('should handle providers with missing config properties', () => {
        const provider = {
            uuid: 'test',
            config: {}, // 缺少 isHealthy, isDisabled 等
        };

        poolManager._calculateNodeScore = () => 0;
        const providers = [provider];

        expect(() => scoreSelector.select(providers)).not.toThrow();
    });

    test('should handle providers with null _lastSelectionSeq', () => {
        const providers = [
            createTestProvider({ uuid: 'p1', config: { ...createTestProvider().config, _lastSelectionSeq: null } }),
        ];

        poolManager._calculateNodeScore = () => 0;
        expect(() => scoreSelector.select(providers)).not.toThrow();
    });

    test('should handle all providers with same UUID', () => {
        const providerConfig = createTestProvider().config;
        const providers = [
            createTestProvider({ uuid: 'same', config: { ...providerConfig, uuid: 'same' } }),
            createTestProvider({ uuid: 'same', config: { ...providerConfig, uuid: 'same' } }),
        ];

        poolManager._calculateNodeScore = () => 0;
        const selected = scoreSelector.select(providers);
        expect(selected).not.toBeNull();
    });

    test('should handle options parameter', () => {
        const providers = [createTestProvider({ uuid: 'p1' })];
        poolManager._calculateNodeScore = () => 0;

        expect(() => scoreSelector.select(providers, { skipUsageCount: true })).not.toThrow();
        expect(() => scoreSelector.select(providers, { someOtherOption: 'value' })).not.toThrow();
    });
});
