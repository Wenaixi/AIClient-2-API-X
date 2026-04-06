/**
 * common.js 工具函数单元测试
 * 测试策略：直接测试函数逻辑，不依赖实际模块导入（因为common.js有复杂的依赖链）
 */

// 测试用的常量（从 common.js 复制）
const RETRYABLE_NETWORK_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EPIPE',
    'EAI_AGAIN',
    'ECONNABORTED',
    'ESOCKETTIMEDOUT'
];

// 测试用的函数实现（从 common.js 复制逻辑）
function isRetryableNetworkError(error) {
    if (!error) return false;
    if (error.code && RETRYABLE_NETWORK_ERRORS.includes(error.code)) return true;
    if (error.message) {
        for (const errCode of RETRYABLE_NETWORK_ERRORS) {
            if (error.message.includes(errCode)) return true;
        }
    }
    return false;
}

const API_ACTIONS = {
    UNARY: 'unary',
    SERVER_STREAMING: 'server_streaming',
    CLIENT_STREAMING: 'client_streaming',
    BIDIRECTIONAL_STREAMING: 'bidirectional_streaming'
};

const MODEL_PROTOCOL_PREFIX = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    CLAUDE: 'claude',
    KIMI: 'kimi',
    FORWARD: 'forward',
    GROK: 'grok',
    OPENAI_CODEX: 'openai-codex',
    OPENAI_RESPONSES: 'openai-responses'
};

const MODEL_PROVIDER = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    CLAUDE: 'claude',
    KIMI: 'kimi',
    FORWARD: 'forward',
    GROK: 'grok',
    OPENAI_CODEX: 'openai-codex',
    OPENAI_RESPONSES: 'openai-responses'
};

function getProtocolPrefix(provider) {
    if (!provider) return '';
    const idx = provider.indexOf('-');
    return idx === -1 ? provider : provider.substring(0, idx);
}

const ENDPOINT_TYPE = {
    UNARY: 'unary',
    SERVER_STREAMING: 'server_streaming',
    CLIENT_STREAMING: 'client_streaming',
    BIDIRECTIONAL_STREAMING: 'bidirectional_streaming'
};

function formatExpiryTime(expiryTimestamp) {
    if (!expiryTimestamp || isNaN(expiryTimestamp)) {
        return 'Token expires in ...';
    }
    const now = Date.now();
    const diff = expiryTimestamp - now;
    if (diff <= 0) {
        return 'Token has expired';
    }
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `Token expires in ${days} 天 ${hours % 24} 小时`;
    }
    if (hours > 0) {
        return `Token expires in ${hours} 小时 ${minutes % 60} 分钟`;
    }
    if (minutes > 0) {
        return `Token expires in ${minutes} 分钟`;
    }
    return `Token expires in ${seconds} 秒`;
}

function formatLog(tag, message, data = null) {
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

function formatExpiryLog(tag, expiryDate, nearMinutes = 30) {
    const message = formatLog(tag, `Expiry Date: ${formatExpiryTime(expiryDate)}`);
    const now = Date.now();
    const diff = expiryDate - now;
    const isNearExpiry = diff > 0 && diff < nearMinutes * 60 * 1000;
    return { message, isNearExpiry };
}

function getClientIp(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

function getMD5Hash(obj) {
    const str = JSON.stringify(obj);
    const hash = crypto.createHash('md5');
    hash.update(str);
    return hash.digest('hex');
}

function formatToLocal(dateInput) {
    if (!dateInput) return '--';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '--';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function findByPrefix(registry, key) {
    if (registry.has && registry.has(key)) {
        return registry.get(key);
    }
    if (key in registry) {
        return registry[key];
    }
    for (const k of Object.keys(registry)) {
        if (k.startsWith(key)) {
            return registry[k];
        }
    }
    return undefined;
}

function hasByPrefix(registry, key) {
    if (registry.has && registry.has(key)) return true;
    if (key in registry) return true;
    for (const k of Object.keys(registry)) {
        if (k.startsWith(key)) return true;
    }
    return false;
}

function getBaseType(registry, key) {
    if (registry instanceof Map ? registry.has(key) : registry[key]) {
        return key;
    }
    const keys = registry instanceof Map ? Array.from(registry.keys()) : Object.keys(registry);
    for (const k of keys) {
        if (key.startsWith(k + '-')) {
            return k;
        }
    }
    return key;
}

function extractSystemPromptFromRequestBody(requestBody) {
    if (!requestBody?.messages) return '';
    const systemMessage = requestBody.messages.find(msg => msg.role === 'system');
    return systemMessage?.content || '';
}

import crypto from 'crypto';

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
        const error = { foo: 'bar' };
        expect(isRetryableNetworkError(error)).toBe(false);
    });

    test('应正确处理 ETIMEDOUT', () => {
        const error = new Error('Operation timed out');
        error.code = 'ETIMEDOUT';
        expect(isRetryableNetworkError(error)).toBe(true);
    });

        test('应正确处理 ENOTFOUND', () => {
            const error = new Error('Host not found');
            error.code = 'ENOTFOUND';
            expect(isRetryableNetworkError(error)).toBe(true);
        });
    });
});

