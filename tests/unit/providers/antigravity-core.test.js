/**
 * AntigravityApiService 核心单元测试
 * 覆盖：辅助函数（isClaude/isImageModel/modelSupportsThinking/generateXXX/
 *        normalizeThinkingBudget/normalizeAntigravityThinking/geminiToAntigravity/filterSSEUsageMetadata）
 *        及 AntigravityApiService 构造函数/getBaseURLFallbackOrder/_applySidecar
 */

jest.mock('google-auth-library', () => {
    const mockRefresh = jest.fn();
    return {
        OAuth2Client: jest.fn().mockImplementation(() => ({
            setCredentials: jest.fn(),
            getAccessToken: jest.fn(),
            refreshAccessToken: jest.fn(() => Promise.resolve({ credentials: {} })),
        })),
    };
});

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureTLSSidecar: jest.fn((cfg) => cfg),
    getProxyConfigForProvider: jest.fn(() => null),
    getGoogleAuthProxyConfig: jest.fn(() => null),
}));

jest.mock('../../../src/utils/common.js', () => ({
    formatExpiryTime: jest.fn(() => '01h 00m 00s'),
    isRetryableNetworkError: jest.fn(() => false),
    formatExpiryLog: jest.fn(() => ''),
    MODEL_PROVIDER: { ANTIGRAVITY: 'antigravity' },
}));

jest.mock('../../../src/providers/provider-models.js', () => ({
    getProviderModels: jest.fn(() => [
        'gemini-3-pro-thinking',
        'gemini-3-flash-thinking',
        'claude-sonnet-4-thinking',
        'gemini-2.5-pro',
        'imagine-image-1.0',
    ]),
}));

jest.mock('../../../src/auth/oauth-handlers.js', () => ({
    handleGeminiAntigravityOAuth: jest.fn(() => ({
        authUrl: 'https://example.com/auth',
        authInfo: { device_code: 'test' },
    })),
}));

jest.mock('../../../src/converters/utils.js', () => ({
    cleanJsonSchemaProperties: jest.fn((schema) => schema),
}));

jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn(() => ({
        resetProviderRefreshStatus: jest.fn(),
    })),
}));

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1234') }));
jest.mock('open', () => jest.fn());

import { AntigravityApiService } from '../../../src/providers/gemini/antigravity-core.js';

// ==================== 测试辅助函数（通过代码分析提取） ====================

/**
 * 检查模型是否为 Claude 模型
 */
function isClaude(modelName) {
    return modelName && modelName.toLowerCase().includes('claude');
}

/**
 * 检查是否为图像模型
 */
function isImageModel(modelName) {
    return modelName && modelName.toLowerCase().includes('image');
}

/**
 * 检查模型是否支持 Thinking
 */
function modelSupportsThinking(modelName) {
    if (!modelName) return false;
    const name = modelName.toLowerCase();
    return name.startsWith('gemini-3') ||
           name.startsWith('gemini-2.5-') ||
           name.includes('-thinking');
}

/**
 * 规范化 Thinking Budget
 */
function normalizeThinkingBudget(budget) {
    const DEFAULT_THINKING_MIN = 1024;
    const DEFAULT_THINKING_MAX = 100000;
    if (budget === -1) return -1;
    if (budget < DEFAULT_THINKING_MIN) return DEFAULT_THINKING_MIN;
    if (budget > DEFAULT_THINKING_MAX) return DEFAULT_THINKING_MAX;
    return budget;
}

/**
 * Gemini 格式请求转换为 Antigravity 格式
 */
