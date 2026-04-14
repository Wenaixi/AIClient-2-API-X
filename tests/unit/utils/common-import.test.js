/**
 * common.js 单元测试
 * 测试策略：直接导入真实模块，使用 mock 避免复杂依赖链
 */

// Mock 依赖模块
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    sanitizeLog: jest.fn(str => str)
}));

jest.mock('../../../src/utils/constants.js', () => ({
    MODEL_PROTOCOL_PREFIX: {
        OPENAI: 'openai',
        GEMINI: 'gemini',
        CLAUDE: 'claude',
        KIMI: 'kimi',
        FORWARD: 'forward',
        GROK: 'grok',
        CODEX: 'codex',
        OPENAI_RESPONSES: 'openai-responses'
    },
    MODEL_PROVIDER: {
        OPENAI: 'openai',
        GEMINI: 'gemini',
        CLAUDE: 'claude',
        KIMI: 'kimi',
        FORWARD: 'forward',
        GROK: 'grok',
        OPENAI_CODEX: 'openai-codex',
        OPENAI_RESPONSES: 'openai-responses'
    }
}));

// Mock provider-models
jest.mock('../../../src/providers/provider-models.js', () => ({
    usesManagedModelList: jest.fn(),
    getConfiguredSupportedModels: jest.fn(() => [])
}));

// Mock plugin-manager
jest.mock('../../../src/core/plugin-manager.js', () => ({
    getPluginManager: jest.fn(() => null)
}));

// Mock provider-strategies
jest.mock('../../../src/utils/provider-strategies.js', () => ({
    ProviderStrategyFactory: jest.fn()
}));

// Mock convert
jest.mock('../../../src/convert/convert.js', () => ({
    convertData: jest.fn(),
    getOpenAIStreamChunkStop: jest.fn()
}));

const {
    RETRYABLE_NETWORK_ERRORS,
    isRetryableNetworkError,
    getProtocolPrefix,
    formatExpiryTime,
    formatLog,
    formatExpiryLog,
    getClientIp,
    getMD5Hash,
    formatToLocal,
    findByPrefix,
    hasByPrefix,
    getBaseType,
    extractSystemPromptFromRequestBody,
    escapeHtml,
    safeCompare,
    isAuthorized
} = require('../../../src/utils/common');

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

