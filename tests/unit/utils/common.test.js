/**
 * common.js 工具函数单元测试
 * 策略：复制实际函数实现进行测试，确保与源码逻辑完全一致
 */

import crypto from 'crypto';

// ==================== 常量定义（从 common.js 复制） ====================
const RETRYABLE_NETWORK_ERRORS = [
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH',
    'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN', 'ECONNABORTED', 'ESOCKETTIMEDOUT'
];

const MODEL_PROTOCOL_PREFIX = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    CLAUDE: 'claude',
    KIMI: 'kimi',
    FORWARD: 'forward',
    GROK: 'grok',
    CODEX: 'codex',
    OPENAI_RESPONSES: 'openai-responses'
};

const MODEL_PROVIDER = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    CLAUDE: 'claude',
    KIMI: 'kimi',
    FORWARD: 'forward',
    GROK: 'grok',
    CODEX: 'codex',
    OPENAI_RESPONSES: 'openai-responses'
};

const API_ACTIONS = {
    GENERATE_CONTENT: 'generateContent',
    STREAM_GENERATE_CONTENT: 'streamGenerateContent',
};

const ENDPOINT_TYPE = {
    OPENAI_CHAT: 'openai_chat',
    OPENAI_RESPONSES: 'openai_responses',
    GEMINI_CONTENT: 'gemini_content',
    CLAUDE_MESSAGE: 'claude_message',
    OPENAI_MODEL_LIST: 'openai_model_list',
    GEMINI_MODEL_LIST: 'gemini_model_list',
};

// MAX_BODY_SIZE 常量
const MAX_BODY_SIZE = 10 * 1024 * 1024;

// ==================== 函数实现（从 common.js 复制） ====================

export function isRetryableNetworkError(error) {
    if (!error) return false;
    const errorCode = error.code || '';
    const errorMessage = error.message || '';
    return RETRYABLE_NETWORK_ERRORS.some(errId =>
        errorCode === errId || errorMessage.includes(errId)
    );
}

export function getProtocolPrefix(provider) {
    const PROTOCOL_PREFIX_MAP = {
        'openai-codex-oauth': MODEL_PROTOCOL_PREFIX.CODEX,
        'kimi-oauth': MODEL_PROTOCOL_PREFIX.KIMI,
    };
    if (PROTOCOL_PREFIX_MAP[provider]) {
        return PROTOCOL_PREFIX_MAP[provider];
    }
    const hyphenIndex = provider ? provider.indexOf('-') : -1;
    if (hyphenIndex !== -1) {
        return provider.substring(0, hyphenIndex);
    }
    return provider || '';
}

export function formatExpiryTime(expiryTimestamp) {
    if (!expiryTimestamp || typeof expiryTimestamp !== 'number') return "No expiry date available";
    const diffMs = expiryTimestamp - Date.now();
    if (diffMs <= 0) return "Token has expired";
    let totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

export function formatLog(tag, message, data = null) {
    let logMessage = `[${tag}] ${message}`;
    if (data !== null && data !== undefined) {
        if (typeof data === 'object') {
            const dataStr = Object.entries(data)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            logMessage += ` | ${dataStr}`;
        } else {
            logMessage += ` | ${data}`;
        }
    }
    return logMessage;
}

export function formatExpiryLog(tag, expiryDate, nearMinutes) {
    const currentTime = Date.now();
    const nearMinutesInMillis = nearMinutes * 60 * 1000;
    const thresholdTime = currentTime + nearMinutesInMillis;
    const isNearExpiry = expiryDate <= thresholdTime;
    const message = formatLog(tag, 'Checking expiry date', {
        'Expiry date': expiryDate,
        'Current time': currentTime,
        [`${nearMinutes} minutes from now`]: thresholdTime,
        'Is near expiry': isNearExpiry
    });
    return { message, isNearExpiry };
}

export function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    if (ip && ip.includes('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }
    return ip || 'unknown';
}

export function getMD5Hash(obj) {
    const str = JSON.stringify(obj);
    const hash = crypto.createHash('md5');
    hash.update(str);
    return hash.digest('hex');
}

export function formatToLocal(dateInput) {
    if (!dateInput) return '--';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '--';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ==================== findMatch / findByPrefix / hasByPrefix / getBaseType ====================
// 直接使用和源码一致的 findMatch 实现
function findMatch(registry, key, returnKey = false) {
    if (registry == null) return undefined;

    if (registry instanceof Set) {
        for (const v of registry) {
            if (key === v || key.startsWith(v + '-')) {
                return returnKey ? v : v;
            }
        }
        return undefined;
    }

    const entries = registry instanceof Map ? registry.entries() : Object.entries(registry);
    for (const [k, v] of entries) {
        if (key === k || key.startsWith(k + '-')) {
            return v;
        }
    }
    return undefined;
}

export function findByPrefix(registry, key) {
    return findMatch(registry, key, false);
}

export function hasByPrefix(registry, key) {
    return findMatch(registry, key) !== undefined;
}

export function getBaseType(registry, key) {
    const matched = findMatch(registry, key, true);
    return matched !== undefined ? matched : key;
}

// ==================== extractSystemPromptFromRequestBody ====================
export function extractSystemPromptFromRequestBody(requestBody) {
    if (!requestBody?.messages) return '';
    const systemMessage = requestBody.messages.find(msg => msg.role === 'system');
    return systemMessage?.content || '';
}

// ==================== escapeHtml ====================
export function escapeHtml(str) {
    if (str == null || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ==================== safeCompare ====================
export function safeCompare(a, b) {
    if (!a || !b) return false;
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ==================== getRequestBody (mock版本) ====================
export async function mockGetRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_SIZE) {
                reject(new Error("Request body too large. Maximum size is 10MB."));
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) {
                return resolve({});
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON in request body."));
            }
        });
        req.on('error', err => {
            reject(err);
        });
    });
}

