/**
 * Provider 测试数据工厂
 * 生成各种测试用的 Provider 数据
 */

import { generateTestUUID } from '../helpers/test-helpers.js';

/**
 * Provider 类型枚举
 */
export const ProviderTypes = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
  CLAUDE: 'claude',
  GROK: 'grok',
  CODEX: 'codex',
  KIRO: 'kiro',
  QWEN: 'qwen',
};

/**
 * Provider 状态枚举
 */
export const ProviderStatus = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DISABLED: 'disabled',
  PENDING: 'pending',
};

/**
 * 创建 Provider 配置
 * @param {object} overrides - 覆盖属性
 * @returns {object} Provider 配置
 */
export function createProviderConfig(overrides = {}) {
  const uuid = generateTestUUID();

  return {
    uuid,
    customName: `Test Provider ${uuid.slice(0, 8)}`,
    credPath: `configs/test/credentials-${uuid.slice(0, 8)}.json`,
    isHealthy: true,
    isDisabled: false,
    lastUsed: null,
    usageCount: 0,
    errorCount: 0,
    lastErrorTime: null,
    lastErrorMessage: null,
    refreshCount: 0,
    needsRefresh: false,
    checkModelName: null,
    _lastSelectionSeq: 0,
    ...overrides,
  };
}

/**
 * 创建 Gemini Provider
 * @param {object} overrides
 * @returns {object}
 */
export function createGeminiProvider(overrides = {}) {
  return createProviderConfig({
    credPath: 'configs/gemini/credentials.json',
    checkModelName: 'gemini-2.0-flash-exp',
    ...overrides,
  });
}

/**
 * 创建 OpenAI Provider
 * @param {object} overrides
 * @returns {object}
 */
export function createOpenAIProvider(overrides = {}) {
  return createProviderConfig({
    credPath: 'configs/openai/credentials.json',
    checkModelName: 'gpt-4o',
    apiKey: 'sk-test-' + generateTestUUID().replace(/-/g, ''),
    baseUrl: 'https://api.openai.com/v1',
    ...overrides,
  });
}

/**
 * 创建 Claude Provider
 * @param {object} overrides
 * @returns {object}
 */
export function createClaudeProvider(overrides = {}) {
  return createProviderConfig({
    credPath: 'configs/claude/credentials.json',
    checkModelName: 'claude-3-5-sonnet-20241022',
    apiKey: 'sk-ant-test-' + generateTestUUID().replace(/-/g, ''),
    ...overrides,
  });
}

/**
 * 创建 Provider Pool
 * @param {string} providerType - Provider 类型
 * @param {number} count - 数量
 * @param {object} overrides - 覆盖属性
 * @returns {Array}
 */
export function createProviderPool(providerType, count = 3, overrides = {}) {
  return Array.from({ length: count }, (_, i) => {
    const baseConfig = createProviderConfig({
      customName: `${providerType}-provider-${i + 1}`,
      ...overrides,
    });

    switch (providerType) {
      case ProviderTypes.GEMINI:
        return createGeminiProvider(baseConfig);
      case ProviderTypes.OPENAI:
        return createOpenAIProvider(baseConfig);
      case ProviderTypes.CLAUDE:
        return createClaudeProvider(baseConfig);
      default:
        return baseConfig;
    }
  });
}

/**
 * 创建完整的 Provider Pools 对象
 * @param {object} config - 配置 { gemini: 2, openai: 3, ... }
 * @returns {object}
 */
export function createProviderPools(config = {}) {
  const pools = {};

  for (const [type, count] of Object.entries(config)) {
    pools[type] = createProviderPool(type, count);
  }

  return pools;
}

/**
 * 创建 Provider Status 对象（运行时状态）
 * @param {object} config - Provider 配置
 * @param {object} overrides - 覆盖属性
 * @returns {object}
 */
export function createProviderStatus(config, overrides = {}) {
  return {
    config,
    consecutiveErrors: 0,
    lastError: null,
    isRefreshing: false,
    rateLimitRemaining: null,
    rateLimitReset: null,
    ...overrides,
  };
}

/**
 * Provider Factory 对象
 */
export const ProviderFactory = {
  create: createProviderConfig,
  createGemini: createGeminiProvider,
  createOpenAI: createOpenAIProvider,
  createClaude: createClaudeProvider,
  createPool: createProviderPool,
  createPools: createProviderPools,
  createStatus: createProviderStatus,
  Types: ProviderTypes,
  Status: ProviderStatus,
};

export default ProviderFactory;
