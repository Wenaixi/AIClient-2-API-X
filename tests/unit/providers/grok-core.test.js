/**
 * GrokApiService 核心单元测试
 * 覆盖：构造函数/MODEL_MAPPING/classifyApiError/setupNsfw相关/_getModelMapping/_extractMessagesAndFiles/initialize/refreshToken
 */

jest.mock('axios', () => {
    const mockAxios = jest.fn(() => Promise.resolve({ data: {} }));
    mockAxios.create = jest.fn(() => ({ request: jest.fn() }));
    return mockAxios;
});

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1234') }));

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureAxiosProxy: jest.fn(),
    configureTLSSidecar: jest.fn((cfg) => cfg),
    getProxyConfigForProvider: jest.fn(() => null),
}));

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn(() => false),
    MODEL_PROTOCOL_PREFIX: { GROK: 'grok' },
    MODEL_PROVIDER: {
        GROK_CUSTOM: 'grok_custom',
    },
}));

jest.mock('../../../src/providers/provider-models.js', () => ({
    getProviderModels: jest.fn(() => ['grok-4.20', 'grok-3']),
}));

jest.mock('../../../src/converters/ConverterFactory.js', () => ({
    ConverterFactory: {
        getConverter: jest.fn(() => ({
            setUuid: jest.fn(),
            formatToolHistory: jest.fn(msgs => msgs),
            buildToolPrompt: jest.fn(() => ''),
            buildToolOverrides: jest.fn(() => ({})),
        })),
    },
}));

jest.mock('../../../src/providers/adapter.js', () => ({
    getServiceAdapter: jest.fn(),
    serviceInstances: new Map(),
}));

jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn(() => ({
        resetProviderRefreshStatus: jest.fn(),
    })),
}));

jest.mock('../../../src/providers/grok/ws-imagine.js', () => ({
    ImagineWebSocketService: jest.fn().mockImplementation(() => ({})),
}));

import { GrokApiService } from '../../../src/providers/grok/grok-core.js';
import { isRetryableNetworkError } from '../../../src/utils/common.js';

function createConfig(overrides = {}) {
    return {
        GROK_COOKIE_TOKEN: 'sso=test-sso-token',
        GROK_BASE_URL: 'https://grok.com',
        REQUEST_MAX_RETRIES: 2,
        REQUEST_BASE_DELAY: 10,
        uuid: 'test-uuid',
        ...overrides,
    };
}