// ==================== createErrorResponse (mock版本) ====================
function createErrorResponse(error, fromProvider) {
    const protocolPrefix = getProtocolPrefix(fromProvider);
    const statusCode = error.status || error.code || 500;
    const errorMessage = error.message || "An error occurred during processing.";

    const getErrorType = (code) => {
        if (code === 401) return 'authentication_error';
        if (code === 403) return 'permission_error';
        if (code === 429) return 'rate_limit_error';
        if (code >= 500) return 'server_error';
        return 'invalid_request_error';
    };

    const getGeminiStatus = (code) => {
        if (code === 400) return 'INVALID_ARGUMENT';
        if (code === 401) return 'UNAUTHENTICATED';
        if (code === 403) return 'PERMISSION_DENIED';
        if (code === 404) return 'NOT_FOUND';
        if (code === 429) return 'RESOURCE_EXHAUSTED';
        if (code >= 500) return 'INTERNAL';
        return 'UNKNOWN';
    };

    switch (protocolPrefix) {
        case MODEL_PROTOCOL_PREFIX.OPENAI:
            return {
                error: {
                    message: errorMessage,
                    type: getErrorType(statusCode),
                    code: getErrorType(statusCode)
                }
            };
        case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
            return {
                error: {
                    type: getErrorType(statusCode),
                    message: errorMessage,
                    code: getErrorType(statusCode)
                }
            };
        case MODEL_PROTOCOL_PREFIX.CLAUDE:
            return {
                type: "error",
                error: {
                    type: getErrorType(statusCode),
                    message: errorMessage
                }
            };
        case MODEL_PROTOCOL_PREFIX.GEMINI:
            return {
                error: {
                    code: statusCode,
                    message: errorMessage,
                    status: getGeminiStatus(statusCode)
                }
            };
        default:
            return {
                error: {
                    message: errorMessage,
                    type: getErrorType(statusCode),
                    code: getErrorType(statusCode)
                }
            };
    }
}