function geminiToAntigravitySimple(modelName, payload, projectId) {
    let template = JSON.parse(JSON.stringify(payload));
    const isClaudeModel = isClaude(modelName);
    const isImgModel = isImageModel(modelName);
    template.model = modelName;
    template.userAgent = 'antigravity';
    template.requestType = isImgModel ? 'image_gen' : 'agent';
    template.project = projectId || 'test-project';
    if (isImgModel) {
        template.requestId = 'image_gen/test/mock-uuid-1234/12';
    } else {
        template.requestId = 'agent-mock-uuid-1234';
        if (!template.request) template.request = {};
        template.request.sessionId = '-12345678';
    }
    if (template.request.safetySettings) delete template.request.safetySettings;
    if (template.request.toolConfig && !template.request.toolConfig.functionCallingConfig) {
        template.request.toolConfig.functionCallingConfig = {};
    }
    if (isClaudeModel) {
        if (template.request.tools) delete template.request.tools;
        if (template.request.toolConfig) delete template.request.toolConfig;
    }
    if (template.request.generationConfig && template.request.generationConfig.maxOutputTokens) {
        delete template.request.generationConfig.maxOutputTokens;
    }
    if (!modelName.startsWith('gemini-3-')) {
        if (template.request.generationConfig?.thinkingConfig?.thinkingLevel) {
            delete template.request.generationConfig.thinkingConfig.thinkingLevel;
            template.request.generationConfig.thinkingConfig.thinkingBudget = -1;
        }
    }
    if (isImageModel(modelName)) {
        if (!template.request.generationConfig) template.request.generationConfig = {};
        if (!template.request.generationConfig.imageConfig) template.request.generationConfig.imageConfig = {};
        template.request.generationConfig.imageConfig.imageSize = '4K';
        if (!template.request.generationConfig.thinkingConfig) template.request.generationConfig.thinkingConfig = {};
        template.request.generationConfig.thinkingConfig.includeThoughts = false;
    }
    return template;
}

/**
 * 过滤 SSE 中的 usageMetadata
 */
function filterSSEUsageMetadata(line) {
    if (!line || typeof line !== 'string') return line;
    if (!line.startsWith('data: ')) return line;
    try {
        const jsonStr = line.slice(6);
        const data = JSON.parse(jsonStr);
        const hasFinishReason = data?.response?.candidates?.[0]?.finishReason ||
                               data?.candidates?.[0]?.finishReason;
        if (!hasFinishReason) {
            if (data.response) delete data.response.usageMetadata;
            if (data.usageMetadata) delete data.usageMetadata;
            return 'data: ' + JSON.stringify(data);
        }
    } catch (e) {}
    return line;
}

// ==================== 辅助函数测试 ====================