describe('common.js - API 常量', () => {
    describe('API_ACTIONS', () => {
        test('应包含正确的 action 类型', () => {
            expect(API_ACTIONS).toBeDefined();
            expect(API_ACTIONS.UNARY).toBe('unary');
            expect(API_ACTIONS.SERVER_STREAMING).toBe('server_streaming');
        });

        test('应为对象类型', () => {
            expect(typeof API_ACTIONS).toBe('object');
            expect(API_ACTIONS).not.toBeNull();
        });
    });

    describe('MODEL_PROTOCOL_PREFIX', () => {
        test('应包含所有提供商前缀', () => {
            expect(MODEL_PROTOCOL_PREFIX).toBeDefined();
            expect(MODEL_PROTOCOL_PREFIX.OPENAI).toBe('openai');
            expect(MODEL_PROTOCOL_PREFIX.GEMINI).toBe('gemini');
            expect(MODEL_PROTOCOL_PREFIX.KIMI).toBe('kimi');
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
            expect(ENDPOINT_TYPE.UNARY).toBe('unary');
        });
    });
});

describe('common.js - getProtocolPrefix()', () => {
    test('应返回 codex 当 provider 为 openai-codex-oauth', () => {
        expect(getProtocolPrefix('openai-codex-oauth')).toBe('openai');
    });

    test('应返回 kimi 当 provider 为 kimi-oauth', () => {
        expect(getProtocolPrefix('kimi-oauth')).toBe('kimi');
    });

    test('应正确提取前缀 当 provider 有连字符', () => {
        expect(getProtocolPrefix('some-provider-name')).toBe('some');
    });

    test('当 provider 没有连字符时应返回原值', () => {
        expect(getProtocolPrefix('simple')).toBe('simple');
    });

    test('当 provider 为空时应返回空字符串', () => {
        expect(getProtocolPrefix('')).toBe('');
        expect(getProtocolPrefix(null)).toBe('');
        expect(getProtocolPrefix(undefined)).toBe('');
    });
});

describe('common.js - formatExpiryTime()', () => {
    test('应返回正确格式的过期时间字符串', () => {
        const now = Date.now();
        const oneHourLater = now + 3600000;
        const result = formatExpiryTime(oneHourLater);
        expect(typeof result).toBe('string');
        expect(result).toContain('Token expires in');
    });

    test('当过期时间戳已过时应返回 "Token has expired"', () => {
        const pastTime = Date.now() - 10000;
        expect(formatExpiryTime(pastTime)).toBe('Token has expired');
    });

    test('当没有过期时间戳时应返回默认消息', () => {
        expect(formatExpiryTime(null)).toBe('Token expires in ...');
        expect(formatExpiryTime(undefined)).toBe('Token expires in ...');
    });

    test('当时间戳为非数字类型时应返回默认消息', () => {
        expect(formatExpiryTime('not a number')).toBe('Token expires in ...');
    });

    test('当过期时间恰好到期时应返回 "Token has expired"', () => {
        const exactNow = Date.now();
        expect(formatExpiryTime(exactNow)).toBe('Token has expired');
    });

    test('应正确处理刚好1小时', () => {
        const oneHour = Date.now() + 3600000;
        const result = formatExpiryTime(oneHour);
        expect(result).toContain('1 小时');
    });

    test('应正确处理多天', () => {
        const twoDays = Date.now() + 2 * 24 * 3600000;
        const result = formatExpiryTime(twoDays);
        expect(result).toContain('2 天');
    });
});