describe('common.js - getProtocolPrefix()', () => {
    test('应返回 codex 当 provider 为 openai-codex-oauth', () => {
        expect(getProtocolPrefix('openai-codex-oauth')).toBe('codex');
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

    test('当 provider 为空字符串时应返回空字符串', () => {
        expect(getProtocolPrefix('')).toBe('');
    });
});

describe('common.js - formatExpiryTime()', () => {
    test('应返回正确格式的过期时间字符串', () => {
        const now = Date.now();
        const oneHourLater = now + 3600000;
        const result = formatExpiryTime(oneHourLater);
        expect(typeof result).toBe('string');
        // 返回格式: "01h 00m 00s"
        expect(result).toMatch(/^\d{2}h \d{2}m \d{2}s$/);
    });

    test('当过期时间戳已过时应返回 "Token has expired"', () => {
        const pastTime = Date.now() - 10000;
        expect(formatExpiryTime(pastTime)).toBe('Token has expired');
    });

    test('当没有过期时间戳时应返回默认消息', () => {
        expect(formatExpiryTime(null)).toBe('No expiry date available');
        expect(formatExpiryTime(undefined)).toBe('No expiry date available');
    });

    test('当时间戳为非数字类型时应返回默认消息', () => {
        expect(formatExpiryTime('not a number')).toBe('No expiry date available');
    });

    test('当过期时间恰好到期时应返回 "Token has expired"', () => {
        const exactNow = Date.now();
        expect(formatExpiryTime(exactNow)).toBe('Token has expired');
    });

    test('应正确处理刚好1小时', () => {
        const oneHour = Date.now() + 3600000;
        const result = formatExpiryTime(oneHour);
        expect(result).toContain('h');
        expect(result).toContain('m');
        expect(result).toContain('s');
    });

    test('应正确处理多天', () => {
        const twoDays = Date.now() + 2 * 24 * 3600000;
        const result = formatExpiryTime(twoDays);
        expect(result).toMatch(/^\d{2}h/); // 48h+
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
        // 默认 nearMinutes = 30，所以 1 分钟后的时间肯定 nearExpiry
        const result = formatExpiryLog('Test', Date.now() + 60000, 30);
        expect(result.isNearExpiry).toBe(true);
    });

    test('消息应包含标签和过期日期信息', () => {
        const result = formatExpiryLog('Test', Date.now() + 3600000);
        expect(result.message).toContain('Test');
    });

    test('默认 nearMinutes 为 30 分钟', () => {
        // 1 小时后 - 不应该 nearExpiry（默认30分钟阈值）
        const result = formatExpiryLog('Test', Date.now() + 3600000);
        expect(result.isNearExpiry).toBe(false);
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

    test('应处理 IPv4-mapped IPv6 地址（转换为 IPv4）', () => {
        const req = {
            headers: {},
            socket: { remoteAddress: '::ffff:192.168.1.1' },
        };
        // getClientIp 会将 ::ffff: 前缀去掉，转换为 IPv4
        expect(getClientIp(req)).toBe('192.168.1.1');
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
        // 格式: "04-14 10:07" 或 "2026-04-14 10:07:00"
        expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}/);
    });

    test('应正确处理毫秒时间戳', () => {
        const timestamp = Date.now();
        const result = formatToLocal(timestamp);
        expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}/);
    });

    test('应正确处理秒时间戳', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const result = formatToLocal(timestamp);
        expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}/);
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

    test('应支持精确匹配键时的前缀查找', () => {
        // 'openai-model' 以 'openai' 开头，但需要 'openai-' 前缀
        const registry = { 'openai-model': { name: 'OpenAI Model' } };
        expect(findByPrefix(registry, 'openai-model')).toEqual({ name: 'OpenAI Model' });
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

    test('应支持 key 为更长的字符串匹配短的前缀', () => {
        const registry = { 'openai': { name: 'OpenAI' } };
        expect(findByPrefix(registry, 'openai-model')).toEqual({ name: 'OpenAI' });
    });
});

describe('common.js - hasByPrefix()', () => {
    test('应返回 true 当键存在', () => {
        const registry = { openai: true };
        expect(hasByPrefix(registry, 'openai')).toBe(true);
    });

    test('应返回 true 当 key 匹配前缀', () => {
        const registry = { 'openai': true };
        expect(hasByPrefix(registry, 'openai-model')).toBe(true);
    });

    test('当键不存在时应返回 false', () => {
        const registry = { other: true };
        expect(hasByPrefix(registry, 'openai')).toBe(false);
    });

    test('当 registry 为空时应返回 false', () => {
        const registry = {};
        expect(hasByPrefix(registry, 'openai')).toBe(false);
    });
});

describe('common.js - getBaseType()', () => {
    test('应返回基础类型的值', () => {
        expect(getBaseType({ 'openai': true }, 'openai-gpt4')).toBe(true);
        expect(getBaseType({ 'kimi': { url: 'test' } }, 'kimi-moonshot')).toEqual({ url: 'test' });
    });

    test('当输入无连字符且无匹配时应返回原值', () => {
        expect(getBaseType({}, 'simple')).toBe('simple');
    });

    test('当key精确匹配registry中的键时应返回该键对应的值', () => {
        expect(getBaseType({ 'openai': true }, 'openai')).toBe(true);
    });

    test('应支持带连字符的key匹配registry中的前缀', () => {
        expect(getBaseType({ 'openai': true }, 'openai-gpt4-turbo')).toBe(true);
    });
});

describe('common.js - extractSystemPromptFromRequestBody()', () => {
    test('应从请求体提取 system prompt (openai)', () => {
        const body = {
            messages: [
                { role: 'system', content: 'You are a helpful assistant' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const result = extractSystemPromptFromRequestBody(body, 'openai');
        expect(result).toBe('You are a helpful assistant');
    });

    test('当没有 system message 时应 fallback 到第一个 user message (openai)', () => {
        const body = {
            messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = extractSystemPromptFromRequestBody(body, 'openai');
        expect(result).toBe('Hello'); // fallback to user message
    });

    test('当 body 为空时应返回空字符串', () => {
        expect(extractSystemPromptFromRequestBody(null, 'openai')).toBe('');
        expect(extractSystemPromptFromRequestBody(undefined, 'openai')).toBe('');
    });

    test('当 messages 为空时应返回空字符串 (openai)', () => {
        const body = { messages: [] };
        const result = extractSystemPromptFromRequestBody(body, 'openai');
        expect(result).toBe('');
    });

    test('应返回第一个 system message 的内容 (openai)', () => {
        const body = {
            messages: [
                { role: 'system', content: 'First system' },
                { role: 'system', content: 'Second system' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const result = extractSystemPromptFromRequestBody(body, 'openai');
        expect(result).toBe('First system');
    });

    test('应处理 claude 格式的 system', () => {
        const body = {
            system: 'You are Claude',
            messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = extractSystemPromptFromRequestBody(body, 'claude');
        expect(result).toBe('You are Claude');
    });

    test('应处理 gemini 格式的 system_instruction', () => {
        const body = {
            system_instruction: { parts: [{ text: 'You are Gemini' }] },
            contents: [],
        };
        const result = extractSystemPromptFromRequestBody(body, 'gemini');
        expect(result).toBe('You are Gemini');
    });

    test('当 provider 不匹配时应返回空字符串', () => {
        const body = {
            messages: [
                { role: 'system', content: 'Test' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const result = extractSystemPromptFromRequestBody(body, 'unknown');
        expect(result).toBe('');
    });
});

describe('common.js - escapeHtml()', () => {
    test('应转义 & 字符', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('应转义 < 字符', () => {
        expect(escapeHtml('<html>')).toBe('&lt;html&gt;');
    });

    test('应转义 > 字符', () => {
        expect(escapeHtml('a > b')).toBe('a &gt; b');
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

    test('应处理普通文本不改变', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    test('当输入为 null 时应返回空字符串', () => {
        expect(escapeHtml(null)).toBe('');
    });

    test('当输入为 undefined 时应返回空字符串', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    test('当输入为数字时应返回空字符串', () => {
        expect(escapeHtml(123)).toBe('');
    });

    test('当输入为对象时应返回空字符串', () => {
        expect(escapeHtml({})).toBe('');
    });

    test('当输入为空字符串时应返回空字符串', () => {
        expect(escapeHtml('')).toBe('');
    });

    test('应正确处理混合文本和特殊字符', () => {
        expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });
});

describe('common.js - safeCompare()', () => {
    test('应返回 true 当两个字符串相等', () => {
        expect(safeCompare('test', 'test')).toBe(true);
    });

    test('应返回 false 当两个字符串不相等', () => {
        expect(safeCompare('test', 'other')).toBe(false);
    });

    test('当任一输入为空时应返回 false', () => {
        expect(safeCompare('', '')).toBe(false);
        expect(safeCompare('', 'test')).toBe(false);
        expect(safeCompare('test', '')).toBe(false);
    });

    test('当任一输入为非字符串时应返回 false', () => {
        expect(safeCompare(123, 123)).toBe(false);
        expect(safeCompare('test', 123)).toBe(false);
        expect(safeCompare(null, 'test')).toBe(false);
    });

    test('当长度不匹配时应返回 false', () => {
        expect(safeCompare('short', 'longer')).toBe(false);
    });
});

describe('common.js - isAuthorized()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('应返回 true 当 Bearer token 匹配', () => {
        const req = {
            headers: { 'authorization': 'Bearer test-api-key' }
        };
        const url = new URL('http://localhost/api');
        expect(isAuthorized(req, url, 'test-api-key')).toBe(true);
    });

    test('应返回 true 当 query key 匹配', () => {
        const req = { headers: {} };
        const url = new URL('http://localhost/api?key=test-api-key');
        expect(isAuthorized(req, url, 'test-api-key')).toBe(true);
    });

    test('应返回 true 当 x-goog-api-key 匹配', () => {
        const req = {
            headers: { 'x-goog-api-key': 'test-api-key' }
        };
        const url = new URL('http://localhost/api');
        expect(isAuthorized(req, url, 'test-api-key')).toBe(true);
    });

    test('应返回 true 当 x-api-key 匹配', () => {
        const req = {
            headers: { 'x-api-key': 'test-api-key' }
        };
        const url = new URL('http://localhost/api');
        expect(isAuthorized(req, url, 'test-api-key')).toBe(true);
    });

    test('当没有授权信息时应返回 false', () => {
        const req = { headers: {} };
        const url = new URL('http://localhost/api');
        expect(isAuthorized(req, url, 'test-api-key')).toBe(false);
    });
});
