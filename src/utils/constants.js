/**
 * 共享常量定义
 * 集中管理各处使用的硬编码值
 */

// 定时健康检查相关常量
export const HEALTH_CHECK = {
    // 最小检查间隔：60秒（60000毫秒）
    MIN_INTERVAL_MS: 60000,
    // 默认检查间隔：10分钟（600000毫秒）
    DEFAULT_INTERVAL_MS: 600000,
    // 最大检查间隔：48小时（172800000毫秒）
    MAX_INTERVAL_MS: 172800000,
    // 最大并发健康检查数量
    MAX_CONCURRENT_CHECKS: 5,
    // 随机抖动时间（毫秒），用于防止时序攻击
    JITTER_MS: 1000,
    // lastCheckTimes Map 的最大条目数，防止内存泄漏
    MAX_LAST_CHECK_ENTRIES: 1000
};

// 密码安全相关常量
export const PASSWORD = {
    // 最小密码长度（最少12位，与现代安全实践一致）
    MIN_LENGTH: 12,
    // PBKDF2迭代次数（OWASP 2023建议 SHA-512 ≥310,000次）
    PBKDF2_ITERATIONS: 310000,
    // PBKDF2密钥长度（字节）
    PBKDF2_KEYLEN: 64,
    // PBKDF2哈希算法
    PBKDF2_DIGEST: 'sha512'
};

// Antigravity thinking 签名相关常量
export const ANTIGRAVITY_THINKING = {
    // 最小 thinking budget
    MIN_BUDGET: 1024,
    // 最大 thinking budget
    MAX_BUDGET: 100000,
    // 思考块签名回退值（用于修复 messages.1.content.0.thinking.signature 报错）
    FALLBACK_SIGNATURE: 'skip_thought_signature_validator_fallback'
};

// 网络相关常量
export const NETWORK = {
    // 最小端口号
    MIN_PORT: 1,
    // 最大端口号
    MAX_PORT: 65535,
    // 默认服务器端口
    DEFAULT_PORT: 3000
};

// 请求重试相关常量
export const RETRY = {
    // 最大重试次数
    MAX_RETRIES: 100
};

// 提供商池管理相关常量
export const PROVIDER_POOL = {
    // 默认最大错误次数（超过后标记为不健康）
    DEFAULT_MAX_ERROR_COUNT: 10,
    // 默认健康检查间隔（10分钟）
    DEFAULT_HEALTH_CHECK_INTERVAL_MS: 600000,
    // 默认保存防抖时间（1秒）
    DEFAULT_SAVE_DEBOUNCE_MS: 1000,
    // 默认刷新缓冲延迟（5秒）
    DEFAULT_REFRESH_BUFFER_DELAY_MS: 5000,
    // 默认全局刷新并发数
    DEFAULT_REFRESH_CONCURRENCY_GLOBAL: 2,
    // 默认每个提供商刷新并发数
    DEFAULT_REFRESH_CONCURRENCY_PER_PROVIDER: 1,
    // 默认预热目标节点数
    DEFAULT_WARMUP_TARGET: 0,
    // 选择操作超时时间（毫秒）
    SELECTION_TIMEOUT_MS: 5000,
    // 新鲜度判断窗口（60秒）
    FRESHNESS_WINDOW_MS: 60000,
    // 错误滑动窗口（5分钟）
    ERROR_WINDOW_MS: 300000,
    // 队列等待超时（5分钟）
    QUEUE_TIMEOUT_MS: 300000,
    // 健康检查超时（15秒）
    HEALTH_CHECK_TIMEOUT_MS: 15000,
    // 刷新冷却时间（30秒，防止重复刷新）
    REFRESH_COOLDOWN_MS: 30000,
    // Webhook 通知超时（5秒）
    WEBHOOK_TIMEOUT_MS: 5000,
    // 评分权重：使用次数（每使用一次增加的权重，约10秒）
    USAGE_SCORE_MULTIPLIER: 10000,
    // 评分权重：活跃请求（每个活跃请求增加的权重，约5秒）
    LOAD_SCORE_MULTIPLIER: 5000,
    // 评分权重：序列号（用于轮询的相对序列号权重）
    SEQUENCE_SCORE_MULTIPLIER: 1000,
    // 评分权重：序列号上限（防止序列号过大影响评分）
    MAX_RELATIVE_SEQUENCE: 100,
    // 新鲜节点基础分偏移（非常大的负数，确保新鲜节点优先被选择）
    FRESH_NODE_BASE_SCORE_OFFSET: -1e14,
    // 默认LRU一天前的节点（毫秒）
    DEFAULT_LRU_FALLBACK_MS: 86400000
};

// OAuth 配置文件路径映射
export const OAUTH_CONFIG_PATH_MAP = {
    'claude-kiro': 'KIRO_OAUTH_CREDS_FILE_PATH',
    'gemini-cli': 'GEMINI_OAUTH_CREDS_FILE_PATH',
    'gemini-antigravity': 'ANTIGRAVITY_OAUTH_CREDS_FILE_PATH',
    'openai-qwen': 'QWEN_OAUTH_CREDS_FILE_PATH',
    'openai-iflow': 'IFLOW_OAUTH_CREDS_FILE_PATH',
    'openai-codex': 'CODEX_OAUTH_CREDS_FILE_PATH',
    'kimi': 'KIMI_OAUTH_CREDS_FILE_PATH'
};
