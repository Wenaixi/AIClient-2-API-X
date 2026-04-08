import * as fs from 'fs';
import { promises as pfs } from 'fs';
import crypto from 'crypto';
import { INPUT_SYSTEM_PROMPT_FILE } from '../utils/common.js';
import { MODEL_PROVIDER } from '../utils/constants.js';
import logger from '../utils/logger.js';
import { HEALTH_CHECK } from '../utils/constants.js';

export let CONFIG = {}; // Make CONFIG exportable
export let PROMPT_LOG_FILENAME = ''; // Make PROMPT_LOG_FILENAME exportable

const ALL_MODEL_PROVIDERS = Object.values(MODEL_PROVIDER);

function normalizeConfiguredProviders(config) {
    const fallbackProvider = MODEL_PROVIDER.GEMINI_CLI;
    const dedupedProviders = [];

    const addProvider = (value) => {
        if (typeof value !== 'string') {
            return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }
        const matched = ALL_MODEL_PROVIDERS.find((provider) => provider.toLowerCase() === trimmed.toLowerCase());
        if (!matched) {
            logger.warn(`[Config Warning] Unknown model provider '${trimmed}'. This entry will be ignored.`);
            return;
        }
        if (!dedupedProviders.includes(matched)) {
            dedupedProviders.push(matched);
        }
    };

    const rawValue = config.MODEL_PROVIDER;
    if (Array.isArray(rawValue)) {
        rawValue.forEach((entry) => addProvider(typeof entry === 'string' ? entry : String(entry)));
    } else if (typeof rawValue === 'string') {
        rawValue.split(',').forEach(addProvider);
    } else if (rawValue != null) {
        addProvider(String(rawValue));
    }

    if (dedupedProviders.length === 0) {
        dedupedProviders.push(fallbackProvider);
    }

    config.DEFAULT_MODEL_PROVIDERS = dedupedProviders;
    config.MODEL_PROVIDER = dedupedProviders[0];
}

/**
 * Initializes the server configuration from config.json and command-line arguments.
 * @param {string[]} args - Command-line arguments.
 * @param {string} [configFilePath='configs/config.json'] - Path to the configuration file.
 * @returns {Object} The initialized configuration object.
 */