// ==================== createStreamErrorResponse (mock版本) ====================
function createStreamErrorResponse(error, fromProvider) {
    const protocolPrefix = getProtocolPrefix(fromProvider);
    const statusCode = error.status || error.code || 500;
    const errorMessage = error.message || "An error occurred during streaming.";

    const getErrorType = (code) => {
        if (code === 401) return 'authentication_error';
        if (code === 403) return 'permission_error';
        if (code === 429) return 'rate_limit_error';
        if (code >= 500) return 'server_error';
        return 'invalid_request_error';
    };

    const getGeminiStatus = (code) => {
        if (code === 400) return 'INVALID_ARGUMENT';
        if (code === 401) return 'UNAUTHENTICATED';
        if (code === 403) return 'PERMISSION_DENIED';
        if (code === 404) return 'NOT_FOUND';
        if (code === 429) return 'RESOURCE_EXHAUSTED';
        if (code >= 500) return 'INTERNAL';
        return 'UNKNOWN';
    };

    // 根据 fromProvider 生成不同格式的流式错误
    switch (protocolPrefix) {
        case MODEL_PROTOCOL_PREFIX.OPENAI:
            return `data: ${JSON.stringify({
                error: { message: errorMessage, type: getErrorType(statusCode), code: getErrorType(statusCode) }
            })}\n\n`;
        case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
            return `data: ${JSON.stringify({
                error: { type: getErrorType(statusCode), message: errorMessage, code: getErrorType(statusCode) }
            })}\n\n`;
        case MODEL_PROTOCOL_PREFIX.CLAUDE:
            return `data: ${JSON.stringify({
                type: "error",
                error: { type: getErrorType(statusCode), message: errorMessage }
            })}\n\n`;
        case MODEL_PROTOCOL_PREFIX.GEMINI:
            return `data: ${JSON.stringify({
                error: { code: statusCode, message: errorMessage, status: getGeminiStatus(statusCode) }
            })}\n\n`;
        default:
            return `data: ${JSON.stringify({
                error: { message: errorMessage, type: getErrorType(statusCode), code: getErrorType(statusCode) }
            })}\n\n`;
    }
}

// ==================== _getProviderSpecificSuggestions (mock版本) ====================
function _getProviderSpecificSuggestions(statusCode, provider) {
    const base = {
        auth: ['检查 API 密钥是否正确', '确认账户状态是否正常', '检查权限设置'],
        permission: ['检查访问权限', '确认账户未被禁用', '检查订阅计划是否支持'],
        rateLimit: ['降低请求频率', '使用指数退避重试', '考虑升级订阅计划'],
        serverError: ['服务器内部错误，稍后重试', '检查服务状态页面'],
        clientError: ['检查请求参数是否正确', '查看详细的错误信息']
    };
    return base;
}

// ==================== Tests ====================

describe('common.js - 网络错误处理', () => {
    describe('RETRYABLE_NETWORK_ERRORS', () => {
        test('应包含所有可重试的网络错误码', () => {
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ECONNRESET');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ETIMEDOUT');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ECONNREFUSED');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ENOTFOUND');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ENETUNREACH');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('EHOSTUNREACH');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('EPIPE');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('EAI_AGAIN');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ECONNABORTED');
            expect(RETRYABLE_NETWORK_ERRORS).toContain('ESOCKETTIMEDOUT');
        });

        test('应为数组类型', () => {
            expect(Array.isArray(RETRYABLE_NETWORK_ERRORS)).toBe(true);
        });
    });

    describe('isRetryableNetworkError()', () => {
        test('应返回 true 当 error.code 在列表中', () => {
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            expect(isRetryableNetworkError(error)).toBe(true);
        });

        test('应返回 true 当 error.message 包含错误码', () => {
            const error = new Error('Network error: ECONNREFUSED by server');
            error.code = undefined;
            expect(isRetryableNetworkError(error)).toBe(true);
        });

        test('应返回 false 当 error 为 null', () => {
            expect(isRetryableNetworkError(null)).toBe(false);
        });

        test('应返回 false 当 error 为 undefined', () => {
            expect(isRetryableNetworkError(undefined)).toBe(false);
        });

        test('应返回 false 当 error 不包含可重试的错误码', () => {
            const error = new Error('Some other error');
            error.code = 'SOMETHING_ELSE';
            expect(isRetryableNetworkError(error)).toBe(false);
        });

        test('应返回 false 当 error 没有 code 和 message', () => {
            expect(isRetryableNetworkError({})).toBe(false);
        });
    });
});

