/**
 * request-handler.js 单元测试
 * 测试请求处理器的中间件链、请求解析和错误处理
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    runWithContext: jest.fn((id, fn) => fn()),
    clearRequestContext: jest.fn(),
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
        runWithContext: jest.fn((id, fn) => fn()),
        clearRequestContext: jest.fn()
    }
}));

// Mock deepmerge
jest.mock('deepmerge', () => ({
    __esModule: true,
    default: jest.fn((a, b) => ({ ...a, ...b }))
}));

// Mock common utils
jest.mock('../../../src/utils/common.js', () => ({
    handleError: jest.fn(),
    getClientIp: jest.fn(() => '127.0.0.1'),
    isRetryableNetworkError: jest.fn(() => false),
    isRegisteredProvider: jest.fn(() => true),
    MODEL_PROVIDER: {
        AUTO: 'auto',
        KIRO_API: 'claude-kiro-oauth',
        GEMINI_CLI: 'gemini-cli-oauth',
        ANTIGRAVITY: 'gemini-antigravity',
        OPENAI_CUSTOM: 'openai-custom',
        CLAUDE_CUSTOM: 'claude-custom',
        QWEN_API: 'openai-qwen-oauth',
        CODEX_API: 'openai-codex-oauth',
        FORWARD_API: 'forward-api',
        GROK_CUSTOM: 'grok-custom',
        KIMI_API: 'kimi-oauth'
    }
}));

// Mock ui-manager
jest.mock('../../../src/services/ui-manager.js', () => ({
    handleUIApiRequests: jest.fn(() => false),
    serveStaticFiles: jest.fn(() => false)
}));

// Mock api-manager
jest.mock('../../../src/services/api-manager.js', () => ({
    handleAPIRequests: jest.fn(() => false)
}));

// Mock service-manager
jest.mock('../../../src/services/service-manager.js', () => ({
    getApiService: jest.fn(),
    getProviderStatus: jest.fn(),
    getProviderPoolManager: jest.fn(() => ({})),
    serviceInstances: {}
}));

// Mock adapter
jest.mock('../../../src/providers/adapter.js', () => ({
    getRegisteredProviders: jest.fn(() => []),
    isRegisteredProvider: jest.fn(() => true),
    serviceInstances: {}
}));

// Mock token-utils
jest.mock('../../../src/utils/token-utils.js', () => ({
    countTokensAnthropic: jest.fn(() => ({ input_tokens: 100 }))
}));

// Mock config-manager
jest.mock('../../../src/core/config-manager.js', () => ({
    PROMPT_LOG_FILENAME: 'prompt_log'
}));

// Mock plugin-manager
const mockExecuteRoutes = jest.fn(() => false);
const mockExecuteAuth = jest.fn(() => ({ handled: false, authorized: true }));
const mockExecuteMiddleware = jest.fn(() => ({ handled: false }));
const mockIsPluginStaticPath = jest.fn(() => false);

jest.mock('../../../src/core/plugin-manager.js', () => ({
    getPluginManager: jest.fn(() => ({
        isPluginStaticPath: mockIsPluginStaticPath,
        executeRoutes: mockExecuteRoutes,
        executeAuth: mockExecuteAuth,
        executeMiddleware: mockExecuteMiddleware
    }))
}));

// Mock grok-assets-proxy
jest.mock('../../../src/utils/grok-assets-proxy.js', () => ({
    handleGrokAssetsProxy: jest.fn()
}));

// 导入被测试的模块
const { createRequestHandler } = require('../../../src/handlers/request-handler.js');

// 测试辅助函数：创建 Mock Request
function createMockRequest(overrides = {}) {
    return {
        url: '/api/test',
        method: 'GET',
        headers: {
            'host': 'localhost:3000',
            'content-type': 'application/json'
        },
        socket: { encrypted: false },
        ...overrides
    };
}

// 测试辅助函数：创建 Mock Response
function createMockResponse() {
    const headers = {};
    const data = { chunks: [] };
    return {
        statusCode: 200,
        headers,
        setHeader: jest.fn((key, value) => { headers[key] = value; }),
        writeHead: jest.fn((code, hdrs) => {
            headers['statusCode'] = code;
            Object.assign(headers, hdrs);
        }),
        write: jest.fn((chunk) => { data.chunks.push(chunk); }),
        end: jest.fn((chunk) => { if (chunk) data.chunks.push(chunk); }),
        getData: () => data.chunks.join(''),
        getHeaders: () => headers
    };
}

// 测试辅助函数：创建 Mock Config
function createMockConfig() {
    return {
        MODEL_PROVIDER: 'claude-kiro-oauth',
        DEFAULT_MODEL_PROVIDERS: ['claude-kiro-oauth'],
        SERVER_PORT: 3000,
        HOST: '0.0.0.0',
        REQUIRED_API_KEY: 'test-key',
        SYSTEM_PROMPT_FILE_PATH: null,
        SYSTEM_PROMPT_MODE: 'overwrite',
        PROMPT_LOG_MODE: 'none',
        PROMPT_LOG_FILENAME: null
    };
}

describe('createRequestHandler', () => {
    let config;
    let providerPoolManager;

    beforeEach(() => {
        jest.clearAllMocks();
        config = createMockConfig();
        providerPoolManager = {};
    });

    describe('基础功能测试', () => {
        test('should create a request handler function', () => {
            const handler = createRequestHandler(config, providerPoolManager);
            expect(typeof handler).toBe('function');
        });

        test('should set security headers on response', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest();
            const res = createMockResponse();

            await handler(req, res);

            expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
            expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
            expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
            expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
        });

        test('should set CORS headers on response', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest();
            const res = createMockResponse();

            await handler(req, res);

            expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
            expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
            expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', expect.stringContaining('Content-Type'));
            expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
        });
    });

    describe('OPTIONS 预检请求处理', () => {
        test('should handle OPTIONS preflight request', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ method: 'OPTIONS' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(204);
            expect(res.end).toHaveBeenCalled();
        });
    });

    describe('Health Check 端点测试', () => {
        test('should handle /health endpoint', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"status":"healthy"'));
        });

        test('should return health check with correct provider', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"provider":"claude-kiro-oauth"'));
        });

        test('should include timestamp in health check response', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            const data = res.getData();
            const response = JSON.parse(data);
            expect(response.timestamp).toBeDefined();
            expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date');
        });
    });

    describe('Provider Health 端点测试', () => {
        const { getProviderStatus } = require('../../../src/services/service-manager.js');

        beforeEach(() => {
            getProviderStatus.mockReset();
        });

        test('should handle /provider_health endpoint', async () => {
            getProviderStatus.mockResolvedValue({
                providerPoolsSlim: [],
                count: 0,
                unhealthyCount: 0,
                unhealthyRatio: 0,
                unhealthySummeryMessage: '',
                summaryHealthy: true
            });

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(getProviderStatus).toHaveBeenCalled();
        });

        test('should handle provider_health with provider filter', async () => {
            getProviderStatus.mockResolvedValue({
                providerPoolsSlim: [{ uuid: 'test-uuid' }],
                count: 1,
                unhealthyCount: 0,
                unhealthyRatio: 0,
                unhealthySummeryMessage: '',
                summaryHealthy: true
            });

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health?provider=claude-kiro-oauth', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(getProviderStatus).toHaveBeenCalledWith(expect.any(Object), { provider: 'claude-kiro-oauth', customName: null });
        });

        test('should handle provider_health with customName filter', async () => {
            getProviderStatus.mockResolvedValue({
                providerPoolsSlim: [],
                count: 0,
                unhealthyCount: 0,
                unhealthyRatio: 0,
                unhealthySummeryMessage: '',
                summaryHealthy: true
            });

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health?customName=test-provider', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(getProviderStatus).toHaveBeenCalledWith(expect.any(Object), { provider: null, customName: 'test-provider' });
        });

        test('should handle provider_health with unhealthRatioThreshold', async () => {
            getProviderStatus.mockResolvedValue({
                providerPoolsSlim: [],
                count: 0,
                unhealthyCount: 1,
                unhealthyRatio: 0.5,
                unhealthySummeryMessage: 'Some unhealthy',
                summaryHealthy: false
            });

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health?unhealthRatioThreshold=0.3', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            const data = res.getData();
            const response = JSON.parse(data);
            expect(response.unhealthyRatio).toBe(0.5);
            expect(response.summaryHealth).toBe(false); // 0.5 > 0.3
        });

        test('should handle provider_health error', async () => {
            getProviderStatus.mockRejectedValue(new Error('Database error'));
            const { handleError } = require('../../../src/utils/common.js');

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(handleError).toHaveBeenCalled();
        });
    });

    describe('Grok Assets 代理端点测试', () => {
        const { handleGrokAssetsProxy } = require('../../../src/utils/grok-assets-proxy.js');

        beforeEach(() => {
            handleGrokAssetsProxy.mockReset();
        });

        test('should handle /api/grok/assets endpoint', async () => {
            handleGrokAssetsProxy.mockResolvedValue();

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/api/grok/assets', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(handleGrokAssetsProxy).toHaveBeenCalledWith(req, res, expect.any(Object), providerPoolManager);
        });
    });

    describe('Model Provider 头信息覆盖测试', () => {
        const { handleAPIRequests } = require('../../../src/services/api-manager.js');

        beforeEach(() => {
            handleAPIRequests.mockReset();
        });

        test('should override MODEL_PROVIDER from header', async () => {
            handleAPIRequests.mockReturnValue(true);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({
                headers: { ...createMockRequest().headers, 'model-provider': 'claude-kiro-oauth' }
            });
            const res = createMockResponse();

            await handler(req, res);

            // 请求应该被 API handler 处理
            expect(handleAPIRequests).toHaveBeenCalled();
        });

        test('should handle request when isRegisteredProvider returns false', async () => {
            const { isRegisteredProvider } = require('../../../src/utils/common.js');
            isRegisteredProvider.mockReturnValueOnce(false);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({
                headers: { ...createMockRequest().headers, 'model-provider': 'invalid-provider' }
            });
            const res = createMockResponse();

            await handler(req, res);

            // When provider is invalid, the request continues and eventually gets 404
            expect(res.writeHead).toHaveBeenCalled();
        });
    });

    describe('路径 Provider 覆盖测试', () => {
        const { handleAPIRequests } = require('../../../src/services/api-manager.js');

        beforeEach(() => {
            handleAPIRequests.mockReset();
        });

        test('should override MODEL_PROVIDER from path segment', async () => {
            handleAPIRequests.mockReturnValue(true);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/claude-kiro-oauth/v1/chat/completions', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(handleAPIRequests).toHaveBeenCalled();
        });

        test('should handle /auto path segment for auto mode', async () => {
            handleAPIRequests.mockReturnValue(true);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/auto/v1/chat/completions', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(handleAPIRequests).toHaveBeenCalled();
        });

        test('should handle request when provider not recognized in path', async () => {
            const { isRegisteredProvider } = require('../../../src/utils/common.js');
            isRegisteredProvider.mockReturnValueOnce(false);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/unknown-provider/v1/chat/completions', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            // When provider not recognized, request continues and gets 404
            expect(res.writeHead).toHaveBeenCalled();
        });
    });

    describe('Count Tokens 端点测试', () => {
        test('should handle /count_tokens endpoint', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({
                url: '/api/count_tokens',
                method: 'POST'
            });
            const res = createMockResponse();

            // 模拟请求体
            const mockBody = JSON.stringify({ model: 'test-model', messages: [] });
            req.on = jest.fn((event, callback) => {
                if (event === 'data') callback(Buffer.from(mockBody));
                if (event === 'end') callback();
                return req;
            });

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(res.end).toHaveBeenCalled();
        });

        test('should handle count_tokens with empty body', async () => {
            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({
                url: '/api/count_tokens',
                method: 'POST'
            });
            const res = createMockResponse();

            req.on = jest.fn((event, callback) => {
                if (event === 'end') callback();
                return req;
            });

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalled();
        });
    });

    describe('404 未找到处理', () => {
        test('should return 404 for unmatched routes', async () => {
            const { handleAPIRequests } = require('../../../src/services/api-manager.js');
            const { handleUIApiRequests } = require('../../../src/services/ui-manager.js');
            const { serveStaticFiles } = require('../../../src/services/ui-manager.js');

            handleAPIRequests.mockReturnValue(false);
            handleUIApiRequests.mockReturnValue(false);
            serveStaticFiles.mockReturnValue(false);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/unknown/route', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
            expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
        });
    });

    describe('错误处理', () => {
        test('should handle errors via handleError', async () => {
            const { handleAPIRequests } = require('../../../src/services/api-manager.js');
            handleAPIRequests.mockImplementation(() => {
                throw new Error('API Error');
            });

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/v1/chat/completions', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            const { handleError } = require('../../../src/utils/common.js');
            expect(handleError).toHaveBeenCalled();
        });

        test('should handle provider_health errors gracefully', async () => {
            const { getProviderStatus } = require('../../../src/services/service-manager.js');
            getProviderStatus.mockRejectedValue(new Error('Test error'));

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/provider_health', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            const { handleError } = require('../../../src/utils/common.js');
            expect(handleError).toHaveBeenCalled();
        });
    });

    describe('插件系统集成', () => {
        test('should call pluginManager.executeRoutes for non-static paths', async () => {
            const { serveStaticFiles } = require('../../../src/services/ui-manager.js');
            serveStaticFiles.mockReturnValue(false); // Don't serve static, continue to plugin

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/api/test', method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(mockExecuteRoutes).toHaveBeenCalled();
        });

        test('should call pluginManager.executeAuth', async () => {
            const { handleAPIRequests } = require('../../../src/services/api-manager.js');
            handleAPIRequests.mockReturnValue(true);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/api/test', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(mockExecuteAuth).toHaveBeenCalled();
        });

        test('should call pluginManager.executeMiddleware', async () => {
            const { handleAPIRequests } = require('../../../src/services/api-manager.js');
            handleAPIRequests.mockReturnValue(true);

            const handler = createRequestHandler(config, providerPoolManager);
            const req = createMockRequest({ url: '/api/test', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(mockExecuteMiddleware).toHaveBeenCalled();
        });

        test('should return 401 when auth plugin denies authorization', async () => {
            mockExecuteAuth.mockReturnValueOnce({ handled: false, authorized: false });

            // 重新创建 handler 以使用新的 mock
            const handler = createRequestHandler(createMockConfig(), providerPoolManager);
            const req = createMockRequest({ url: '/api/test', method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
            expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
        });
    });
});

describe('generateRequestId (内部函数)', () => {
    // 由于 generateRequestId 是内部函数，我们通过测试 requestHandler 的行为来验证它

    test('should handle multiple requests independently', async () => {
        const config = createMockConfig();
        const providerPoolManager = {};
        const handler = createRequestHandler(config, providerPoolManager);

        const req1 = createMockRequest({ url: '/test1', method: 'GET' });
        const res1 = createMockResponse();

        const req2 = createMockRequest({ url: '/test2', method: 'GET' });
        const res2 = createMockResponse();

        // 执行两个请求 - 两者都应该完成而不抛出错误
        await expect(handler(req1, res1)).resolves.toBeUndefined();
        await expect(handler(req2, res2)).resolves.toBeUndefined();
    });
});