export async function initializeConfig(args = process.argv.slice(2), configFilePath = 'configs/config.json') {
    const defaultConfig = {
        REQUIRED_API_KEY: null, // Will be generated securely on first startup if not configured
        SERVER_PORT: 3000,
        HOST: '0.0.0.0',
        MODEL_PROVIDER: MODEL_PROVIDER.GEMINI_CLI,
        SYSTEM_PROMPT_FILE_PATH: INPUT_SYSTEM_PROMPT_FILE, // Default value
        SYSTEM_PROMPT_MODE: 'append',
        PROXY_URL: null, // HTTP/HTTPS/SOCKS5 代理地址，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080
        PROXY_ENABLED_PROVIDERS: [], // 启用代理的提供商列表，如 ['gemini-cli-oauth', 'claude-kiro-oauth']
        PROMPT_LOG_BASE_NAME: "prompt_log",
        PROMPT_LOG_MODE: "none",
        REQUEST_MAX_RETRIES: 3,
        REQUEST_BASE_DELAY: 1000,
        CREDENTIAL_SWITCH_MAX_RETRIES: 5, // 坏凭证切换最大重试次数（用于认证错误后切换凭证）
        CRON_NEAR_MINUTES: 15,
        CRON_REFRESH_TOKEN: false,
        LOGIN_EXPIRY: 3600, // 登录过期时间（秒），默认1小时
        LOGIN_MAX_ATTEMPTS: 5, // 最大失败重试次数
        LOGIN_LOCKOUT_DURATION: 1800, // 锁定持续时间（秒），默认30分钟
        LOGIN_MIN_INTERVAL: 5000, // 两次尝试之间的最小间隔（毫秒），默认5秒
        PROVIDER_POOLS_FILE_PATH: null, // 新增号池配置文件路径
        MAX_ERROR_COUNT: 5, // 提供商最大错误次数
        SYSTEM_PROMPT_REPLACEMENTS: [], // 系统提示词内容替换规则，例如: [{"old": "AI", "new": "Bot"}, {"old": "OpenAI", "new": "Gemini"}]
        SCHEDULED_HEALTH_CHECK: {
            enabled: false,
            interval: 600000,
            startupRun: false
        },
        providerFallbackChain: {}, // 跨类型 Fallback 链配置
        LOG_ENABLED: true,
        LOG_OUTPUT_MODE: "all",
        LOG_LEVEL: "info",
        LOG_DIR: "logs",
        LOG_INCLUDE_REQUEST_ID: true,
        LOG_INCLUDE_TIMESTAMP: true,
        LOG_MAX_FILE_SIZE: 10485760,
        LOG_MAX_FILES: 10,
        TLS_SIDECAR_ENABLED: false, // 启用 Go uTLS sidecar（需要编译 tls-sidecar 二进制）
        TLS_SIDECAR_ENABLED_PROVIDERS: [], // 启用 TLS Sidecar 的提供商列表
        TLS_SIDECAR_PORT: 9090,     // sidecar 监听端口
        TLS_SIDECAR_BINARY_PATH: null, // 自定义二进制路径（默认自动搜索）
        TLS_SIDECAR_PROXY_URL: null    // TLS Sidecar 专用的上游代理地址
    };

    let currentConfig = { ...defaultConfig };

    try {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        Object.assign(currentConfig, loadedConfig);
        logger.info('[Config] Loaded configuration from configs/config.json');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            logger.error('[Config Error] Failed to load configs/config.json:', error.message);
        } else {
            logger.info('[Config] configs/config.json not found, using default configuration.');
        }
    }


    // CLI argument definitions: { flag, configKey, type, validValues? }
    // type: 'string' | 'int' | 'bool' | 'enum'
    const cliArgDefs = [
        { flag: '--api-key',              configKey: 'REQUIRED_API_KEY',       type: 'string' },
        { flag: '--log-prompts',          configKey: 'PROMPT_LOG_MODE',        type: 'enum', validValues: ['console', 'file'] },
        { flag: '--port',                 configKey: 'SERVER_PORT',            type: 'int' },
        { flag: '--model-provider',       configKey: 'MODEL_PROVIDER',         type: 'string' },
        { flag: '--system-prompt-file',   configKey: 'SYSTEM_PROMPT_FILE_PATH', type: 'string' },
        { flag: '--system-prompt-mode',   configKey: 'SYSTEM_PROMPT_MODE',     type: 'enum', validValues: ['overwrite', 'append'] },
        { flag: '--host',                 configKey: 'HOST',                   type: 'string' },
        { flag: '--prompt-log-base-name', configKey: 'PROMPT_LOG_BASE_NAME',   type: 'string' },
        { flag: '--cron-near-minutes',    configKey: 'CRON_NEAR_MINUTES',      type: 'int' },
        { flag: '--cron-refresh-token',   configKey: 'CRON_REFRESH_TOKEN',     type: 'bool' },
        { flag: '--provider-pools-file',  configKey: 'PROVIDER_POOLS_FILE_PATH', type: 'string' },
        { flag: '--max-error-count',      configKey: 'MAX_ERROR_COUNT',        type: 'int' },
        { flag: '--login-max-attempts',   configKey: 'LOGIN_MAX_ATTEMPTS',     type: 'int' },
        { flag: '--login-lockout-duration', configKey: 'LOGIN_LOCKOUT_DURATION', type: 'int' },
        { flag: '--login-min-interval',   configKey: 'LOGIN_MIN_INTERVAL',     type: 'int' },
        { flag: '--scheduled-health-check-enabled', configKey: 'SCHEDULED_HEALTH_CHECK_ENABLED', type: 'bool' },
        { flag: '--scheduled-health-check-interval', configKey: 'SCHEDULED_HEALTH_CHECK_INTERVAL', type: 'int' },
    ];

    // Parse command-line arguments using definitions
    const flagMap = new Map(cliArgDefs.map(def => [def.flag, def]));
    for (let i = 0; i < args.length; i++) {
        const def = flagMap.get(args[i]);
        if (!def) continue;

        if (i + 1 >= args.length) {
            logger.warn(`[Config Warning] ${def.flag} flag requires a value.`);
            continue;
        }

        const rawValue = args[++i];
        switch (def.type) {
            case 'string':
                currentConfig[def.configKey] = rawValue;
                break;
            case 'int':
                currentConfig[def.configKey] = parseInt(rawValue, 10);
                break;
            case 'bool':
                currentConfig[def.configKey] = rawValue.toLowerCase() === 'true';
                break;
            case 'enum':
                if (def.validValues.includes(rawValue)) {
                    currentConfig[def.configKey] = rawValue;
                } else {
                    logger.warn(`[Config Warning] Invalid value for ${def.flag}. Expected one of: ${def.validValues.join(', ')}.`);
                }
                break;
        }
    }

    // 合并定时健康检查的 CLI 配置
    if (currentConfig.SCHEDULE_HEALTH_CHECK_ENABLED !== undefined) {
        currentConfig.SCHEDULED_HEALTH_CHECK.enabled = currentConfig.SCHEDULE_HEALTH_CHECK_ENABLED;
    }
    if (currentConfig.SCHEDULE_HEALTH_CHECK_INTERVAL !== undefined) {
        currentConfig.SCHEDULED_HEALTH_CHECK.interval = currentConfig.SCHEDULE_HEALTH_CHECK_INTERVAL;
    }

    // Generate a secure random API key if none is configured
    if (!currentConfig.REQUIRED_API_KEY) {
        currentConfig.REQUIRED_API_KEY = crypto.randomBytes(32).toString('hex');
        logger.info('[Config] Generated secure random API key on first startup');
    }

    normalizeConfiguredProviders(currentConfig);

    // 验证健康检查配置
    validateHealthCheckConfig(currentConfig);

    if (!currentConfig.SYSTEM_PROMPT_FILE_PATH) {
        currentConfig.SYSTEM_PROMPT_FILE_PATH = INPUT_SYSTEM_PROMPT_FILE;
    }
    currentConfig.SYSTEM_PROMPT_CONTENT = await getSystemPromptFileContent(currentConfig.SYSTEM_PROMPT_FILE_PATH);

    // 加载号池配置
    if (!currentConfig.PROVIDER_POOLS_FILE_PATH) {
        currentConfig.PROVIDER_POOLS_FILE_PATH = 'configs/provider_pools.json';
    }
    if (currentConfig.PROVIDER_POOLS_FILE_PATH) {
        try {
            const poolsData = await pfs.readFile(currentConfig.PROVIDER_POOLS_FILE_PATH, 'utf8');
            currentConfig.providerPools = JSON.parse(poolsData);
            logger.info(`[Config] Loaded provider pools from ${currentConfig.PROVIDER_POOLS_FILE_PATH}`);
        } catch (error) {
            logger.error(`[Config Error] Failed to load provider pools from ${currentConfig.PROVIDER_POOLS_FILE_PATH}: ${error.message}`);
            currentConfig.providerPools = {};
        }
    } else {
        currentConfig.providerPools = {};
    }

    // Set PROMPT_LOG_FILENAME based on the determined config
    if (currentConfig.PROMPT_LOG_MODE === 'file') {
        const now = new Date();
        const pad = (num) => String(num).padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        PROMPT_LOG_FILENAME = `${currentConfig.PROMPT_LOG_BASE_NAME}-${timestamp}.log`;
    } else {
        PROMPT_LOG_FILENAME = ''; // Clear if not logging to file
    }

    // Assign to the exported CONFIG
    Object.assign(CONFIG, currentConfig);

    // Initialize logger
    logger.initialize({
        enabled: CONFIG.LOG_ENABLED ?? true,
        outputMode: CONFIG.LOG_OUTPUT_MODE || "all",
        logLevel: CONFIG.LOG_LEVEL || "info",
        logDir: CONFIG.LOG_DIR || "logs",
        includeRequestId: CONFIG.LOG_INCLUDE_REQUEST_ID ?? true,
        includeTimestamp: CONFIG.LOG_INCLUDE_TIMESTAMP ?? true,
        maxFileSize: CONFIG.LOG_MAX_FILE_SIZE || 10485760,
        maxFiles: CONFIG.LOG_MAX_FILES || 10
    });

    // Cleanup old logs periodically
    logger.cleanupOldLogs();

    return CONFIG;
}

