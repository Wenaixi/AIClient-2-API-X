/**
 * Constants 模块单元测试
 * 测试 src/utils/constants.js 中定义的常量
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// 导入常量模块
let HEALTH_CHECK, PASSWORD, NETWORK, RETRY, ANTIGRAVITY_THINKING, PROVIDER_POOL, OAUTH_CONFIG_PATH_MAP, MODEL_PROTOCOL_PREFIX, MODEL_PROVIDER;

beforeAll(async () => {
  const constantsModule = await import('../../../src/utils/constants.js');
  HEALTH_CHECK = constantsModule.HEALTH_CHECK;
  PASSWORD = constantsModule.PASSWORD;
  NETWORK = constantsModule.NETWORK;
  RETRY = constantsModule.RETRY;
  ANTIGRAVITY_THINKING = constantsModule.ANTIGRAVITY_THINKING;
  PROVIDER_POOL = constantsModule.PROVIDER_POOL;
  OAUTH_CONFIG_PATH_MAP = constantsModule.OAUTH_CONFIG_PATH_MAP;
  MODEL_PROTOCOL_PREFIX = constantsModule.MODEL_PROTOCOL_PREFIX;
  MODEL_PROVIDER = constantsModule.MODEL_PROVIDER;
});

describe('HEALTH_CHECK Constants', () => {
  test('should have correct minimum interval', () => {
    // 最小间隔：60秒
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBe(60000);
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('should have correct default interval', () => {
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBe(600000);
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeGreaterThan(HEALTH_CHECK.MIN_INTERVAL_MS);
  });

  test('should have correct maximum interval', () => {
    // 最大范围支持108小时
    expect(HEALTH_CHECK.MAX_INTERVAL_MS).toBe(388800000);
    expect(HEALTH_CHECK.MAX_INTERVAL_MS).toBeGreaterThan(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });

  test('should have positive interval values', () => {
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeGreaterThan(0);
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeGreaterThan(0);
    expect(HEALTH_CHECK.MAX_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('should have correct interval hierarchy', () => {
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.MAX_INTERVAL_MS);
  });
});

describe('PASSWORD Constants', () => {
  test('should have correct minimum password length', () => {
    expect(PASSWORD.MIN_LENGTH).toBe(12);
    expect(PASSWORD.MIN_LENGTH).toBeGreaterThanOrEqual(8);
  });

  test('should have adequate PBKDF2 iterations', () => {
    // OWASP 2023 建议至少 310,000 次迭代
    expect(PASSWORD.PBKDF2_ITERATIONS).toBe(310000);
    expect(PASSWORD.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310000);
  });

  test('should have correct PBKDF2 key length', () => {
    expect(PASSWORD.PBKDF2_KEYLEN).toBe(64);
    expect(PASSWORD.PBKDF2_KEYLEN).toBeGreaterThan(0);
  });

  test('should use SHA-512 algorithm', () => {
    expect(PASSWORD.PBKDF2_DIGEST).toBe('sha512');
  });

  test('should have all required PBKDF2 parameters', () => {
    expect(PASSWORD).toHaveProperty('PBKDF2_ITERATIONS');
    expect(PASSWORD).toHaveProperty('PBKDF2_KEYLEN');
    expect(PASSWORD).toHaveProperty('PBKDF2_DIGEST');
    expect(PASSWORD).toHaveProperty('MIN_LENGTH');
  });
});

describe('NETWORK Constants', () => {
  test('should have correct minimum port', () => {
    expect(NETWORK.MIN_PORT).toBe(1);
    expect(NETWORK.MIN_PORT).toBeGreaterThan(0);
  });

  test('should have correct maximum port', () => {
    expect(NETWORK.MAX_PORT).toBe(65535);
    expect(NETWORK.MAX_PORT).toBeLessThanOrEqual(65535);
  });

  test('should have valid port range', () => {
    expect(NETWORK.MIN_PORT).toBeLessThan(NETWORK.MAX_PORT);
    expect(NETWORK.MIN_PORT).toBeLessThanOrEqual(1024); // 常用端口起始
  });

  test('should have correct default port', () => {
    expect(NETWORK.DEFAULT_PORT).toBe(3000);
    expect(NETWORK.DEFAULT_PORT).toBeGreaterThanOrEqual(NETWORK.MIN_PORT);
    expect(NETWORK.DEFAULT_PORT).toBeLessThanOrEqual(NETWORK.MAX_PORT);
  });

  test('should have all required network parameters', () => {
    expect(NETWORK).toHaveProperty('MIN_PORT');
    expect(NETWORK).toHaveProperty('MAX_PORT');
    expect(NETWORK).toHaveProperty('DEFAULT_PORT');
  });
});

describe('RETRY Constants', () => {
  test('should have correct maximum retries', () => {
    expect(RETRY.MAX_RETRIES).toBe(100);
    expect(RETRY.MAX_RETRIES).toBeGreaterThan(0);
  });

  test('should have reasonable maximum retries value', () => {
    expect(RETRY.MAX_RETRIES).toBeLessThanOrEqual(100);
    expect(RETRY.MAX_RETRIES).toBeGreaterThanOrEqual(3);
  });
});

describe('Constants Module Integration', () => {
  test('should export all expected constant groups', () => {
    expect(HEALTH_CHECK).toBeDefined();
    expect(PASSWORD).toBeDefined();
    expect(NETWORK).toBeDefined();
    expect(RETRY).toBeDefined();
  });

  test('should have non-null constant values', () => {
    expect(HEALTH_CHECK).not.toBeNull();
    expect(PASSWORD).not.toBeNull();
    expect(NETWORK).not.toBeNull();
    expect(RETRY).not.toBeNull();
  });

  test('should export all constant groups with expected properties', () => {
    // Verify HEALTH_CHECK properties
    expect(HEALTH_CHECK).toHaveProperty('MIN_INTERVAL_MS');
    expect(HEALTH_CHECK).toHaveProperty('DEFAULT_INTERVAL_MS');
    expect(HEALTH_CHECK).toHaveProperty('MAX_INTERVAL_MS');

    // Verify PASSWORD properties
    expect(PASSWORD).toHaveProperty('MIN_LENGTH');
    expect(PASSWORD).toHaveProperty('PBKDF2_ITERATIONS');
    expect(PASSWORD).toHaveProperty('PBKDF2_KEYLEN');
    expect(PASSWORD).toHaveProperty('PBKDF2_DIGEST');

    // Verify NETWORK properties
    expect(NETWORK).toHaveProperty('MIN_PORT');
    expect(NETWORK).toHaveProperty('MAX_PORT');
    expect(NETWORK).toHaveProperty('DEFAULT_PORT');

    // Verify RETRY properties
    expect(RETRY).toHaveProperty('MAX_RETRIES');
  });

  test('should have valid constant value types', () => {
    // All interval values should be numbers
    expect(typeof HEALTH_CHECK.MIN_INTERVAL_MS).toBe('number');
    expect(typeof HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBe('number');
    expect(typeof HEALTH_CHECK.MAX_INTERVAL_MS).toBe('number');

    // All password params should be numbers except DIGEST
    expect(typeof PASSWORD.MIN_LENGTH).toBe('number');
    expect(typeof PASSWORD.PBKDF2_ITERATIONS).toBe('number');
    expect(typeof PASSWORD.PBKDF2_KEYLEN).toBe('number');
    expect(typeof PASSWORD.PBKDF2_DIGEST).toBe('string');

    // All network values should be numbers
    expect(typeof NETWORK.MIN_PORT).toBe('number');
    expect(typeof NETWORK.MAX_PORT).toBe('number');
    expect(typeof NETWORK.DEFAULT_PORT).toBe('number');

    // RETRY should be number
    expect(typeof RETRY.MAX_RETRIES).toBe('number');
  });
});

describe('Constants Security Considerations', () => {
  test('PBKDF2 should use OWASP recommended iterations', () => {
    // OWASP 2023 建议 SHA-512 至少 310,000 次迭代
    expect(PASSWORD.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310000);
  });

  test('PBKDF2 should use strong digest algorithm', () => {
    // SHA-512 是推荐的算法
    expect(['sha512', 'sha3-512']).toContain(PASSWORD.PBKDF2_DIGEST);
  });

  test('password minimum length should meet security standards', () => {
    // 现代安全标准要求至少 12 个字符
    expect(PASSWORD.MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

describe('ANTIGRAVITY_THINKING Constants', () => {
  test('should have correct MIN_BUDGET', () => {
    expect(ANTIGRAVITY_THINKING.MIN_BUDGET).toBe(1024);
    expect(ANTIGRAVITY_THINKING.MIN_BUDGET).toBeGreaterThan(0);
  });

  test('should have correct MAX_BUDGET', () => {
    expect(ANTIGRAVITY_THINKING.MAX_BUDGET).toBe(100000);
    expect(ANTIGRAVITY_THINKING.MAX_BUDGET).toBeGreaterThan(ANTIGRAVITY_THINKING.MIN_BUDGET);
  });

  test('should have FALLBACK_SIGNATURE', () => {
    expect(ANTIGRAVITY_THINKING.FALLBACK_SIGNATURE).toBe('skip_thought_signature_validator_fallback');
    expect(typeof ANTIGRAVITY_THINKING.FALLBACK_SIGNATURE).toBe('string');
  });
});

describe('PROVIDER_POOL Constants', () => {
  test('should have correct DEFAULT_MAX_ERROR_COUNT', () => {
    expect(PROVIDER_POOL.DEFAULT_MAX_ERROR_COUNT).toBe(3);
    expect(PROVIDER_POOL.DEFAULT_MAX_ERROR_COUNT).toBeGreaterThan(0);
  });

  test('should have correct health check intervals', () => {
    expect(PROVIDER_POOL.DEFAULT_HEALTH_CHECK_INTERVAL_MS).toBe(600000);
    expect(PROVIDER_POOL.HEALTH_CHECK_TIMEOUT_MS).toBe(15000);
  });

  test('should have correct debounce and buffer delays', () => {
    expect(PROVIDER_POOL.DEFAULT_SAVE_DEBOUNCE_MS).toBe(1000);
    expect(PROVIDER_POOL.DEFAULT_REFRESH_BUFFER_DELAY_MS).toBe(5000);
  });

  test('should have correct concurrency settings', () => {
    expect(PROVIDER_POOL.DEFAULT_REFRESH_CONCURRENCY_GLOBAL).toBe(2);
    expect(PROVIDER_POOL.DEFAULT_REFRESH_CONCURRENCY_PER_PROVIDER).toBe(1);
    expect(PROVIDER_POOL.DEFAULT_REFRESH_CONCURRENCY_PER_PROVIDER).toBeLessThanOrEqual(PROVIDER_POOL.DEFAULT_REFRESH_CONCURRENCY_GLOBAL);
  });

  test('should have correct timeout settings', () => {
    expect(PROVIDER_POOL.SELECTION_TIMEOUT_MS).toBe(5000);
    expect(PROVIDER_POOL.FRESHNESS_WINDOW_MS).toBe(60000);
    expect(PROVIDER_POOL.ERROR_WINDOW_MS).toBe(300000);
    expect(PROVIDER_POOL.QUEUE_TIMEOUT_MS).toBe(300000);
    expect(PROVIDER_POOL.REFRESH_COOLDOWN_MS).toBe(30000);
    expect(PROVIDER_POOL.WEBHOOK_TIMEOUT_MS).toBe(5000);
  });

  test('should have correct score multipliers', () => {
    expect(PROVIDER_POOL.USAGE_SCORE_MULTIPLIER).toBe(10000);
    expect(PROVIDER_POOL.LOAD_SCORE_MULTIPLIER).toBe(5000);
    expect(PROVIDER_POOL.SEQUENCE_SCORE_MULTIPLIER).toBe(1000);
    expect(PROVIDER_POOL.MAX_RELATIVE_SEQUENCE).toBe(100);
  });

  test('should have correct fresh node base score offset', () => {
    expect(PROVIDER_POOL.FRESH_NODE_BASE_SCORE_OFFSET).toBe(-1e14);
  });

  test('should have correct LRU fallback', () => {
    expect(PROVIDER_POOL.DEFAULT_LRU_FALLBACK_MS).toBe(86400000);
  });
});

describe('OAUTH_CONFIG_PATH_MAP Constants', () => {
  test('should have all required OAuth provider mappings', () => {
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('claude-kiro');
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('gemini-cli');
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('gemini-antigravity');
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('openai-qwen');
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('openai-codex');
    expect(OAUTH_CONFIG_PATH_MAP).toHaveProperty('kimi-oauth');
  });

  test('should have valid file path environment variable names', () => {
    expect(OAUTH_CONFIG_PATH_MAP['claude-kiro']).toBe('KIRO_OAUTH_CREDS_FILE_PATH');
    expect(OAUTH_CONFIG_PATH_MAP['gemini-cli']).toBe('GEMINI_OAUTH_CREDS_FILE_PATH');
    expect(OAUTH_CONFIG_PATH_MAP['gemini-antigravity']).toBe('ANTIGRAVITY_OAUTH_CREDS_FILE_PATH');
    expect(OAUTH_CONFIG_PATH_MAP['openai-qwen']).toBe('QWEN_OAUTH_CREDS_FILE_PATH');
    expect(OAUTH_CONFIG_PATH_MAP['openai-codex']).toBe('CODEX_OAUTH_CREDS_FILE_PATH');
    expect(OAUTH_CONFIG_PATH_MAP['kimi-oauth']).toBe('KIMI_OAUTH_CREDS_FILE_PATH');
  });
});

describe('MODEL_PROTOCOL_PREFIX Constants', () => {
  test('should have all required protocol prefixes', () => {
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('GEMINI');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('OPENAI');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('OPENAI_RESPONSES');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('CLAUDE');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('CODEX');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('FORWARD');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('GROK');
    expect(MODEL_PROTOCOL_PREFIX).toHaveProperty('KIMI');
  });

  test('should have correct string values', () => {
    expect(MODEL_PROTOCOL_PREFIX.GEMINI).toBe('gemini');
    expect(MODEL_PROTOCOL_PREFIX.OPENAI).toBe('openai');
    expect(MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES).toBe('openaiResponses');
    expect(MODEL_PROTOCOL_PREFIX.CLAUDE).toBe('claude');
    expect(MODEL_PROTOCOL_PREFIX.CODEX).toBe('codex');
    expect(MODEL_PROTOCOL_PREFIX.FORWARD).toBe('forward');
    expect(MODEL_PROTOCOL_PREFIX.GROK).toBe('grok');
    expect(MODEL_PROTOCOL_PREFIX.KIMI).toBe('kimi');
  });
});

describe('MODEL_PROVIDER Constants', () => {
  test('should have all required provider identifiers', () => {
    expect(MODEL_PROVIDER).toHaveProperty('GEMINI_CLI');
    expect(MODEL_PROVIDER).toHaveProperty('ANTIGRAVITY');
    expect(MODEL_PROVIDER).toHaveProperty('OPENAI_CUSTOM');
    expect(MODEL_PROVIDER).toHaveProperty('OPENAI_CUSTOM_RESPONSES');
    expect(MODEL_PROVIDER).toHaveProperty('CLAUDE_CUSTOM');
    expect(MODEL_PROVIDER).toHaveProperty('KIRO_API');
    expect(MODEL_PROVIDER).toHaveProperty('QWEN_API');
    expect(MODEL_PROVIDER).toHaveProperty('CODEX_API');
    expect(MODEL_PROVIDER).toHaveProperty('FORWARD_API');
    expect(MODEL_PROVIDER).toHaveProperty('GROK_CUSTOM');
    expect(MODEL_PROVIDER).toHaveProperty('KIMI_API');
    expect(MODEL_PROVIDER).toHaveProperty('AUTO');
  });

  test('should have correct string values', () => {
    expect(MODEL_PROVIDER.GEMINI_CLI).toBe('gemini-cli-oauth');
    expect(MODEL_PROVIDER.ANTIGRAVITY).toBe('gemini-antigravity');
    expect(MODEL_PROVIDER.OPENAI_CUSTOM).toBe('openai-custom');
    expect(MODEL_PROVIDER.OPENAI_CUSTOM_RESPONSES).toBe('openaiResponses-custom');
    expect(MODEL_PROVIDER.CLAUDE_CUSTOM).toBe('claude-custom');
    expect(MODEL_PROVIDER.KIRO_API).toBe('claude-kiro-oauth');
    expect(MODEL_PROVIDER.QWEN_API).toBe('openai-qwen-oauth');
    expect(MODEL_PROVIDER.CODEX_API).toBe('openai-codex-oauth');
    expect(MODEL_PROVIDER.FORWARD_API).toBe('forward-api');
    expect(MODEL_PROVIDER.GROK_CUSTOM).toBe('grok-custom');
    expect(MODEL_PROVIDER.KIMI_API).toBe('kimi-oauth');
    expect(MODEL_PROVIDER.AUTO).toBe('auto');
  });
});

describe('HEALTH_CHECK Extended Constants', () => {
  test('should have MAX_CONCURRENT_CHECKS', () => {
    expect(HEALTH_CHECK.MAX_CONCURRENT_CHECKS).toBe(5);
    expect(HEALTH_CHECK.MAX_CONCURRENT_CHECKS).toBeGreaterThan(0);
  });

  test('should have JITTER_MS', () => {
    expect(HEALTH_CHECK.JITTER_MS).toBe(1000);
    expect(HEALTH_CHECK.JITTER_MS).toBeGreaterThan(0);
  });

  test('should have MAX_LAST_CHECK_ENTRIES', () => {
    expect(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES).toBe(1000);
    expect(HEALTH_CHECK.MAX_LAST_CHECK_ENTRIES).toBeGreaterThan(0);
  });
});