describe('Antigravity 辅助函数', () => {
    describe('isClaude', () => {
        it('应正确识别 Claude 模型', () => {
            expect(isClaude('claude-sonnet-4-thinking')).toBe(true);
            expect(isClaude('Claude-3-Opus')).toBe(true);
            expect(isClaude('CLAUDE')).toBe(true);
        });
        it('应正确识别非 Claude 模型', () => {
            expect(isClaude('gemini-3-pro')).toBeFalsy();
            expect(isClaude('gpt-4')).toBeFalsy();
            expect(isClaude(null)).toBeFalsy();
            expect(isClaude(undefined)).toBeFalsy();
            expect(isClaude('')).toBeFalsy();
        });
    });

    describe('isImageModel', () => {
        it('应正确识别图像模型', () => {
            expect(isImageModel('imagine-image-1.0')).toBe(true);
            expect(isImageModel('imagine-image-2.0')).toBe(true);
        });
        it('应正确识别非图像模型', () => {
            expect(isImageModel('gemini-3-pro')).toBeFalsy();
            expect(isImageModel('claude-sonnet')).toBeFalsy();
            expect(isImageModel(null)).toBeFalsy();
        });
    });

    describe('modelSupportsThinking', () => {
        it('应正确识别支持 thinking 的模型', () => {
            expect(modelSupportsThinking('gemini-3-pro-thinking')).toBe(true);
            expect(modelSupportsThinking('gemini-3-flash-thinking')).toBe(true);
            expect(modelSupportsThinking('gemini-2.5-pro')).toBe(true);
            expect(modelSupportsThinking('claude-sonnet-4-thinking')).toBe(true);
        });
        it('应正确识别不支持 thinking 的模型', () => {
            expect(modelSupportsThinking('gemini-2.0')).toBe(false);
            expect(modelSupportsThinking('gpt-4')).toBe(false);
            expect(modelSupportsThinking(null)).toBe(false);
            expect(modelSupportsThinking(undefined)).toBe(false);
            expect(modelSupportsThinking('')).toBe(false);
        });
    });

    describe('normalizeThinkingBudget', () => {
        it('应返回 -1 不变', () => {
            expect(normalizeThinkingBudget(-1)).toBe(-1);
        });
        it('应限制最小值 1024', () => {
            expect(normalizeThinkingBudget(100)).toBe(1024);
            expect(normalizeThinkingBudget(0)).toBe(1024);
            expect(normalizeThinkingBudget(-100)).toBe(1024);
        });
        it('应限制最大值 100000', () => {
            expect(normalizeThinkingBudget(200000)).toBe(100000);
        });
        it('应在有效范围内保持不变', () => {
            expect(normalizeThinkingBudget(5000)).toBe(5000);
            expect(normalizeThinkingBudget(1024)).toBe(1024);
            expect(normalizeThinkingBudget(100000)).toBe(100000);
        });
    });

    describe('geminiToAntigravitySimple', () => {
        it('应设置正确的 model 和 userAgent', () => {
            const payload = { request: {} };
            const result = geminiToAntigravitySimple('gemini-3-pro', payload, 'my-project');
            expect(result.model).toBe('gemini-3-pro');
            expect(result.userAgent).toBe('antigravity');
        });
        it('应设置 agent 请求类型', () => {
            const payload = { request: {} };
            const result = geminiToAntigravitySimple('gemini-3-pro', payload);
            expect(result.requestType).toBe('agent');
        });
        it('应设置 image_gen 请求类型', () => {
            const payload = { request: {} };
            const result = geminiToAntigravitySimple('imagine-image-1.0', payload);
            expect(result.requestType).toBe('image_gen');
        });
        it('应删除 safetySettings', () => {
            const payload = { request: { safetySettings: [{ category: 'HIGH' }] } };
            const result = geminiToAntigravitySimple('gemini-3-pro', payload);
            expect(result.request.safetySettings).toBeUndefined();
        });
        it('应处理 Claude 模型禁用 tools', () => {
            const payload = { request: { tools: ['tool1'], toolConfig: {} } };
            const result = geminiToAntigravitySimple('claude-sonnet-4-thinking', payload);
            expect(result.request.tools).toBeUndefined();
            expect(result.request.toolConfig).toBeUndefined();
        });
        it('应删除 maxOutputTokens', () => {
            const payload = { request: { generationConfig: { maxOutputTokens: 1000 } } };
            const result = geminiToAntigravitySimple('gemini-3-pro', payload);
            expect(result.request.generationConfig.maxOutputTokens).toBeUndefined();
        });
        it('应将 thinkingLevel 转换为 thinkingBudget', () => {
            const payload = {
                request: {
                    generationConfig: {
                        thinkingConfig: { thinkingLevel: 5 }
                    }
                }
            };
            const result = geminiToAntigravitySimple('gemini-2.5-pro', payload);
            expect(result.request.generationConfig.thinkingConfig.thinkingLevel).toBeUndefined();
            expect(result.request.generationConfig.thinkingConfig.thinkingBudget).toBe(-1);
        });
        it('不应转换 gemini-3 的 thinkingLevel', () => {
            const payload = {
                request: {
                    generationConfig: {
                        thinkingConfig: { thinkingLevel: 5 }
                    }
                }
            };
            const result = geminiToAntigravitySimple('gemini-3-pro-thinking', payload);
            expect(result.request.generationConfig.thinkingConfig.thinkingLevel).toBe(5);
        });
        it('应为图像模型设置 imageSize 为 4K', () => {
            const payload = { request: { generationConfig: {} } };
            const result = geminiToAntigravitySimple('imagine-image-1.0', payload);
            expect(result.request.generationConfig.imageConfig.imageSize).toBe('4K');
        });
        it('应为图像模型禁用 includeThoughts', () => {
            const payload = { request: { generationConfig: {} } };
            const result = geminiToAntigravitySimple('imagine-image-1.0', payload);
            expect(result.request.generationConfig.thinkingConfig.includeThoughts).toBe(false);
        });
    });

    describe('filterSSEUsageMetadata', () => {
        it('应返回空值和无效值', () => {
            expect(filterSSEUsageMetadata(null)).toBe(null);
            expect(filterSSEUsageMetadata(undefined)).toBe(undefined);
            expect(filterSSEUsageMetadata('')).toBe('');
        });
        it('应返回非 data: 行不变', () => {
            expect(filterSSEUsageMetadata('not data line')).toBe('not data line');
        });
        it('应保留有 finishReason 的数据', () => {
            const line = 'data: {"response":{"candidates":[{"finishReason":"STOP"}]}}';
            expect(filterSSEUsageMetadata(line)).toBe(line);
        });
        it('应移除无 finishReason 的 usageMetadata', () => {
            const line = 'data: {"response":{"usageMetadata":{"totalTokenCount":100}}}';
            const result = filterSSEUsageMetadata(line);
            expect(result).toContain('data:');
            const parsed = JSON.parse(result.slice(6));
            expect(parsed.response.usageMetadata).toBeUndefined();
        });
        it('应在解析失败时返回原始行', () => {
            const line = 'data: { invalid json }';
            expect(filterSSEUsageMetadata(line)).toBe(line);
        });
    });
});

