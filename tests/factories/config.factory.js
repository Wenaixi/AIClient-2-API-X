/**
 * 配置测试数据工厂
 * 生成各种测试用的配置数据
 */

/**
 * 创建默认测试配置
 * @param {object} overrides - 覆盖属性
 * @returns {object}
 */
export function createTestConfig(overrides = {}) {
  return {
    // 服务器配置
    HOST: '0.0.0.0',
    SERVER_PORT: 3000,
    REQUIRED_API_KEY: 'test-api-key',
    LOGIN_EXPIRY: 3600,

    // 提供商配置
    MODEL_PROVIDER: 'gemini',
    DEFAULT_MODEL_PROVIDERS: ['gemini', 'openai'],
    providerFallbackChain: ['gemini', 'openai', 'claude'],
    modelFallbackMapping: {},
    PROVIDER_POOLS_FILE_PATH: 'configs/provider_pools.json',

    // 代理配置
    PROXY_URL: '',
    PROXY_ENABLED_PROVIDERS: [],
    TLS_SIDECAR_ENABLED: false,
    TLS_SIDECAR_ENABLED_PROVIDERS: [],
    TLS_SIDECAR_PORT: 1455,
    TLS_SIDECAR_PROXY_URL: '',

    // 系统提示配置
    SYSTEM_PROMPT_FILE_PATH: 'configs/input_system_prompt.txt',
    SYSTEM_PROMPT_MODE: 'overwrite',

    // 日志配置
    LOG_ENABLED: true,
    LOG_OUTPUT_MODE: 'console',
    LOG_LEVEL: 'error',
    LOG_DIR: 'logs',
    LOG_INCLUDE_REQUEST_ID: true,
    LOG_INCLUDE_TIMESTAMP: true,
    LOG_MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    LOG_MAX_FILES: 5,
    PROMPT_LOG_BASE_NAME: 'prompt_log',
    PROMPT_LOG_MODE: 'none',

    // 重试配置
    REQUEST_MAX_RETRIES: 3,
    REQUEST_BASE_DELAY: 1000,
    CREDENTIAL_SWITCH_MAX_RETRIES: 2,

    // 令牌刷新配置
    CRON_NEAR_MINUTES: 15,
    CRON_REFRESH_TOKEN: true,

    // 健康检查配置
    MAX_ERROR_COUNT: 10,
    WARMUP_TARGET: 0,
    REFRESH_CONCURRENCY_PER_PROVIDER: 1,

    // 定时健康检查配置
    SCHEDULED_HEALTH_CHECK: {
      enabled: false,
      startupRun: true,
      interval: 600000,
      providerTypes: [],
    },

    // ... 覆盖属性
    ...overrides,
  };
}

/**
 * 创建健康检查配置
 * @param {object} overrides
 * @returns {object}
 */
export function createHealthCheckConfig(overrides = {}) {
  return {
    enabled: true,
    startupRun: true,
    interval: 600000,
    providerTypes: ['gemini', 'openai'],
    ...overrides,
  };
}

/**
 * 创建代理配置
 * @param {object} overrides
 * @returns {object}
 */
export function createProxyConfig(overrides = {}) {
  return {
    PROXY_URL: 'http://proxy.example.com:8080',
    PROXY_ENABLED_PROVIDERS: ['gemini', 'openai'],
    ...overrides,
  };
}

/**
 * 创建 TLS Sidecar 配置
 * @param {object} overrides
 * @returns {object}
 */
export function createTLSSidecarConfig(overrides = {}) {
  return {
    TLS_SIDECAR_ENABLED: true,
    TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini'],
    TLS_SIDECAR_PORT: 1455,
    TLS_SIDECAR_PROXY_URL: '',
    TLS_SIDECAR_BINARY_PATH: './tls-sidecar',
    ...overrides,
  };
}

/**
 * 创建日志配置
 * @param {object} overrides
 * @returns {object}
 */
export function createLogConfig(overrides = {}) {
  return {
    LOG_ENABLED: true,
    LOG_OUTPUT_MODE: 'file',
    LOG_LEVEL: 'info',
    LOG_DIR: 'logs',
    LOG_INCLUDE_REQUEST_ID: true,
    LOG_INCLUDE_TIMESTAMP: true,
    LOG_MAX_FILE_SIZE: 10 * 1024 * 1024,
    LOG_MAX_FILES: 5,
    ...overrides,
  };
}

/**
 * Config Factory
 */
export const ConfigFactory = {
  create: createTestConfig,
  createHealthCheck: createHealthCheckConfig,
  createProxy: createProxyConfig,
  createTLSSidecar: createTLSSidecarConfig,
  createLog: createLogConfig,
};

export default ConfigFactory;