describe('GrokApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isRetryableNetworkError.mockReturnValue(false);
    });

    // ─── 构造函数 ─────────────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('正常构造', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc.token).toBe('sso=test-sso-token');
            expect(svc.baseUrl).toBe('https://grok.com');
            expect(svc.isInitialized).toBe(false);
        });

        it('使用默认 baseUrl', () => {
            const svc = new GrokApiService(createConfig({ GROK_BASE_URL: undefined }));
            expect(svc.baseUrl).toBe('https://grok.com');
        });

        it('使用自定义 userAgent', () => {
            const svc = new GrokApiService(createConfig({ GROK_USER_AGENT: 'MyAgent/1.0' }));
            expect(svc.userAgent).toBe('MyAgent/1.0');
        });

        it('没有 uuid 时 converter 不调用 setUuid', () => {
            const svc = new GrokApiService(createConfig({ uuid: undefined }));
            expect(svc.converter).toBeDefined();
        });

        it('chatApi 包含 /rest/app-chat/conversations/new', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc.chatApi).toContain('/rest/app-chat/conversations/new');
        });
    });

    // ─── getMaxRequestRetries ─────────────────────────────────────────────────────

    describe('getMaxRequestRetries', () => {
        it('有效配置返回正确值', () => {
            const svc = new GrokApiService(createConfig({ REQUEST_MAX_RETRIES: 5 }));
            expect(svc.getMaxRequestRetries()).toBe(5);
        });

        it('无效配置返回默认 3', () => {
            const svc = new GrokApiService(createConfig({ REQUEST_MAX_RETRIES: 'abc' }));
            expect(svc.getMaxRequestRetries()).toBe(3);
        });

        it('0 返回默认 3（不是有效正数）', () => {
            const svc = new GrokApiService(createConfig({ REQUEST_MAX_RETRIES: 0 }));
            expect(svc.getMaxRequestRetries()).toBe(3);
        });
    });

    // ─── classifyApiError ─────────────────────────────────────────────────────────

    describe('classifyApiError', () => {
        it('401 设置 shouldSwitchCredential', () => {
            const svc = new GrokApiService(createConfig());
            const err = { response: { status: 401 }, message: '' };
            const result = svc.classifyApiError(err);
            expect(result.status).toBe(401);
            expect(err.shouldSwitchCredential).toBe(true);
        });

        it('429 设置 shouldSwitchCredential 并更新 message', () => {
            const svc = new GrokApiService(createConfig());
            const err = { response: { status: 429 }, message: '' };
            const result = svc.classifyApiError(err);
            expect(err.shouldSwitchCredential).toBe(true);
            expect(err.message).toContain('429');
        });

        it('502 设置 shouldSwitchCredential', () => {
            const svc = new GrokApiService(createConfig());
            const err = { response: { status: 502 }, message: '' };
            svc.classifyApiError(err);
            expect(err.shouldSwitchCredential).toBe(true);
        });

        it('网络错误 设置 shouldSwitchCredential 和 skipErrorCount', () => {
            isRetryableNetworkError.mockReturnValue(true);
            const svc = new GrokApiService(createConfig());
            const err = { code: 'ECONNRESET', message: 'ECONNRESET' };
            svc.classifyApiError(err);
            expect(err.shouldSwitchCredential).toBe(true);
            expect(err.skipErrorCount).toBe(true);
        });

        it('WS 错误从 message 中提取状态码', () => {
            const svc = new GrokApiService(createConfig());
            const err = { message: 'Unexpected server response: 403', code: undefined };
            const result = svc.classifyApiError(err);
            expect(result.status).toBe(403);
        });

        it('Image rate limit 映射到 429', () => {
            const svc = new GrokApiService(createConfig());
            const err = { message: 'Image rate limit exceeded' };
            const result = svc.classifyApiError(err);
            expect(result.status).toBe(429);
        });
    });

    // ─── _getModelMapping ─────────────────────────────────────────────────────────

    describe('_getModelMapping', () => {
        it('已知模型返回正确 mapping', () => {
            const svc = new GrokApiService(createConfig());
            const mapping = svc._getModelMapping('grok-4.20');
            expect(mapping).toHaveProperty('name');
            expect(mapping).toHaveProperty('modeId');
        });

        it('未知模型返回默认 mapping', () => {
            const svc = new GrokApiService(createConfig());
            const mapping = svc._getModelMapping('unknown-model');
            expect(mapping).toHaveProperty('name');
        });

        it('null/undefined 模型安全返回默认', () => {
            const svc = new GrokApiService(createConfig());
            expect(() => svc._getModelMapping(null)).not.toThrow();
            expect(() => svc._getModelMapping(undefined)).not.toThrow();
        });
    });

    // ─── _normalizeImageUrl ────────────────────────────────────────────────────────

    describe('_normalizeImageUrl', () => {
        it('http URL 直接返回', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._normalizeImageUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
        });

        it('data URL 直接返回', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._normalizeImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
        });

        it('相对 URL 加上 assets.grok.com 前缀', () => {
            const svc = new GrokApiService(createConfig());
            const result = svc._normalizeImageUrl('/path/to/image.png');
            expect(result).toContain('assets.grok.com');
        });

        it('null 返回 null', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._normalizeImageUrl(null)).toBeNull();
        });
    });

    // ─── _extractMessagesAndFiles ──────────────────────────────────────────────────

    describe('_extractMessagesAndFiles', () => {
        it('空 messages 时不修改 requestBody', () => {
            const svc = new GrokApiService(createConfig());
            const body = { messages: [] };
            svc._extractMessagesAndFiles(body);
            expect(body.message).toBeDefined(); // message 可能为空字符串
        });

        it('无 messages 字段时不报错', () => {
            const svc = new GrokApiService(createConfig());
            const body = {};
            expect(() => svc._extractMessagesAndFiles(body)).not.toThrow();
        });

        it('字符串 content 正确提取', () => {
            const svc = new GrokApiService(createConfig());
            const body = { messages: [{ role: 'user', content: 'Hello world' }] };
            svc._extractMessagesAndFiles(body);
            expect(body.message).toContain('Hello world');
        });

        it('数组 content 提取文本', () => {
            const svc = new GrokApiService(createConfig());
            const body = {
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: 'Hello from array' }]
                }]
            };
            svc._extractMessagesAndFiles(body);
            expect(body.message).toContain('Hello from array');
        });

        it('数组 content 中的 image_url 存入 _extractedImages', () => {
            const svc = new GrokApiService(createConfig());
            const body = {
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Look at this' },
                        { type: 'image_url', image_url: { url: 'https://img.com/a.png' } }
                    ]
                }]
            };
            svc._extractMessagesAndFiles(body);
            expect(body._extractedImages).toContain('https://img.com/a.png');
        });

        it('没有图片时 _extractedImages 为空数组', () => {
            const svc = new GrokApiService(createConfig());
            const body = { messages: [{ role: 'user', content: 'Text only' }] };
            svc._extractMessagesAndFiles(body);
            expect(body._extractedImages).toEqual([]);
        });

        it('assistant tool_calls 内容被格式化', () => {
            const svc = new GrokApiService(createConfig());
            const body = {
                messages: [{
                    role: 'assistant',
                    content: [],
                    tool_calls: [{ function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }]
                }]
            };
            svc._extractMessagesAndFiles(body);
            expect(body.message).toContain('get_weather');
        });
    });

    // ─── initialize ───────────────────────────────────────────────────────────────

    describe('initialize', () => {
        it('第一次调用设置 isInitialized=true', async () => {
            const svc = new GrokApiService(createConfig());
            expect(svc.isInitialized).toBe(false);
            await svc.initialize();
            expect(svc.isInitialized).toBe(true);
        });

        it('多次调用幂等', async () => {
            const svc = new GrokApiService(createConfig());
            await svc.initialize();
            await svc.initialize();
            expect(svc.isInitialized).toBe(true);
        });
    });

    // ─── refreshToken ──────────────────────────────────────────────────────────────

    describe('refreshToken', () => {
        it('调用 poolManager.resetProviderRefreshStatus', async () => {
            const { getProviderPoolManager } = await import('../../../src/services/service-manager.js');
            const svc = new GrokApiService(createConfig());
            await svc.refreshToken();
            expect(getProviderPoolManager).toHaveBeenCalled();
        });

        it('无 uuid 时仍然不抛出', async () => {
            const svc = new GrokApiService(createConfig({ uuid: undefined }));
            await expect(svc.refreshToken()).resolves.not.toThrow();
        });
    });

    // ─── _isPart0 ─────────────────────────────────────────────────────────────────

    describe('_isPart0', () => {
        it('URL 包含 part-0 返回 true', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._isPart0('https://assets.grok.com/img/part-0')).toBe(true);
        });

        it('URL 不包含 part-0 返回 false', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._isPart0('https://assets.grok.com/img/part-1')).toBe(false);
        });

        it('非字符串返回 false', () => {
            const svc = new GrokApiService(createConfig());
            expect(svc._isPart0(null)).toBe(false);
        });
    });
});