/**
 * Gets system prompt content from the specified file path.
 * @param {string} filePath - Path to the system prompt file.
 * @returns {Promise<string|null>} File content, or null if the file does not exist, is empty, or an error occurs.
 */
export async function getSystemPromptFileContent(filePath) {
    try {
        await pfs.access(filePath, pfs.constants.F_OK);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn(`[System Prompt] Specified system prompt file not found: ${filePath}`);
        } else {
            logger.error(`[System Prompt] Error accessing system prompt file ${filePath}: ${error.message}`);
        }
        return null;
    }

    try {
        const content = await pfs.readFile(filePath, 'utf8');
        if (!content.trim()) {
            return null;
        }
        logger.info(`[System Prompt] Loaded system prompt from ${filePath}`);
        return content;
    } catch (error) {
        logger.error(`[System Prompt] Error reading system prompt file ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * 验证健康检查配置的 customIntervals
 * @param {Object} customIntervals - 自定义间隔配置对象
 * @returns {Object} 验证后的配置对象
 */
function validateCustomIntervals(customIntervals) {
    if (!customIntervals || typeof customIntervals !== 'object') {
        return {};
    }

    const validated = {};
    for (const [providerType, interval] of Object.entries(customIntervals)) {
        // 验证 providerType 是否为有效字符串
        if (typeof providerType !== 'string' || !providerType.trim()) {
            logger.warn(`[Config Warning] Invalid providerType in customIntervals: ${providerType}`);
            continue;
        }

        // 验证 interval 是否为有效数字且在合理范围内
        const numInterval = Number(interval);
        if (!Number.isFinite(numInterval) || numInterval < HEALTH_CHECK.MIN_INTERVAL_MS) {
            logger.warn(`[Config Warning] Invalid interval for ${providerType}: ${interval}. Must be >= ${HEALTH_CHECK.MIN_INTERVAL_MS}ms`);
            continue;
        }

        // 限制最大间隔
        validated[providerType] = Math.min(numInterval, HEALTH_CHECK.MAX_INTERVAL_MS);
        if (numInterval > HEALTH_CHECK.MAX_INTERVAL_MS) {
            logger.warn(`[Config Warning] Interval for ${providerType} exceeds maximum, capped at ${HEALTH_CHECK.MAX_INTERVAL_MS}ms`);
        }
    }

    return validated;
}

/**
 * 验证并规范化健康检查配置
 * @param {Object} config - 配置对象
 */
function validateHealthCheckConfig(config) {
    if (!config.SCHEDULED_HEALTH_CHECK || typeof config.SCHEDULED_HEALTH_CHECK !== 'object') {
        return;
    }

    const hcConfig = config.SCHEDULED_HEALTH_CHECK;

    // 验证并规范化 customIntervals
    if (hcConfig.customIntervals) {
        hcConfig.customIntervals = validateCustomIntervals(hcConfig.customIntervals);
    }

    // 验证 providerTypes 数组
    if (hcConfig.providerTypes && !Array.isArray(hcConfig.providerTypes)) {
        logger.warn('[Config Warning] SCHEDULED_HEALTH_CHECK.providerTypes must be an array, resetting to empty array');
        hcConfig.providerTypes = [];
    }

    // enabled 为 true 但 providerTypes 为空时给出明确警告
    if (hcConfig.enabled && (!hcConfig.providerTypes || hcConfig.providerTypes.length === 0)) {
        logger.warn('[Config Warning] SCHEDULED_HEALTH_CHECK is enabled but has no providerTypes configured — health check will not run');
    }

    // 验证 interval
    if (typeof hcConfig.interval === 'number') {
        if (hcConfig.interval < HEALTH_CHECK.MIN_INTERVAL_MS) {
            logger.warn(`[Config Warning] Health check interval too small, using minimum: ${HEALTH_CHECK.MIN_INTERVAL_MS}ms`);
            hcConfig.interval = HEALTH_CHECK.MIN_INTERVAL_MS;
        } else if (hcConfig.interval > HEALTH_CHECK.MAX_INTERVAL_MS) {
            logger.warn(`[Config Warning] Health check interval too large, using maximum: ${HEALTH_CHECK.MAX_INTERVAL_MS}ms`);
            hcConfig.interval = HEALTH_CHECK.MAX_INTERVAL_MS;
        }
    }
}

export { ALL_MODEL_PROVIDERS };