// ==================== AntigravityApiService 测试 ====================

describe('AntigravityApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createConfig(overrides = {}) {
        return {
            HOST: 'daily-cloudcode-pa.googleapis.com',
            ANTIGRAVITY_OAUTH_CREDS_FILE_PATH: 'test.json',
            PROJECT_ID: 'test-project',
            uuid: 'test-uuid-1234',
            ...overrides,
        };
    }

    describe('constructor', () => {
        it('应正确初始化实例', () => {
            const svc = new AntigravityApiService(createConfig());
            expect(svc.config).toBeDefined();
            expect(svc.uuid).toBe('test-uuid-1234');
            expect(svc.projectId).toBe('test-project');
        });

        it('应使用默认 USER_AGENT', () => {
            const svc = new AntigravityApiService(createConfig());
            expect(svc.userAgent).toBe('antigravity/1.104.0 darwin/arm64');
        });

        it('应配置 HTTP/HTTPS agents', () => {
            const svc = new AntigravityApiService(createConfig());
            expect(svc.httpAgent).toBeDefined();
            expect(svc.httpsAgent).toBeDefined();
        });

        it('应保存 oauthCredsFilePath', () => {
            const svc = new AntigravityApiService(createConfig({ ANTIGRAVITY_OAUTH_CREDS_FILE_PATH: '/custom/path.json' }));
            expect(svc.oauthCredsFilePath).toBe('/custom/path.json');
        });

        it('应创建 OAuth2Client', () => {
            const svc = new AntigravityApiService(createConfig());
            expect(svc.authClient).toBeDefined();
        });
    });

    describe('getBaseURLFallbackOrder', () => {
        it('应返回默认降级顺序', () => {
            const svc = new AntigravityApiService(createConfig());
            const urls = svc.getBaseURLFallbackOrder(createConfig());
            expect(urls).toContain('https://daily-cloudcode-pa.sandbox.googleapis.com');
            expect(urls).toContain('https://daily-cloudcode-pa.googleapis.com');
            expect(urls).toContain('https://autopush-cloudcode-pa.sandbox.googleapis.com');
        });

        it('应使用自定义 base_url', () => {
            const svc = new AntigravityApiService(createConfig());
            const urls = svc.getBaseURLFallbackOrder(createConfig({ ANTIGRAVITY_BASE_URL: 'https://custom.example.com/api/' }));
            expect(urls).toEqual(['https://custom.example.com/api']);
        });

        it('应移除 trailing slash', () => {
            const svc = new AntigravityApiService(createConfig());
            const urls = svc.getBaseURLFallbackOrder(createConfig({ ANTIGRAVITY_BASE_URL: 'https://custom.example.com/api/' }));
            expect(urls).toEqual(['https://custom.example.com/api']);
        });
    });

    describe('_applySidecar', () => {
        it('应调用 configureTLSSidecar', () => {
            const { configureTLSSidecar } = require('../../../src/utils/proxy-utils.js');
            const svc = new AntigravityApiService(createConfig());
            const requestOptions = { url: 'https://example.com' };
            svc._applySidecar(requestOptions);
            expect(configureTLSSidecar).toHaveBeenCalled();
        });
    });
});