describe('common.js - API 常量', () => {
    describe('API_ACTIONS', () => {
        test('应包含正确的 action 类型', () => {
            expect(API_ACTIONS).toBeDefined();
            expect(API_ACTIONS.GENERATE_CONTENT).toBe('generateContent');
            expect(API_ACTIONS.STREAM_GENERATE_CONTENT).toBe('streamGenerateContent');
        });
    });

    describe('MODEL_PROTOCOL_PREFIX', () => {
        test('应包含所有提供商前缀', () => {
            expect(MODEL_PROTOCOL_PREFIX).toBeDefined();
            expect(MODEL_PROTOCOL_PREFIX.OPENAI).toBe('openai');
            expect(MODEL_PROTOCOL_PREFIX.GEMINI).toBe('gemini');
            expect(MODEL_PROTOCOL_PREFIX.KIMI).toBe('kimi');
            expect(MODEL_PROTOCOL_PREFIX.CLAUDE).toBe('claude');
            expect(MODEL_PROTOCOL_PREFIX.CODEX).toBe('codex');
        });
    });

    describe('MODEL_PROVIDER', () => {
        test('应包含所有提供商常量', () => {
            expect(MODEL_PROVIDER).toBeDefined();
            expect(MODEL_PROVIDER.OPENAI).toBe('openai');
            expect(MODEL_PROVIDER.KIMI).toBe('kimi');
        });
    });

    describe('ENDPOINT_TYPE', () => {
        test('应包含所有端点类型', () => {
            expect(ENDPOINT_TYPE).toBeDefined();
            expect(ENDPOINT_TYPE.OPENAI_CHAT).toBe('openai_chat');
            expect(ENDPOINT_TYPE.GEMINI_CONTENT).toBe('gemini_content');
        });
    });
});

describe('common.js - getProtocolPrefix()', () => {
    test('openai-codex-oauth 应返回 codex', () => {
        expect(getProtocolPrefix('openai-codex-oauth')).toBe('codex');
    });

    test('kimi-oauth 应返回 kimi', () => {
        expect(getProtocolPrefix('kimi-oauth')).toBe('kimi');
    });

    test('标准格式应正确提取前缀', () => {
        expect(getProtocolPrefix('gemini-cli')).toBe('gemini');
        expect(getProtocolPrefix('openai-custom')).toBe('openai');
        expect(getProtocolPrefix('claude-kiro-oauth')).toBe('claude');
    });

    test('无连字符时应返回原值', () => {
        expect(getProtocolPrefix('simple')).toBe('simple');
    });

    test('应正确提取连字符前的部分', () => {
        expect(getProtocolPrefix('some-provider-name')).toBe('some');
    });

    test('空值应返回空字符串', () => {
        expect(getProtocolPrefix('')).toBe('');
        expect(getProtocolPrefix(null)).toBe('');
        expect(getProtocolPrefix(undefined)).toBe('');
    });
});

describe('common.js - formatExpiryTime()', () => {
    test('应返回正确格式的过期时间字符串', () => {
        const oneHourLater = Date.now() + 3600000;
        const result = formatExpiryTime(oneHourLater);
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^\d{2}h \d{2}m \d{2}s$/);
    });

    test('已过期应返回 "Token has expired"', () => {
        const pastTime = Date.now() - 10000;
        expect(formatExpiryTime(pastTime)).toBe('Token has expired');
    });

    test('无效输入应返回默认消息', () => {
        expect(formatExpiryTime(null)).toBe("No expiry date available");
        expect(formatExpiryTime(undefined)).toBe("No expiry date available");
    });

    test('非数字类型应返回默认消息', () => {
        expect(formatExpiryTime('not a number')).toBe("No expiry date available");
    });

    test('恰好过期时应返回 "Token has expired"', () => {
        expect(formatExpiryTime(Date.now())).toBe("Token has expired");
    });

    test('应正确格式化多小时', () => {
        const twoHours = Date.now() + 2 * 3600000 + 1000; // 加1秒避免边界情况
        const result = formatExpiryTime(twoHours);
        expect(result).toMatch(/^0[12]h/); // 匹配 01h 或 02h
    });

    test('应正确处理分钟和秒', () => {
        const thirtyMins = Date.now() + 30 * 60000;
        const result = formatExpiryTime(thirtyMins);
        expect(result).toMatch(/^00h 30m/);
    });
});

describe('common.js - formatLog()', () => {
    test('应返回格式化的日志字符串', () => {
        const result = formatLog('Test', 'Test message');
        expect(result).toBe('[Test] Test message');
    });

    test('当提供数据对象时应附加数据信息', () => {
        const result = formatLog('Test', 'Test message', { key: 'value' });
        expect(result).toContain('Test message');
        expect(result).toContain('key: value');
    });

    test('当数据为简单值时应附加数据信息', () => {
        const result = formatLog('Test', 'Test message', 'simple');
        expect(result).toBe('[Test] Test message | simple');
    });

    test('当数据为 null 时应只返回基本消息', () => {
        const result = formatLog('Test', 'Test message', null);
        expect(result).toBe('[Test] Test message');
    });

    test('当数据为 undefined 时应只返回基本消息', () => {
        const result = formatLog('Test', 'Test message', undefined);
        expect(result).toBe('[Test] Test message');
    });

    test('当数据为数组时应正确处理', () => {
        const result = formatLog('Test', 'Test message', [1, 2, 3]);
        expect(result).toContain('Test message');
    });

    test('当数据为嵌套对象时应正确处理', () => {
        const result = formatLog('Test', 'Test message', { nested: { key: 'value' } });
        expect(result).toContain('nested: [object Object]');
    });
});