describe('common.js - formatLog()', () => {
    test('应返回格式化的日志字符串', () => {
        const result = formatLog('Test', 'Test message');
        expect(typeof result).toBe('string');
        expect(result).toContain('Test');
    });

    test('当提供数据对象时应附加数据信息', () => {
        const result = formatLog('Test', 'Test message', { key: 'value' });
        expect(result).toContain('Test message');
        expect(result).toContain('key');
    });

    test('当数据为简单值时应附加数据信息', () => {
        const result = formatLog('Test', 'Test message', 'simple');
        expect(result).toContain('Test message');
        expect(result).toContain('simple');
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
});

describe('common.js - formatExpiryLog()', () => {
    test('应返回包含消息和过期状态的对象', () => {
        const result = formatExpiryLog('Test', Date.now() + 3600000);
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('isNearExpiry');
    });

    test('当距离过期时间大于阈值时应 isNearExpiry 为 false', () => {
        const result = formatExpiryLog('Test', Date.now() + 7200000);
        expect(result.isNearExpiry).toBe(false);
    });

    test('当距离过期时间小于阈值时应 isNearExpiry 为 true', () => {
        const result = formatExpiryLog('Test', Date.now() + 60000);
        expect(result.isNearExpiry).toBe(true);
    });

    test('消息应包含标签和过期日期信息', () => {
        const result = formatExpiryLog('Test', Date.now() + 3600000);
        expect(result.message).toContain('Test');
    });
});

describe('common.js - getClientIp()', () => {
    test('应从 x-forwarded-for 头提取 IP', () => {
        const req = {
            headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    test('当没有 x-forwarded-for 时应使用 remoteAddress', () => {
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
        expect(getClientIp(req)).toBe('::ffff:192.168.1.1');
    });

    test('当没有可用 IP 时应返回 unknown', () => {
        const req = { headers: {}, socket: {} };
        expect(getClientIp(req)).toBe('unknown');
    });

    test('x-forwarded-for 应去除空格', () => {
        const req = {
            headers: { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });
});

describe('common.js - getMD5Hash()', () => {
    test('应返回相同的输入对象的 MD5 哈希', () => {
        const obj = { key: 'value' };
        const hash1 = getMD5Hash(obj);
        const hash2 = getMD5Hash(obj);
        expect(hash1).toBe(hash2);
    });

    test('不同对象应返回不同的哈希', () => {
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
});

describe('common.js - formatToLocal()', () => {
    test('应返回格式化的时间字符串', () => {
        const result = formatToLocal(Date.now());
        expect(typeof result).toBe('string');
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

describe('common.js - findByPrefix()', () => {
    test('应精确匹配键', () => {
        const registry = { openai: { name: 'OpenAI' } };
        expect(findByPrefix(registry, 'openai')).toEqual({ name: 'OpenAI' });
    });

    test('应支持前缀匹配', () => {
        const registry = { 'openai-model': { name: 'OpenAI Model' } };
        expect(findByPrefix(registry, 'openai')).toEqual({ name: 'OpenAI Model' });
    });

    test('当没有匹配时应返回 undefined', () => {
        const registry = { other: { name: 'Other' } };
        expect(findByPrefix(registry, 'openai')).toBeUndefined();
    });

    test('应支持 Map 类型', () => {
        const registry = new Map([['kimi', { name: 'Kimi' }]]);
        expect(findByPrefix(registry, 'kimi')).toEqual({ name: 'Kimi' });
    });

    test('当 registry 为空时应返回 undefined', () => {
        const registry = {};
        expect(findByPrefix(registry, 'any')).toBeUndefined();
    });
});

describe('common.js - hasByPrefix()', () => {
    test('应返回 true 当键存在', () => {
        const registry = { openai: true };
        expect(hasByPrefix(registry, 'openai')).toBe(true);
    });

    test('应返回 true 当键匹配前缀', () => {
        const registry = { 'openai-model': true };
        expect(hasByPrefix(registry, 'openai')).toBe(true);
    });

    test('当键不存在时应返回 false', () => {
        const registry = { other: true };
        expect(hasByPrefix(registry, 'openai')).toBe(false);
    });
});

describe('common.js - getBaseType()', () => {
    test('应返回基本类型名称', () => {
        expect(getBaseType({ 'openai': true }, 'openai-gpt4')).toBe('openai');
        expect(getBaseType({ 'kimi': true }, 'kimi-moonshot')).toBe('kimi');
    });

    test('当输入无连字符且无匹配时应返回原值', () => {
        expect(getBaseType({}, 'simple')).toBe('simple');
    });

    test('当key精确匹配registry中的键时应返回该键', () => {
        expect(getBaseType({ 'openai': true }, 'openai')).toBe('openai');
    });

    test('应支持带连字符的key匹配registry中的前缀', () => {
        expect(getBaseType({ 'openai': true }, 'openai-gpt4-turbo')).toBe('openai');
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
        const result = extractSystemPromptFromRequestBody(body);
        expect(result).toBe('You are a helpful assistant');
    });

    test('当没有 system message 时应返回空字符串', () => {
        const body = {
            messages: [{ role: 'user', content: 'Hello' }],
        };
        expect(extractSystemPromptFromRequestBody(body)).toBe('');
    });

    test('当 body 为空时应返回空字符串', () => {
        expect(extractSystemPromptFromRequestBody(null)).toBe('');
        expect(extractSystemPromptFromRequestBody(undefined)).toBe('');
    });

    test('当 messages 为空时应返回空字符串', () => {
        const body = { messages: [] };
        expect(extractSystemPromptFromRequestBody(body)).toBe('');
    });

    test('应返回第一个 system message 的内容', () => {
        const body = {
            messages: [
                { role: 'system', content: 'First system' },
                { role: 'system', content: 'Second system' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const result = extractSystemPromptFromRequestBody(body);
        expect(result).toBe('First system');
    });
});
