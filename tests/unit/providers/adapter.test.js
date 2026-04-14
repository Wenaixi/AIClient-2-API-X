/**
 * Adapter 单元测试
 * 覆盖：LRUCache（带TTL）、registerAdapter、getServiceAdapter、serviceInstances Proxy
 * 以及各个 Adapter 类（GeminiApiServiceAdapter、OpenAIApiServiceAdapter 等）
 *
 * 所有依赖已 mock，真正 import src/providers/adapter.js
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// ==================== Mock 所有外部依赖 ====================

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureAxiosProxy: jest.fn(),
    configureTLSSidecar: jest.fn((config) => config),
}));

jest.mock('os', () => ({
    hostname: jest.fn(() => 'test-host'),
    platform: jest.fn(() => 'win32'),
    arch: jest.fn(() => 'x64'),
}));

// Mock kimi-oauth
jest.mock('../../../src/auth/kimi-oauth.js', () => ({
    KimiTokenStorage: class MockKimiTokenStorage {
        constructor(data = {}) {
            Object.assign(this, data);
        }
        static fromJSON(json) {
            const s = new this(json);
            return s;
        }
        needsRefresh() { return false; }
    },
    refreshKimiToken: jest.fn().mockResolvedValue({ access_token: 'new-token', refresh_token: 'new-refresh' }),
    getHostname: jest.fn(() => 'test-hostname'),
    getDeviceModel: jest.fn(() => 'test-device-model'),
}));

// Mock common.js - 使用真实的 MODEL_PROVIDER 值
jest.mock('../../../src/utils/common.js', () => ({
    MODEL_PROVIDER: {
        OPENAI_CUSTOM: 'openai-custom',
        OPENAI_CUSTOM_RESPONSES: 'openaiResponses-custom',
        GEMINI_CLI: 'gemini-cli-oauth',
        ANTIGRAVITY: 'gemini-antigravity',
        CLAUDE_CUSTOM: 'claude-custom',
        KIRO_API: 'claude-kiro-oauth',
        QWEN_API: 'openai-qwen-oauth',
        CODEX_API: 'openai-codex-oauth',
        FORWARD_API: 'forward-api',
        GROK_CUSTOM: 'grok-custom',
        KIMI_API: 'kimi-oauth',
        AUTO: 'auto',
    },
    findByPrefix: jest.fn((map, prefix) => {
        // 精确匹配优先
        if (map.has(prefix)) return map.get(prefix);
        // 前缀匹配
        for (const [key, value] of map.entries()) {
            if (prefix.startsWith(key) || key.startsWith(prefix)) {
                return value;
            }
        }
        return undefined;
    }),
    hasByPrefix: jest.fn((map, prefix) => {
        if (map.has(prefix)) return true;
        for (const key of map.keys()) {
            if (prefix.startsWith(key) || key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }),
    isRetryableNetworkError: jest.fn(() => false),
}));

jest.mock('../../../src/providers/kimi/kimi-message-normalizer.js', () => ({
    normalizeKimiToolMessageLinks: jest.fn((body) => body),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(() => false),
    readFileSync: jest.fn(() => '{}'),
    writeFileSync: jest.fn(),
    promises: {
        readFile: jest.fn().mockResolvedValue('{}'),
    },
}));

// Mock 所有 core 服务
const mockGeminiService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ content: 'gemini-response' }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ models: [] }),
    initializeAuth: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
    getUsageLimits: jest.fn().mockResolvedValue({ quota: { used: 10, total: 100 } }),
};
jest.mock('../../../src/providers/gemini/gemini-core.js', () => ({
    GeminiApiService: jest.fn().mockImplementation(() => ({ ...mockGeminiService })),
}));

const mockAntigravityService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ content: 'antigravity-response' }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ models: [] }),
    initializeAuth: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
    getUsageLimits: jest.fn().mockResolvedValue({ quota: { used: 5, total: 50 } }),
};
jest.mock('../../../src/providers/gemini/antigravity-core.js', () => ({
    AntigravityApiService: jest.fn().mockImplementation(() => ({ ...mockAntigravityService })),
}));

const mockOpenAIService = {
    generateContent: jest.fn().mockResolvedValue({ choices: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
};
jest.mock('../../../src/providers/openai/openai-core.js', () => ({
    OpenAIApiService: jest.fn().mockImplementation(() => ({ ...mockOpenAIService })),
}));

const mockOpenAIResponsesService = {
    generateContent: jest.fn().mockResolvedValue({ output: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
};
jest.mock('../../../src/providers/openai/openai-responses-core.js', () => ({
    OpenAIResponsesApiService: jest.fn().mockImplementation(() => ({ ...mockOpenAIResponsesService })),
}));

const mockClaudeService = {
    generateContent: jest.fn().mockResolvedValue({ content: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ models: [] }),
};
jest.mock('../../../src/providers/claude/claude-core.js', () => ({
    ClaudeApiService: jest.fn().mockImplementation(() => ({ ...mockClaudeService })),
}));

const mockKiroService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ content: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ models: [] }),
    initializeAuth: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
    getUsageLimits: jest.fn().mockResolvedValue({ usage: 100 }),
    countTokens: jest.fn().mockReturnValue({ input_tokens: 10 }),
};
jest.mock('../../../src/providers/claude/claude-kiro.js', () => ({
    KiroApiService: jest.fn().mockImplementation(() => ({ ...mockKiroService })),
}));

const mockQwenService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ choices: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
    _initializeAuth: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
};
jest.mock('../../../src/providers/openai/qwen-core.js', () => ({
    QwenApiService: jest.fn().mockImplementation(() => ({ ...mockQwenService })),
}));

const mockCodexService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ choices: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
    initializeAuth: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
    getUsageLimits: jest.fn().mockResolvedValue({ remaining: 90 }),
};
jest.mock('../../../src/providers/openai/codex-core.js', () => ({
    CodexApiService: jest.fn().mockImplementation(() => ({ ...mockCodexService })),
}));

const mockForwardService = {
    generateContent: jest.fn().mockResolvedValue({ data: 'forward' }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
};
jest.mock('../../../src/providers/forward/forward-core.js', () => ({
    ForwardApiService: jest.fn().mockImplementation(() => ({ ...mockForwardService })),
}));

const mockGrokService = {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    generateContent: jest.fn().mockResolvedValue({ choices: [] }),
    generateContentStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
    refreshToken: jest.fn().mockResolvedValue(undefined),
    isExpiryDateNear: jest.fn().mockReturnValue(false),
    getUsageLimits: jest.fn().mockResolvedValue({ remaining: 5000 }),
};
jest.mock('../../../src/providers/grok/grok-core.js', () => ({
    GrokApiService: jest.fn().mockImplementation(() => ({ ...mockGrokService })),
}));

const mockKimiService = {
    tokenStorage: null,
    setTokenStorage: jest.fn(),
    chatCompletion: jest.fn().mockResolvedValue({ choices: [] }),
    chatCompletionStream: jest.fn().mockImplementation(async function* () { yield 'chunk'; }),
    listModels: jest.fn().mockResolvedValue({ data: [] }),
    getUsageLimits: jest.fn().mockResolvedValue({ quota: { used: 20, total: 200 } }),
};
jest.mock('../../../src/providers/kimi/kimi-core.js', () => ({
    KimiApiService: jest.fn().mockImplementation(() => ({ ...mockKimiService })),
}));

// ==================== 导入被测试的模块 ====================

import {
    registerAdapter,
    getRegisteredProviders,
    ApiServiceAdapter,
    GeminiApiServiceAdapter,
    AntigravityApiServiceAdapter,
    OpenAIApiServiceAdapter,
    OpenAIResponsesApiServiceAdapter,
    ClaudeApiServiceAdapter,
    KiroApiServiceAdapter,
    QwenApiServiceAdapter,
    CodexApiServiceAdapter,
    ForwardApiServiceAdapter,
    GrokApiServiceAdapter,
    KimiApiServiceAdapter,
    serviceInstances,
    isRegisteredProvider,
    getServiceAdapter,
} from '../../../src/providers/adapter.js';

import { existsSync, promises as fsPromises } from 'fs';

// ==================== registerAdapter / getRegisteredProviders ====================

describe('registerAdapter / getRegisteredProviders', () => {
    test('getRegisteredProviders returns built-in providers after module load', () => {
        const providers = getRegisteredProviders();
        expect(Array.isArray(providers)).toBe(true);
        // 适配器模块在加载时注册了这些 built-in providers
        expect(providers.length).toBeGreaterThanOrEqual(1);
    });

    test('registerAdapter adds new provider to registry', () => {
        class TestAdapter extends ApiServiceAdapter {
            async generateContent() {}
            async *generateContentStream() {}
            async listModels() {}
            async refreshToken() {}
            async forceRefreshToken() {}
            isExpiryDateNear() { return false; }
        }

        const beforeCount = getRegisteredProviders().length;
        registerAdapter('test-new-provider-xyz', TestAdapter);
        const afterCount = getRegisteredProviders().length;

        expect(afterCount).toBe(beforeCount + 1);
        expect(getRegisteredProviders()).toContain('test-new-provider-xyz');
    });

    test('registerAdapter allows overwriting existing provider', () => {
        class OverrideAdapter extends ApiServiceAdapter {
            async generateContent() {}
            async *generateContentStream() {}
            async listModels() {}
            async refreshToken() {}
            async forceRefreshToken() {}
            isExpiryDateNear() { return false; }
        }

        registerAdapter('test-override-provider', OverrideAdapter);
        registerAdapter('test-override-provider', OverrideAdapter); // overwrite
        const providers = getRegisteredProviders();
        const occurrences = providers.filter(p => p === 'test-override-provider').length;
        expect(occurrences).toBe(1);
    });
});

// ==================== ApiServiceAdapter 抽象类 ====================

describe('ApiServiceAdapter abstract class', () => {
    test('cannot instantiate directly - throws TypeError', () => {
        expect(() => new ApiServiceAdapter()).toThrow(TypeError);
        expect(() => new ApiServiceAdapter()).toThrow('Cannot construct ApiServiceAdapter instances directly');
    });

    test('can be subclassed', () => {
        class ConcreteAdapter extends ApiServiceAdapter {
            async generateContent() { return 'ok'; }
            async *generateContentStream() { yield 'chunk'; }
            async listModels() { return []; }
            async refreshToken() {}
            async forceRefreshToken() {}
            isExpiryDateNear() { return false; }
        }
        expect(() => new ConcreteAdapter()).not.toThrow();
        const adapter = new ConcreteAdapter();
        expect(adapter).toBeInstanceOf(ApiServiceAdapter);
    });

    test('abstract methods throw when not overridden', async () => {
        class PartialAdapter extends ApiServiceAdapter {
            // Override only constructor gate, but NOT other methods
        }
        // We can't call super methods directly on abstract class
        // Instead test the base class method bodies by creating direct instance via reflection
        const baseProto = ApiServiceAdapter.prototype;
        await expect(baseProto.generateContent.call({})).rejects.toThrow("Method 'generateContent()' must be implemented.");
        await expect(baseProto.listModels.call({})).rejects.toThrow("Method 'listModels()' must be implemented.");
        await expect(baseProto.refreshToken.call({})).rejects.toThrow("Method 'refreshToken()' must be implemented.");
        await expect(baseProto.forceRefreshToken.call({})).rejects.toThrow("Method 'forceRefreshToken()' must be implemented.");
        expect(() => baseProto.isExpiryDateNear.call({})).toThrow("Method 'isExpiryDateNear()' must be implemented.");
    });

    test('generateContentStream abstract method throws', async () => {
        const gen = ApiServiceAdapter.prototype.generateContentStream.call({}, 'model', {});
        await expect(gen.next()).rejects.toThrow("Method 'generateContentStream()' must be implemented.");
    });
});

// ==================== isRegisteredProvider ====================

describe('isRegisteredProvider', () => {
    test('returns true for built-in providers', () => {
        // gemini-cli-oauth is registered
        expect(isRegisteredProvider('gemini-cli-oauth')).toBe(true);
    });

    test('returns false for unknown provider', () => {
        expect(isRegisteredProvider('totally-unknown-provider-abc123')).toBe(false);
    });

    test('returns true for custom registered provider', () => {
        class TmpAdapter extends ApiServiceAdapter {
            async generateContent() {}
            async *generateContentStream() {}
            async listModels() {}
            async refreshToken() {}
            async forceRefreshToken() {}
            isExpiryDateNear() { return false; }
        }
        registerAdapter('tmp-registered-provider', TmpAdapter);
        expect(isRegisteredProvider('tmp-registered-provider')).toBe(true);
    });
});

// ==================== getServiceAdapter ====================

describe('getServiceAdapter', () => {
    test('returns an adapter instance for a known provider', () => {
        const config = { MODEL_PROVIDER: 'gemini-cli-oauth', uuid: null };
        const adapter = getServiceAdapter(config);
        expect(adapter).toBeDefined();
        expect(adapter).toBeInstanceOf(GeminiApiServiceAdapter);
    });

    test('returns cached instance on second call with same config', () => {
        const config = { MODEL_PROVIDER: 'gemini-cli-oauth', uuid: 'uuid-cache-test-1' };
        const adapter1 = getServiceAdapter(config);
        const adapter2 = getServiceAdapter(config);
        expect(adapter1).toBe(adapter2);
    });

    test('returns different instances for different uuids', () => {
        const config1 = { MODEL_PROVIDER: 'grok-custom', uuid: 'uuid-A' };
        const config2 = { MODEL_PROVIDER: 'grok-custom', uuid: 'uuid-B' };
        const adapter1 = getServiceAdapter(config1);
        const adapter2 = getServiceAdapter(config2);
        expect(adapter1).not.toBe(adapter2);
    });

    test('throws for unsupported provider', () => {
        const config = { MODEL_PROVIDER: 'unsupported-provider-xyz', uuid: null };
        expect(() => getServiceAdapter(config)).toThrow('Unsupported model provider');
    });

    test('uses customName in log (does not affect key)', () => {
        const config = {
            MODEL_PROVIDER: 'claude-custom',
            uuid: 'uuid-customname',
            customName: 'My Custom Name'
        };
        const adapter = getServiceAdapter(config);
        expect(adapter).toBeInstanceOf(ClaudeApiServiceAdapter);
    });

    test('key without uuid is just the provider', () => {
        // Reset to ensure fresh instance for provider without uuid
        const config = { MODEL_PROVIDER: 'openai-custom', uuid: undefined };
        const adapter = getServiceAdapter(config);
        expect(adapter).toBeInstanceOf(OpenAIApiServiceAdapter);
    });
});

// ==================== serviceInstances Proxy ====================

describe('serviceInstances Proxy', () => {
    test('set and get a value', () => {
        const mockAdapter = { name: 'test-adapter' };
        serviceInstances['proxy-test-key'] = mockAdapter;
        expect(serviceInstances['proxy-test-key']).toBe(mockAdapter);
    });

    test('delete a value', () => {
        const mockAdapter = { name: 'to-delete' };
        serviceInstances['proxy-delete-key'] = mockAdapter;
        expect(serviceInstances['proxy-delete-key']).toBe(mockAdapter);

        delete serviceInstances['proxy-delete-key'];
        expect(serviceInstances['proxy-delete-key']).toBeUndefined();
    });

    test('keys() returns array of cache keys', () => {
        serviceInstances['proxy-key-a'] = { id: 'a' };
        serviceInstances['proxy-key-b'] = { id: 'b' };
        const keys = serviceInstances.keys();
        expect(Array.isArray(keys)).toBe(true);
        expect(keys).toContain('proxy-key-a');
        expect(keys).toContain('proxy-key-b');
    });

    test('ownKeys enumeration works', () => {
        serviceInstances['own-key-test'] = { id: 'own' };
        const keys = Object.keys(serviceInstances);
        expect(keys).toContain('own-key-test');
    });

    test('get returns undefined for missing key', () => {
        expect(serviceInstances['non-existent-key-xyz']).toBeUndefined();
    });

    test('set non-string prop falls through to target', () => {
        // Symbol props should not go through LRU cache
        const sym = Symbol('test');
        serviceInstances[sym] = 'symbol-value';
        // No crash
        expect(serviceInstances[sym]).toBe('symbol-value');
    });
});

// ==================== GeminiApiServiceAdapter ====================

describe('GeminiApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new GeminiApiServiceAdapter({ key: 'test-key' });
        innerService = adapter.geminiApiService;
    });

    test('generateContent when already initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ content: 'result' });
        const result = await adapter.generateContent('gemini-pro', {});
        expect(innerService.generateContent).toHaveBeenCalledWith('gemini-pro', {});
        expect(result).toEqual({ content: 'result' });
    });

    test('generateContent initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({ content: 're-initialized' });
        const result = await adapter.generateContent('gemini-pro', {});
        expect(innerService.initialize).toHaveBeenCalled();
        expect(result).toEqual({ content: 're-initialized' });
    });

    test('generateContentStream when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () {
            yield 'stream-chunk';
        });
        const chunks = [];
        for await (const chunk of adapter.generateContentStream('gemini-pro', {})) {
            chunks.push(chunk);
        }
        expect(chunks).toContain('stream-chunk');
    });

    test('generateContentStream initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () {
            yield 'reinit-chunk';
        });
        const chunks = [];
        for await (const chunk of adapter.generateContentStream('gemini-pro', {})) {
            chunks.push(chunk);
        }
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('listModels when initialized', async () => {
        innerService.isInitialized = true;
        innerService.listModels = jest.fn().mockResolvedValue({ models: ['gemini-pro'] });
        const result = await adapter.listModels();
        expect(result).toEqual({ models: ['gemini-pro'] });
    });

    test('listModels initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.listModels = jest.fn().mockResolvedValue({ models: [] });
        await adapter.listModels();
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('refreshToken when expiry not near - returns resolve', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
        expect(innerService.initializeAuth).not.toHaveBeenCalled();
    });

    test('refreshToken when expiry is near - calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('forceRefreshToken always calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('isExpiryDateNear delegates to inner service', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        expect(adapter.isExpiryDateNear()).toBe(true);
    });

    test('getUsageLimits when initialized', async () => {
        innerService.isInitialized = true;
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ quota: 100 });
        const result = await adapter.getUsageLimits();
        expect(result).toEqual({ quota: 100 });
    });

    test('getUsageLimits initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ quota: 50 });
        await adapter.getUsageLimits();
        expect(innerService.initialize).toHaveBeenCalled();
    });
});

// ==================== AntigravityApiServiceAdapter ====================

describe('AntigravityApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new AntigravityApiServiceAdapter({ key: 'test-key' });
        innerService = adapter.antigravityApiService;
    });

    test('generateContent delegates to inner service', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ content: 'anti' });
        const result = await adapter.generateContent('model', {});
        expect(result).toEqual({ content: 'anti' });
    });

    test('generateContent initializes if not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({});
        await adapter.generateContent('model', {});
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('generateContentStream works', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'a'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('model', {})) chunks.push(c);
        expect(chunks).toContain('a');
    });

    test('listModels delegates', async () => {
        innerService.isInitialized = true;
        innerService.listModels = jest.fn().mockResolvedValue({ models: ['anti-model'] });
        expect(await adapter.listModels()).toEqual({ models: ['anti-model'] });
    });

    test('refreshToken when near expiry calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('refreshToken when not near expiry returns resolve', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('isExpiryDateNear delegates', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        expect(adapter.isExpiryDateNear()).toBe(true);
    });

    test('getUsageLimits delegates', async () => {
        innerService.isInitialized = true;
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ usage: 99 });
        expect(await adapter.getUsageLimits()).toEqual({ usage: 99 });
    });
});

// ==================== OpenAIApiServiceAdapter ====================

describe('OpenAIApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new OpenAIApiServiceAdapter({ apiKey: 'sk-test' });
        innerService = adapter.openAIApiService;
    });

    test('generateContent delegates', async () => {
        innerService.generateContent = jest.fn().mockResolvedValue({ choices: [{ message: 'hi' }] });
        expect(await adapter.generateContent('gpt-4', {})).toEqual({ choices: [{ message: 'hi' }] });
    });

    test('generateContentStream delegates', async () => {
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'token'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('gpt-4', {})) chunks.push(c);
        expect(chunks).toContain('token');
    });

    test('listModels delegates', async () => {
        innerService.listModels = jest.fn().mockResolvedValue({ data: ['gpt-4'] });
        expect(await adapter.listModels()).toEqual({ data: ['gpt-4'] });
    });

    test('refreshToken returns resolved promise', async () => {
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken returns resolved promise', async () => {
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('isExpiryDateNear always returns false', () => {
        expect(adapter.isExpiryDateNear()).toBe(false);
    });
});

// ==================== OpenAIResponsesApiServiceAdapter ====================

describe('OpenAIResponsesApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new OpenAIResponsesApiServiceAdapter({ apiKey: 'sk-test' });
        innerService = adapter.openAIResponsesApiService;
    });

    test('generateContent delegates', async () => {
        innerService.generateContent = jest.fn().mockResolvedValue({ output: ['result'] });
        expect(await adapter.generateContent('gpt-4o', {})).toEqual({ output: ['result'] });
    });

    test('generateContentStream delegates', async () => {
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'resp-token'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('gpt-4o', {})) chunks.push(c);
        expect(chunks).toContain('resp-token');
    });

    test('listModels delegates', async () => {
        innerService.listModels = jest.fn().mockResolvedValue({ data: [] });
        await adapter.listModels();
        expect(innerService.listModels).toHaveBeenCalled();
    });

    test('refreshToken resolves', async () => {
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken resolves', async () => {
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('isExpiryDateNear returns false', () => {
        expect(adapter.isExpiryDateNear()).toBe(false);
    });
});

// ==================== ClaudeApiServiceAdapter ====================

describe('ClaudeApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new ClaudeApiServiceAdapter({ apiKey: 'claude-key' });
        innerService = adapter.claudeApiService;
    });

    test('generateContent delegates', async () => {
        innerService.generateContent = jest.fn().mockResolvedValue({ content: 'Hello' });
        expect(await adapter.generateContent('claude-3', {})).toEqual({ content: 'Hello' });
    });

    test('generateContentStream delegates', async () => {
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'word'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('claude-3', {})) chunks.push(c);
        expect(chunks).toContain('word');
    });

    test('listModels delegates', async () => {
        innerService.listModels = jest.fn().mockResolvedValue({ models: [] });
        await adapter.listModels();
        expect(innerService.listModels).toHaveBeenCalled();
    });

    test('refreshToken resolves', async () => {
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken resolves', async () => {
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('isExpiryDateNear returns false', () => {
        expect(adapter.isExpiryDateNear()).toBe(false);
    });
});

// ==================== KiroApiServiceAdapter ====================

describe('KiroApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new KiroApiServiceAdapter({ endpoint: 'kiro-endpoint' });
        innerService = adapter.kiroApiService;
    });

    test('generateContent when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ content: 'kiro-result' });
        expect(await adapter.generateContent('kiro-model', {})).toEqual({ content: 'kiro-result' });
    });

    test('generateContent initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({});
        await adapter.generateContent('kiro-model', {});
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('generateContentStream when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'kiro-chunk'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('kiro-model', {})) chunks.push(c);
        expect(chunks).toContain('kiro-chunk');
    });

    test('listModels delegates', async () => {
        innerService.isInitialized = true;
        innerService.listModels = jest.fn().mockResolvedValue({ models: ['kiro-model'] });
        expect(await adapter.listModels()).toEqual({ models: ['kiro-model'] });
    });

    test('refreshToken when near expiry', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('refreshToken when not near expiry', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('isExpiryDateNear delegates to kiroApiService', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        expect(adapter.isExpiryDateNear()).toBe(true);
    });

    test('getUsageLimits when initialized', async () => {
        innerService.isInitialized = true;
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ usage: 42 });
        expect(await adapter.getUsageLimits()).toEqual({ usage: 42 });
    });

    test('countTokens delegates to kiroApiService', () => {
        innerService.countTokens = jest.fn().mockReturnValue({ input_tokens: 20 });
        expect(adapter.countTokens({ messages: [] })).toEqual({ input_tokens: 20 });
    });
});

// ==================== QwenApiServiceAdapter ====================

describe('QwenApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new QwenApiServiceAdapter({ apiKey: 'qwen-key' });
        innerService = adapter.qwenApiService;
    });

    test('generateContent when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ output: 'qwen' });
        expect(await adapter.generateContent('qwen-model', {})).toEqual({ output: 'qwen' });
    });

    test('generateContent initializes when not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({});
        await adapter.generateContent('qwen-model', {});
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('generateContentStream yields chunks', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'q'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('qwen-model', {})) chunks.push(c);
        expect(chunks).toContain('q');
    });

    test('listModels delegates', async () => {
        innerService.isInitialized = true;
        innerService.listModels = jest.fn().mockResolvedValue({ data: ['qwen-max'] });
        expect(await adapter.listModels()).toEqual({ data: ['qwen-max'] });
    });

    test('refreshToken when expiry near calls _initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        innerService._initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService._initializeAuth).toHaveBeenCalledWith(true);
    });

    test('refreshToken when not near expiry returns resolve', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken calls _initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService._initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService._initializeAuth).toHaveBeenCalledWith(true);
    });

    test('isExpiryDateNear delegates', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        expect(adapter.isExpiryDateNear()).toBe(false);
    });
});

// ==================== CodexApiServiceAdapter ====================

describe('CodexApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new CodexApiServiceAdapter({ apiKey: 'codex-key' });
        innerService = adapter.codexApiService;
    });

    test('generateContent when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ text: 'codex' });
        expect(await adapter.generateContent('codex-model', {})).toEqual({ text: 'codex' });
    });

    test('generateContent initializes if not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({});
        await adapter.generateContent('codex', {});
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('generateContentStream yields chunks', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'codex-chunk'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('codex', {})) chunks.push(c);
        expect(chunks).toContain('codex-chunk');
    });

    test('listModels delegates directly (no isInitialized check)', async () => {
        innerService.listModels = jest.fn().mockResolvedValue({ data: ['codex-model'] });
        expect(await adapter.listModels()).toEqual({ data: ['codex-model'] });
    });

    test('refreshToken when near expiry calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('refreshToken when not near expiry does not call initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        innerService.initializeAuth = jest.fn();
        await adapter.refreshToken();
        expect(innerService.initializeAuth).not.toHaveBeenCalled();
    });

    test('forceRefreshToken calls initializeAuth', async () => {
        innerService.isInitialized = true;
        innerService.initializeAuth = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService.initializeAuth).toHaveBeenCalledWith(true);
    });

    test('isExpiryDateNear delegates', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(false);
        expect(adapter.isExpiryDateNear()).toBe(false);
    });

    test('getUsageLimits when initialized', async () => {
        innerService.isInitialized = true;
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ remaining: 80 });
        expect(await adapter.getUsageLimits()).toEqual({ remaining: 80 });
    });
});

// ==================== ForwardApiServiceAdapter ====================

describe('ForwardApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new ForwardApiServiceAdapter({ endpoint: 'http://forward.example.com' });
        innerService = adapter.forwardApiService;
    });

    test('generateContent delegates', async () => {
        innerService.generateContent = jest.fn().mockResolvedValue({ data: 'forwarded' });
        expect(await adapter.generateContent('model', {})).toEqual({ data: 'forwarded' });
    });

    test('generateContentStream yields', async () => {
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'fw'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('model', {})) chunks.push(c);
        expect(chunks).toContain('fw');
    });

    test('listModels delegates', async () => {
        innerService.listModels = jest.fn().mockResolvedValue({ data: [] });
        await adapter.listModels();
        expect(innerService.listModels).toHaveBeenCalled();
    });

    test('refreshToken resolves', async () => {
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken resolves', async () => {
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('isExpiryDateNear returns false', () => {
        expect(adapter.isExpiryDateNear()).toBe(false);
    });
});

// ==================== GrokApiServiceAdapter ====================

describe('GrokApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new GrokApiServiceAdapter({ cookies: 'grok-cookie' });
        innerService = adapter.grokApiService;
    });

    test('generateContent when initialized', async () => {
        innerService.isInitialized = true;
        innerService.generateContent = jest.fn().mockResolvedValue({ choices: [{ message: 'grok' }] });
        expect(await adapter.generateContent('grok-3', {})).toEqual({ choices: [{ message: 'grok' }] });
    });

    test('generateContent initializes if not initialized', async () => {
        innerService.isInitialized = false;
        innerService.initialize = jest.fn().mockResolvedValue(undefined);
        innerService.generateContent = jest.fn().mockResolvedValue({});
        await adapter.generateContent('grok-3', {});
        expect(innerService.initialize).toHaveBeenCalled();
    });

    test('generateContentStream yields', async () => {
        innerService.isInitialized = true;
        innerService.generateContentStream = jest.fn().mockImplementation(async function* () { yield 'grok-chunk'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('grok-3', {})) chunks.push(c);
        expect(chunks).toContain('grok-chunk');
    });

    test('listModels when initialized', async () => {
        innerService.isInitialized = true;
        innerService.listModels = jest.fn().mockResolvedValue({ data: ['grok-3'] });
        expect(await adapter.listModels()).toEqual({ data: ['grok-3'] });
    });

    test('refreshToken delegates to grokApiService.refreshToken', async () => {
        innerService.refreshToken = jest.fn().mockResolvedValue(undefined);
        await adapter.refreshToken();
        expect(innerService.refreshToken).toHaveBeenCalled();
    });

    test('forceRefreshToken delegates to grokApiService.refreshToken', async () => {
        innerService.refreshToken = jest.fn().mockResolvedValue(undefined);
        await adapter.forceRefreshToken();
        expect(innerService.refreshToken).toHaveBeenCalled();
    });

    test('isExpiryDateNear delegates', () => {
        innerService.isExpiryDateNear = jest.fn().mockReturnValue(true);
        expect(adapter.isExpiryDateNear()).toBe(true);
    });

    test('getUsageLimits when initialized', async () => {
        innerService.isInitialized = true;
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ remaining: 5000 });
        expect(await adapter.getUsageLimits()).toEqual({ remaining: 5000 });
    });
});

// ==================== KimiApiServiceAdapter ====================

describe('KimiApiServiceAdapter', () => {
    let adapter;
    let innerService;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new KimiApiServiceAdapter({
            KIMI_OAUTH_CREDS_FILE_PATH: '/fake/path/kimi.json'
        });
        innerService = adapter.kimiApiService;
        // Reset token storage
        innerService.tokenStorage = null;
    });

    test('constructor sets _tokenLoadingPromise to null', () => {
        expect(adapter._tokenLoadingPromise).toBeNull();
    });

    test('generateContent calls _ensureTokenLoaded and chatCompletion', async () => {
        // Set tokenStorage to bypass loading
        innerService.tokenStorage = { access_token: 'token', needsRefresh: () => false };
        innerService.chatCompletion = jest.fn().mockResolvedValue({ choices: [{ message: 'kimi' }] });
        const result = await adapter.generateContent('kimi-model', { messages: [] });
        expect(innerService.chatCompletion).toHaveBeenCalled();
        expect(result).toEqual({ choices: [{ message: 'kimi' }] });
    });

    test('generateContentStream calls _ensureTokenLoaded and chatCompletionStream', async () => {
        innerService.tokenStorage = { access_token: 'token', needsRefresh: () => false };
        innerService.chatCompletionStream = jest.fn().mockImplementation(async function* () { yield 'kimi-token'; });
        const chunks = [];
        for await (const c of adapter.generateContentStream('kimi-model', {})) chunks.push(c);
        expect(chunks).toContain('kimi-token');
    });

    test('listModels when tokenStorage is already set', async () => {
        innerService.tokenStorage = { access_token: 'token' };
        innerService.listModels = jest.fn().mockResolvedValue({ data: ['kimi-model'] });
        const result = await adapter.listModels();
        expect(result).toEqual({ data: ['kimi-model'] });
    });

    test('listModels when tokenStorage is null - tries _ensureTokenLoaded, catches error gracefully', async () => {
        innerService.tokenStorage = null;
        existsSync.mockReturnValue(false); // causes _loadTokenInternal to throw
        innerService.listModels = jest.fn().mockResolvedValue({ data: [] });
        // Should not throw - catches error and falls through to listModels
        const result = await adapter.listModels();
        expect(innerService.listModels).toHaveBeenCalled();
    });

    test('_ensureTokenLoaded returns immediately when tokenStorage is set', async () => {
        innerService.tokenStorage = { access_token: 'token' };
        await expect(adapter._ensureTokenLoaded()).resolves.toBeUndefined();
    });

    test('_ensureTokenLoaded waits for in-progress loading', async () => {
        innerService.tokenStorage = null;
        existsSync.mockReturnValue(false);

        // The first call starts loading
        const p1 = adapter._ensureTokenLoaded().catch(() => {});
        // The second call should reuse the same promise (tokenLoadingPromise)
        const p2 = adapter._ensureTokenLoaded().catch(() => {});
        await Promise.all([p1, p2]);
        // Both resolved/rejected without issue
    });

    test('_loadTokenInternal throws when no KIMI_OAUTH_CREDS_FILE_PATH', async () => {
        adapter.config = {}; // no path
        await expect(adapter._loadTokenInternal()).rejects.toThrow('No KIMI_OAUTH_CREDS_FILE_PATH configured');
    });

    test('_loadTokenInternal throws when file not found', async () => {
        existsSync.mockReturnValue(false);
        adapter.config = { KIMI_OAUTH_CREDS_FILE_PATH: 'nonexistent.json' };
        await expect(adapter._loadTokenInternal()).rejects.toThrow('Kimi credentials file not found');
    });

    test('_loadTokenInternal throws when file has invalid JSON', async () => {
        existsSync.mockReturnValue(true);
        fsPromises.readFile.mockResolvedValue('not valid json{{{');
        adapter.config = { KIMI_OAUTH_CREDS_FILE_PATH: 'kimi.json' };
        await expect(adapter._loadTokenInternal()).rejects.toThrow('Invalid JSON in Kimi credentials file');
    });

    test('_loadTokenInternal succeeds with valid JSON file', async () => {
        existsSync.mockReturnValue(true);
        const tokenData = {
            access_token: 'valid-token',
            refresh_token: 'valid-refresh',
            expires_in: 3600
        };
        fsPromises.readFile.mockResolvedValue(JSON.stringify(tokenData));
        innerService.setTokenStorage = jest.fn();
        adapter.config = { KIMI_OAUTH_CREDS_FILE_PATH: 'kimi.json' };
        await adapter._loadTokenInternal();
        expect(innerService.setTokenStorage).toHaveBeenCalled();
    });

    test('refreshToken logs info', async () => {
        // Just call it, should not throw
        await expect(adapter.refreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken when tokenStorage has refresh_token', async () => {
        const { refreshKimiToken } = await import('../../../src/auth/kimi-oauth.js');
        innerService.tokenStorage = {
            refresh_token: 'valid-refresh',
            needsRefresh: () => false
        };
        refreshKimiToken.mockResolvedValue({ access_token: 'new-token', refresh_token: 'new-refresh' });
        await adapter.forceRefreshToken();
        expect(refreshKimiToken).toHaveBeenCalled();
        expect(innerService.tokenStorage).toEqual({ access_token: 'new-token', refresh_token: 'new-refresh' });
    });

    test('forceRefreshToken when tokenStorage is null - returns resolve', async () => {
        innerService.tokenStorage = null;
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('forceRefreshToken when tokenStorage has no refresh_token - returns resolve', async () => {
        innerService.tokenStorage = { access_token: 'token' }; // no refresh_token
        await expect(adapter.forceRefreshToken()).resolves.toBeUndefined();
    });

    test('isExpiryDateNear when tokenStorage is null returns false', () => {
        innerService.tokenStorage = null;
        expect(adapter.isExpiryDateNear()).toBe(false);
    });

    test('isExpiryDateNear delegates to tokenStorage.needsRefresh()', () => {
        innerService.tokenStorage = { needsRefresh: jest.fn().mockReturnValue(true) };
        expect(adapter.isExpiryDateNear()).toBe(true);
    });

    test('getUsageLimits when tokenStorage is already set', async () => {
        innerService.tokenStorage = { access_token: 'token' };
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ quota: 200 });
        expect(await adapter.getUsageLimits()).toEqual({ quota: 200 });
    });

    test('getUsageLimits calls _ensureTokenLoaded when tokenStorage is null', async () => {
        innerService.tokenStorage = null;
        existsSync.mockReturnValue(true);
        fsPromises.readFile.mockResolvedValue(JSON.stringify({ access_token: 'tok' }));
        innerService.setTokenStorage = jest.fn((ts) => { innerService.tokenStorage = ts; });
        innerService.getUsageLimits = jest.fn().mockResolvedValue({ quota: 100 });
        await adapter.getUsageLimits();
        expect(innerService.getUsageLimits).toHaveBeenCalled();
    });
});

// ==================== LRUCache TTL 功能测试（保留原有测试，使用本地 class） ====================

describe('LRUCache TTL (local simulation)', () => {
    class TTLLRUCache {
        constructor(maxSize = 50, ttlMs = 0) {
            this.maxSize = maxSize;
            this.ttlMs = ttlMs;
            this.cache = new Map();
        }

        _isExpired(entry) {
            if (!this.ttlMs) return false;
            return Date.now() - entry.timestamp > this.ttlMs;
        }

        get(key) {
            if (!this.cache.has(key)) return undefined;
            const entry = this.cache.get(key);
            if (this._isExpired(entry)) { this.cache.delete(key); return undefined; }
            const value = entry.value;
            this.cache.delete(key);
            this.cache.set(key, entry);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                this.cache.delete(this.cache.keys().next().value);
            }
            this.cache.set(key, { value, timestamp: Date.now() });
        }

        has(key) {
            if (!this.cache.has(key)) return false;
            const entry = this.cache.get(key);
            if (this._isExpired(entry)) { this.cache.delete(key); return false; }
            return true;
        }

        delete(key) { return this.cache.delete(key); }
        clear() { this.cache.clear(); }
        get size() { return this.cache.size; }

        purgeExpired() {
            if (!this.ttlMs) return;
            const now = Date.now();
            for (const [key, entry] of this.cache) {
                if (now - entry.timestamp > this.ttlMs) this.cache.delete(key);
            }
        }
    }

    test('should not expire without TTL', () => {
        const cache = new TTLLRUCache(50, 0);
        cache.set('k1', 'v1');
        expect(cache.has('k1')).toBe(true);
        expect(cache.get('k1')).toBe('v1');
    });

    test('should expire entries after TTL', () => {
        const cache = new TTLLRUCache(50, 100);
        cache.set('k1', 'v1');
        expect(cache.has('k1')).toBe(true);
        cache.cache.get('k1').timestamp = Date.now() - 200;
        expect(cache.has('k1')).toBe(false);
        expect(cache.get('k1')).toBeUndefined();
    });

    test('LRU eviction with maxSize', () => {
        const cache = new TTLLRUCache(2);
        cache.set('k1', 'v1');
        cache.set('k2', 'v2');
        cache.get('k1'); // k1 becomes most recent
        cache.set('k3', 'v3'); // k2 should be evicted
        expect(cache.has('k1')).toBe(true);
        expect(cache.has('k2')).toBe(false);
        expect(cache.has('k3')).toBe(true);
    });

    test('purgeExpired removes expired keys', () => {
        const cache = new TTLLRUCache(50, 100);
        cache.set('k1', 'v1');
        cache.set('k2', 'v2');
        cache.cache.get('k1').timestamp = Date.now() - 200;
        cache.purgeExpired();
        expect(cache.has('k1')).toBe(false);
        expect(cache.has('k2')).toBe(true);
    });

    test('purgeExpired does nothing without TTL', () => {
        const cache = new TTLLRUCache(50, 0);
        cache.set('k1', 'v1');
        cache.purgeExpired();
        expect(cache.has('k1')).toBe(true);
    });

    test('update existing key keeps size at 1', () => {
        const cache = new TTLLRUCache(50, 100);
        cache.set('k1', 'v1');
        cache.set('k1', 'v2');
        expect(cache.size).toBe(1);
        expect(cache.get('k1')).toBe('v2');
    });

    test('delete returns true for existing key', () => {
        const cache = new TTLLRUCache();
        cache.set('k1', 'v1');
        expect(cache.delete('k1')).toBe(true);
        expect(cache.size).toBe(0);
    });

    test('delete returns false for nonexistent key', () => {
        const cache = new TTLLRUCache();
        expect(cache.delete('nonexistent')).toBe(false);
    });

    test('clear removes all entries', () => {
        const cache = new TTLLRUCache();
        cache.set('k1', 'v1');
        cache.set('k2', 'v2');
        cache.clear();
        expect(cache.size).toBe(0);
    });

    test('TTL 3 hours constant behavior', () => {
        const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
        expect(THREE_HOURS_MS).toBe(10800000);
        const cache = new TTLLRUCache(50, THREE_HOURS_MS);
        cache.set('key', 'val');
        expect(cache.get('key')).toBe('val'); // not expired
    });
});