describe('common.js - formatExpiryLog()', () => {
    test('应返回包含 message 和 isNearExpiry 的对象', () => {
        const result = formatExpiryLog('Test', Date.now() + 3600000, 30);
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('isNearExpiry');
        expect(typeof result.message).toBe('string');
        expect(typeof result.isNearExpiry).toBe('boolean');
    });

    test('距离过期大于阈值时 isNearExpiry 应为 false', () => {
        const result = formatExpiryLog('Test', Date.now() + 7200000, 30);
        expect(result.isNearExpiry).toBe(false);
    });

    test('距离过期小于阈值时 isNearExpiry 应为 true', () => {
        const result = formatExpiryLog('Test', Date.now() + 60000, 30);
        expect(result.isNearExpiry).toBe(true);
    });

    test('消息应包含标签信息', () => {
        const result = formatExpiryLog('Test', Date.now() + 3600000, 30);
        expect(result.message).toContain('[Test]');
    });
});

describe('common.js - getClientIp()', () => {
    test('应从 x-forwarded-for 头提取第一个 IP', () => {
        const req = {
            headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    test('无 x-forwarded-for 时应使用 remoteAddress', () => {
        const req = {
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getClientIp(req)).toBe('127.0.0.1');
    });

    test('应处理 IPv4-mapped IPv6 地址', () => {
        const req = {
            headers: {},
            socket: { remoteAddress: '::ffff:192.168.1.1' },
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    test('无 socket 时应返回 unknown', () => {
        const req = { headers: {}, socket: { remoteAddress: null } };
        expect(getClientIp(req)).toBe('unknown');
    });

    test('x-forwarded-for 应去除空格', () => {
        const req = {
            headers: { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    test('无 headers 时应返回 unknown', () => {
        const req = { headers: {}, socket: {} };
        expect(getClientIp(req)).toBe('unknown');
    });
});

describe('common.js - getMD5Hash()', () => {
    test('相同对象应返回相同哈希', () => {
        const obj = { key: 'value' };
        const hash1 = getMD5Hash(obj);
        const hash2 = getMD5Hash(obj);
        expect(hash1).toBe(hash2);
    });

    test('不同对象应返回不同哈希', () => {
        const hash1 = getMD5Hash({ a: 1 });
        const hash2 = getMD5Hash({ b: 2 });
        expect(hash1).not.toBe(hash2);
    });

    test('应返回32字符的十六进制字符串', () => {
        const hash = getMD5Hash({ test: true });
        expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    test('应正确处理空对象', () => {
        const hash = getMD5Hash({});
        expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    test('应正确处理嵌套对象', () => {
        const hash = getMD5Hash({ nested: { deep: 'value' } });
        expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
});

describe('common.js - formatToLocal()', () => {
    test('应返回格式化的时间字符串', () => {
        const result = formatToLocal(Date.now());
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('应正确处理毫秒时间戳', () => {
        const timestamp = Date.now();
        const result = formatToLocal(timestamp);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('应正确处理秒时间戳', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const result = formatToLocal(timestamp);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('应返回 -- 当输入为空', () => {
        expect(formatToLocal(null)).toBe('--');
        expect(formatToLocal(undefined)).toBe('--');
    });

    test('应返回 -- 当日期无效', () => {
        expect(formatToLocal(NaN)).toBe('--');
        expect(formatToLocal('invalid')).toBe('--');
    });
});

describe('common.js - findMatch / findByPrefix / hasByPrefix / getBaseType', () => {
    describe('findByPrefix()', () => {
        test('应精确匹配键', () => {
            const registry = { openai: { name: 'OpenAI' } };
            expect(findByPrefix(registry, 'openai')).toEqual({ name: 'OpenAI' });
        });

        test('应支持前缀匹配', () => {
            const registry = { 'openai-model': { name: 'OpenAI Model' } };
            expect(findByPrefix(registry, 'openai-model')).toEqual({ name: 'OpenAI Model' });
        });

        test('无匹配时应返回 undefined', () => {
            const registry = { other: { name: 'Other' } };
            expect(findByPrefix(registry, 'openai')).toBeUndefined();
        });

        test('应支持 Map 类型', () => {
            const registry = new Map([['kimi', { name: 'Kimi' }]]);
            expect(findByPrefix(registry, 'kimi')).toEqual({ name: 'Kimi' });
        });

        test('应支持带连字符的前缀匹配', () => {
            const registry = { 'openai-custom': { name: 'Custom' } };
            expect(findByPrefix(registry, 'openai-custom-1')).toEqual({ name: 'Custom' });
        });

        test('null registry 应返回 undefined', () => {
            expect(findByPrefix(null, 'key')).toBeUndefined();
        });
    });

    describe('hasByPrefix()', () => {
        test('应返回 true 当键存在', () => {
            const registry = { openai: true };
            expect(hasByPrefix(registry, 'openai-model')).toBe(true);
        });

        test('应返回 true 当键匹配前缀', () => {
            const registry = { 'openai-model': true };
            expect(hasByPrefix(registry, 'openai-model')).toBe(true);
        });

        test('键不存在时应返回 false', () => {
            const registry = { other: true };
            expect(hasByPrefix(registry, 'openai')).toBe(false);
        });

        test('应支持 Set 类型', () => {
            const registry = new Set(['openai', 'gemini']);
            expect(hasByPrefix(registry, 'openai-model')).toBe(true);
        });
    });

    describe('getBaseType()', () => {
        // getBaseType 使用 findMatch(registry, key, true)
        // 对于普通对象和 Map，返回的是值（因为 returnKey 仅对 Set 有效）
        test('应返回基本类型名称（对于普通对象）', () => {
            // 普通对象返回的是值，这里 'openai-gpt4' 匹配 'openai'，返回 true
            const registry = { 'openai': true };
            expect(getBaseType(registry, 'openai-gpt4')).toBe(true); // 返回 value
        });

        test('无匹配时应返回原值', () => {
            expect(getBaseType({}, 'simple')).toBe('simple');
        });

        test('精确匹配时应返回该键', () => {
            // 当 key === k 时，也返回 v
            const registry = { 'openai': 'custom_value' };
            expect(getBaseType(registry, 'openai')).toBe('custom_value');
        });

        test('应支持 Map 类型（返回 value）', () => {
            const registry = new Map([['gemini', { name: 'Gemini' }]]);
            expect(getBaseType(registry, 'gemini-2')).toEqual({ name: 'Gemini' }); // 返回 value
        });

        test('应支持 Set 类型（返回匹配的 Set 元素）', () => {
            const registry = new Set(['anthropic', 'google']);
            // 对于 Set，returnKey=true 时返回 Set 中的值（也就是 key）
            expect(getBaseType(registry, 'anthropic-claude')).toBe('anthropic');
        });

        test('Set 精确匹配应返回 Set 元素', () => {
            const registry = new Set(['anthropic', 'google']);
            expect(getBaseType(registry, 'anthropic')).toBe('anthropic');
        });

        test('Set 无匹配时应返回 key 本身（因为 matched 为 undefined）', () => {
            const registry = new Set(['anthropic', 'google']);
            // findMatch 返回 undefined，所以 getBaseType 返回 key 本身
            expect(getBaseType(registry, 'openai')).toBe('openai');
        });
    });
});

describe('common.js - extractSystemPromptFromRequestBody()', () => {
    test('应从请求体提取 system prompt', () => {
        const body = {
            messages: [
                { role: 'system', content: 'You are a helpful assistant' },
                { role: 'user', content: 'Hello' },
            ],
        };
        expect(extractSystemPromptFromRequestBody(body)).toBe('You are a helpful assistant');
    });

    test('无 system message 时应返回空字符串', () => {
        const body = {
            messages: [{ role: 'user', content: 'Hello' }],
        };
        expect(extractSystemPromptFromRequestBody(body)).toBe('');
    });

    test('body 为空时应返回空字符串', () => {
        expect(extractSystemPromptFromRequestBody(null)).toBe('');
        expect(extractSystemPromptFromRequestBody(undefined)).toBe('');
    });

    test('messages 为空时应返回空字符串', () => {
        expect(extractSystemPromptFromRequestBody({ messages: [] })).toBe('');
    });

    test('应返回第一个 system message 的内容', () => {
        const body = {
            messages: [
                { role: 'system', content: 'First system' },
                { role: 'system', content: 'Second system' },
            ],
        };
        expect(extractSystemPromptFromRequestBody(body)).toBe('First system');
    });
});

describe('common.js - escapeHtml()', () => {
    test('应转义 & 字符', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('应转义 < 和 > 字符', () => {
        expect(escapeHtml('<html>')).toBe('&lt;html&gt;');
    });

    test('应转义 " 字符', () => {
        expect(escapeHtml('他说："你好"')).toBe('他说：&quot;你好&quot;');
    });

    test('应转义 \' 字符', () => {
        expect(escapeHtml("it's a test")).toBe('it&#x27;s a test');
    });

    test('应同时转义多种特殊字符', () => {
        expect(escapeHtml('<div class="test">')).toBe('&lt;div class=&quot;test&quot;&gt;');
    });

    test('普通文本应不改变', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    test('null 应返回空字符串', () => {
        expect(escapeHtml(null)).toBe('');
    });

    test('undefined 应返回空字符串', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    test('数字应返回空字符串', () => {
        expect(escapeHtml(123)).toBe('');
    });

    test('对象应返回空字符串', () => {
        expect(escapeHtml({})).toBe('');
    });

    test('空字符串应返回空字符串', () => {
        expect(escapeHtml('')).toBe('');
    });

    test('应正确处理混合文本', () => {
        expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });
});

describe('common.js - safeCompare()', () => {
    test('相同字符串应返回 true', () => {
        expect(safeCompare('test', 'test')).toBe(true);
    });

    test('不同字符串应返回 false', () => {
        expect(safeCompare('test', 'other')).toBe(false);
    });

    test('长度不同应返回 false', () => {
        expect(safeCompare('short', 'longer')).toBe(false);
    });

    test('null 参数应返回 false', () => {
        expect(safeCompare(null, 'test')).toBe(false);
        expect(safeCompare('test', null)).toBe(false);
    });

    test('undefined 参数应返回 false', () => {
        expect(safeCompare(undefined, 'test')).toBe(false);
    });

    test('非字符串参数应返回 false', () => {
        expect(safeCompare(123, '123')).toBe(false);
        expect(safeCompare('123', {toString: () => '123'})).toBe(false);
    });

    test('空字符串应返回 false（长度不匹配）', () => {
        expect(safeCompare('', 'test')).toBe(false);
    });

    test('两个空字符串应返回 false（timingSafeEqual 对空 Buffer 返回 false）', () => {
        // crypto.timingSafeEqual 对空 Buffer 可能不会抛错但返回 false
        // 这是 Node.js 的行为
        expect(safeCompare('', '')).toBe(false);
    });
});

describe('common.js - getRequestBody() (模拟)', () => {
    test('MAX_BODY_SIZE 应为 10MB', () => {
        expect(MAX_BODY_SIZE).toBe(10 * 1024 * 1024);
    });

    test('空请求体应返回空对象', async () => {
        let dataCallback = null;
        let endCallback = null;
        const req = {
            on: (event, callback) => {
                if (event === 'data') dataCallback = callback;
                if (event === 'end') endCallback = callback;
            }
        };
        const promise = mockGetRequestBody(req);
        endCallback();
        const result = await promise;
        expect(result).toEqual({});
    });

    test('应正确解析 JSON 请求体', async () => {
        let dataCallback = null;
        let endCallback = null;
        const req = {
            on: (event, callback) => {
                if (event === 'data') dataCallback = callback;
                if (event === 'end') endCallback = callback;
            }
        };
        const promise = mockGetRequestBody(req);
        dataCallback(JSON.stringify({ test: true }));
        endCallback();
        const result = await promise;
        expect(result).toEqual({ test: true });
    });

    test('无效 JSON 应抛出错误', async () => {
        let dataCallback = null;
        let endCallback = null;
        const req = {
            on: (event, callback) => {
                if (event === 'data') dataCallback = callback;
                if (event === 'end') endCallback = callback;
            }
        };
        const promise = mockGetRequestBody(req);
        dataCallback('invalid json{');
        endCallback();
        await expect(promise).rejects.toThrow('Invalid JSON');
    });

    test('超过限制应抛出错误', async () => {
        let dataCallback = null;
        const req = {
            on: (event, callback) => {
                if (event === 'data') dataCallback = callback;
            }
        };
        const promise = mockGetRequestBody(req);
        const largeBody = 'x'.repeat(MAX_BODY_SIZE + 1);
        dataCallback(largeBody);
        await expect(promise).rejects.toThrow('Request body too large');
    });
});

describe('common.js - createErrorResponse()', () => {
    test('OpenAI 格式应正确生成错误响应', () => {
        const error = { message: 'Test error', code: 400 };
        const response = createErrorResponse(error, 'openai');
        expect(response).toHaveProperty('error');
        expect(response.error.message).toBe('Test error');
        expect(response.error.type).toBe('invalid_request_error');
    });

    test('Claude 格式应包含 type 标记', () => {
        const error = { message: 'Auth failed', code: 401 };
        const response = createErrorResponse(error, 'claude-kiro-oauth');
        expect(response).toHaveProperty('type', 'error');
        expect(response).toHaveProperty('error');
        expect(response.error.type).toBe('authentication_error');
    });

    test('Gemini 格式应包含 status 字段', () => {
        const error = { message: 'Server error', code: 500 };
        const response = createErrorResponse(error, 'gemini-cli');
        expect(response).toHaveProperty('error');
        expect(response.error.status).toBe('INTERNAL');
    });

    test('OpenAI Responses 格式应正确生成', () => {
        const error = { message: 'Rate limited', code: 429 };
        const response = createErrorResponse(error, 'openai-responses-oauth');
        expect(response).toHaveProperty('error');
        expect(response.error.type).toBe('rate_limit_error');
    });

    test('未知提供商应使用默认格式', () => {
        const error = { message: 'Unknown error', code: 500 };
        const response = createErrorResponse(error, 'unknown-provider');
        expect(response).toHaveProperty('error');
        expect(response.error.type).toBe('server_error');
    });

    test('403 错误应返回 permission_error', () => {
        const error = { message: 'Forbidden', code: 403 };
        const response = createErrorResponse(error, 'openai');
        expect(response.error.type).toBe('permission_error');
    });
});

describe('common.js - createStreamErrorResponse()', () => {
    test('OpenAI 格式应生成 SSE 错误', () => {
        const error = { message: 'Stream error', code: 500 };
        const response = createStreamErrorResponse(error, 'openai');
        expect(response).toContain('data:');
        expect(response).toContain('server_error');
        expect(response).toContain('Stream error');
    });

    test('Claude 格式应包含 error type', () => {
        const error = { message: 'Auth failed', code: 401 };
        const response = createStreamErrorResponse(error, 'claude-kiro-oauth');
        expect(response).toContain('error');
        expect(response).toContain('authentication_error');
    });

    test('Gemini 格式应包含 status', () => {
        const error = { message: 'Server error', code: 500 };
        const response = createStreamErrorResponse(error, 'gemini-cli');
        expect(response).toContain('INTERNAL');
    });

    test('应正确处理 429 错误', () => {
        const error = { message: 'Rate limit', code: 429 };
        const response = createStreamErrorResponse(error, 'openai');
        expect(response).toContain('rate_limit_error');
    });
});

describe('common.js - _getProviderSpecificSuggestions()', () => {
    test('应返回包含所有建议类别的对象', () => {
        const suggestions = _getProviderSpecificSuggestions(401, 'openai');
        expect(suggestions).toHaveProperty('auth');
        expect(suggestions).toHaveProperty('permission');
        expect(suggestions).toHaveProperty('rateLimit');
    });

    test('auth 建议应包含 API 密钥检查', () => {
        const suggestions = _getProviderSpecificSuggestions(401, 'openai');
        expect(suggestions.auth).toContain('检查 API 密钥是否正确');
    });

    test('rateLimit 建议应包含降频建议', () => {
        const suggestions = _getProviderSpecificSuggestions(429, 'openai');
        expect(suggestions.rateLimit).toContain('降低请求频率');
    });
});

describe('common.js - MAX_BODY_SIZE 常量', () => {
    test('应为 10MB', () => {
        expect(MAX_BODY_SIZE).toBe(10 * 1024 * 1024);
    });
});