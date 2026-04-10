/**
 * Provider Selector 模式
 * 支持多种选择策略：评分制、轮询、优先填充
 */

import logger from '../../utils/logger.js';

/**
 * Provider Selector 接口
 */
export class ProviderSelector {
    /**
     * 从可用 providers 中选择一个
     * @param {Array} providers - 可用的 provider 列表
     * @param {object} options - 选项
     * @returns {object|null} 选中的 provider 或 null
     */
    select(providers, options = {}) {
        throw new Error('Not implemented');
    }
}

/**
 * 基于评分的选择器（当前 LRU + 并发感知策略）
 * 评分越低越优先
 */
export class ScoreBasedSelector extends ProviderSelector {
    constructor(poolManager) {
        super();
        this.poolManager = poolManager;
    }

    select(providers, options = {}) {
        if (!providers || providers.length === 0) return null;

        const now = Date.now();
        // 防止 Math.min 空数组崩溃
        const seqs = providers.map(p => p.config?._lastSelectionSeq || 0);
        const minSeq = seqs.length > 0 ? Math.min(...seqs) : 0;

        const sorted = [...providers].sort((a, b) => {
            const scoreA = this.poolManager._calculateNodeScore ? this.poolManager._calculateNodeScore(a, now, minSeq) : 0;
            const scoreB = this.poolManager._calculateNodeScore ? this.poolManager._calculateNodeScore(b, now, minSeq) : 0;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return (a.uuid || '').localeCompare(b.uuid || '');
        });

        return sorted[0] || null;
    }
}

/**
 * Round-Robin 选择器
 * 简单的轮询策略
 */
export class RoundRobinSelector extends ProviderSelector {
    constructor() {
        super();
        this.indices = {};  // per-provider-type index
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

    /**
     * 重置指定类型的轮询索引
     * @param {string} type - provider 类型
     */
    reset(type) {
        if (type && this.indices[type] !== undefined) {
            delete this.indices[type];
        }
    }
}

/**
 * Fill-First 选择器（优先填充单个节点再轮询）
 * 尽量使用同一个节点，直到其达到限制
 */
export class FillFirstSelector extends ProviderSelector {
    constructor(poolManager) {
        super();
        this.poolManager = poolManager;
        this.lastSelected = null;
        this._selectPromise = null;  // 用于串行化并发选择，保证原子性
    }

    select(providers, options = {}) {
        if (!providers || providers.length === 0) return null;

        // 如果已有选择正在进行，等待其完成并返回其结果
        if (this._selectPromise) {
            return this._selectPromise.then(() => this._doSelect(providers, options));
        }

        // 创建新的选择操作
        this._selectPromise = this._doSelect(providers, options).finally(() => {
            // 清理引用
            this._selectPromise = null;
        });

        return this._selectPromise;
    }

    /**
     * 执行实际的选择逻辑
     * @param {Array} providers - 可用的 provider 列表
     * @param {object} options - 选项
     * @returns {object|null} 选中的 provider 或 null
     */
    _doSelect(providers, options = {}) {
        // 优先选择上次选中的节点（如果还健康）
        if (this.lastSelected) {
            const stillValid = providers.find(p =>
                p.uuid === this.lastSelected.uuid &&
                p.config?.isHealthy &&
                !p.config?.isDisabled
            );

            if (stillValid) {
                const state = stillValid.state || {};
                const rawLimit = stillValid.config?.concurrencyLimit;
                const concurrencyLimit = parseInt(rawLimit, 10);
                // 防止 NaN 导致检查失效
                if (isNaN(concurrencyLimit) || concurrencyLimit <= 0 || (state.activeCount || 0) < concurrencyLimit) {
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

    /**
     * 重置选择器状态
     */
    reset() {
        this.lastSelected = null;
        this._selectPromise = null;
    }
}

/**
 * Selector 工厂
 */
export class SelectorFactory {
    /**
     * 创建指定类型的 Selector
     * @param {string} type - selector 类型: 'score-based', 'round-robin', 'fill-first'
     * @param {object} poolManager - ProviderPoolManager 实例
     * @returns {ProviderSelector}
     */
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

export default {
    ProviderSelector,
    ScoreBasedSelector,
    RoundRobinSelector,
    FillFirstSelector,
    SelectorFactory
};
