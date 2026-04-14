/**
 * GeminiApiService 核心单元测试
 * 覆盖：构造函数/initialize/loadCredentials/listModels/_applySidecar
 * 注意：parseRetryDelay/is_anti_truncation_model 等为内部函数，未导出
 */

jest.mock('google-auth-library', () => {
    const MockOAuth2Client = jest.fn(function () {
        this.setCredentials = jest.fn();
        this.credentials = {};
        this.request = jest.fn(() => Promise.resolve({ data: {} }));
    });
    return {
        OAuth2Client: MockOAuth2Client,
    };
});

jest.mock('open', () => jest.fn(() => Promise.resolve()));

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureTLSSidecar: jest.fn(),
    getProxyConfigForProvider: jest.fn(() => null),
    getGoogleAuthProxyConfig: jest.fn(() => null),
}));

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn(() => false),
    API_ACTIONS: {
        GENERATE_CONTENT: 'generateContent',
        STREAM_GENERATE_CONTENT: 'streamGenerateContent',
    },
    formatExpiryTime: jest.fn(),
    formatExpiryLog: jest.fn(),
    MODEL_PROVIDER: {
        GEMINI_CLI: 'gemini_cli',
    },
}));

jest.mock('../../../src/providers/provider-models.js', () => ({
    getProviderModels: jest.fn(() => ['gemini-2.5-pro', 'gemini-2.0-flash']),
}));

jest.mock('../../../src/auth/oauth-handlers.js', () => ({
    handleGeminiCliOAuth: jest.fn(() => ({
        authUrl: 'https://example.com/auth',
        authInfo: {},
    })),
}));

jest.mock('../../../src/providers/adapter.js', () => ({
    getServiceAdapter: jest.fn(),
    serviceInstances: new Map(),
}));

jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn(() => ({
        markProviderNeedRefresh: jest.fn(),
        resetProviderRefreshStatus: jest.fn(),
    })),
}));

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
}));

import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import { GeminiApiService } from '../../../src/providers/gemini/gemini-core.js';

function createConfig(overrides = {}) {
    return {
        HOST: 'localhost',
        uuid: 'test-uuid',
        GEMINI_BASE_URL: 'https://cloudcode-pa.googleapis.com',
        PROJECT_ID: 'test-project',
        REQUEST_MAX_RETRIES: 2,
        REQUEST_BASE_DELAY: 10,
        MODEL_PROVIDER: 'gemini_cli',
        ...overrides,
    };
}

describe('GeminiApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── 构造函数 ─────────────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('正常构造', () => {
            const svc = new GeminiApiService(createConfig());
            expect(svc.host).toBe('localhost');
            expect(svc.uuid).toBe('test-uuid');
        });

        it('使用默认 codeAssistEndpoint', () => {
            const svc = new GeminiApiService(createConfig({ GEMINI_BASE_URL: undefined }));
            expect(svc.codeAssistEndpoint).toBeDefined();
        });

        it('创建 httpAgent 和 httpsAgent', () => {
            const svc = new GeminiApiService(createConfig());
            expect(svc.httpAgent).toBeDefined();
            expect(svc.httpsAgent).toBeDefined();
        });

        it('OAuth2Client 被实例化', () => {
            new GeminiApiService(createConfig());
            expect(OAuth2Client).toHaveBeenCalled();
        });
    });

    // ─── initialize ───────────────────────────────────────────────────────────────

    describe('initialize', () => {
        it('幂等调用', async () => {
            const svc = new GeminiApiService(createConfig({ PROJECT_ID: 'my-project' }));
            await svc.initialize();
            await svc.initialize();
            expect(svc.isInitialized).toBe(true);
        });

        it('有 PROJECT_ID 时设置 availableModels', async () => {
            const svc = new GeminiApiService(createConfig({ PROJECT_ID: 'my-project' }));
            await svc.initialize();
            expect(svc.availableModels.length).toBeGreaterThan(0);
        });

        it('PROJECT_ID 为 default 时抛出错误', async () => {
            const svc = new GeminiApiService(createConfig({ PROJECT_ID: 'default' }));
            await expect(svc.initialize()).rejects.toThrow("'default' is not a valid project ID");
        });
    });

    // ─── loadCredentials ─────────────────────────────────────────────────────────

    describe('loadCredentials', () => {
        it('base64 凭证成功解析并设置', async () => {
            const creds = { access_token: 'test-token', refresh_token: 'refresh-token' };
            const svc = new GeminiApiService(createConfig({
                GEMINI_OAUTH_CREDS_BASE64: Buffer.from(JSON.stringify(creds)).toString('base64')
            }));
            await svc.loadCredentials();
            expect(svc.authClient.setCredentials).toHaveBeenCalledWith(creds);
        });

        it('文件不存在时不抛出', async () => {
            fs.promises.readFile.mockRejectedValueOnce({ code: 'ENOENT' });
            const svc = new GeminiApiService(createConfig());
            await expect(svc.loadCredentials()).resolves.not.toThrow();
        });

        it('无效 base64 不抛出', async () => {
            const svc = new GeminiApiService(createConfig({ GEMINI_OAUTH_CREDS_BASE64: 'invalid-base64!' }));
            await expect(svc.loadCredentials()).resolves.not.toThrow();
        });
    });

    // ─── listModels ───────────────────────────────────────────────────────────────

    describe('listModels', () => {
        it('返回格式化模型列表', async () => {
            const svc = new GeminiApiService(createConfig({ PROJECT_ID: 'my-project' }));
            await svc.initialize();
            const result = await svc.listModels();
            expect(result).toHaveProperty('models');
            expect(Array.isArray(result.models)).toBe(true);
            expect(result.models.length).toBeGreaterThan(0);
        });

        it('模型格式包含 name/version/displayName', async () => {
            const svc = new GeminiApiService(createConfig({ PROJECT_ID: 'my-project' }));
            await svc.initialize();
            const result = await svc.listModels();
            const model = result.models[0];
            expect(model).toHaveProperty('name');
            expect(model).toHaveProperty('version');
            expect(model).toHaveProperty('displayName');
            expect(model.name).toContain('models/');
        });
    });

    // ─── _applySidecar ───────────────────────────────────────────────────────────

    describe('_applySidecar', () => {
        it('调用 configureTLSSidecar', () => {
            const { configureTLSSidecar } = require('../../../src/utils/proxy-utils.js');
            const svc = new GeminiApiService(createConfig());
            const opts = {};
            svc._applySidecar(opts);
            expect(configureTLSSidecar).toHaveBeenCalled();
        });
    });
});
