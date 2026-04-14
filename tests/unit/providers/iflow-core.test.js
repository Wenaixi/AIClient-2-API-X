/**
 * IFlowApiService 核心单元测试
 * 覆盖：IFlowTokenStorage 类、辅助函数、构造函数
 */

jest.mock('axios', () => {
    const mockAxios = jest.fn(() => Promise.resolve({ data: {} }));
    mockAxios.create = jest.fn(() => ({ request: jest.fn() }));
    return mockAxios;
});

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureAxiosProxy: jest.fn(),
}));

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn(() => false),
    MODEL_PROVIDER: { IFLOW_API: 'iflow_api' },
    formatExpiryLog: jest.fn(() => ''),
}));

jest.mock('../../../src/providers/provider-models.js', () => ({
    getProviderModels: jest.fn(() => ['qwen3-max', 'kimi-k2', 'deepseek-v3', 'glm-4']),
}));

jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn(() => ({
        resetProviderRefreshStatus: jest.fn(),
    })),
}));

jest.mock('open', () => jest.fn());

import { IFlowApiService, IFlowTokenStorage } from '../../../src/providers/openai/iflow-core.js';

// ==================== IFlowTokenStorage 测试 ====================

describe('IFlowTokenStorage', () => {
    describe('constructor', () => {
        it('应正确初始化所有字段', () => {
            const storage = new IFlowTokenStorage({
                accessToken: 'access123',
                refreshToken: 'refresh456',
                expiryDate: '2026-12-31',
                apiKey: 'api789',
                tokenType: 'Bearer',
                scope: 'read write'
            });
            expect(storage.accessToken).toBe('access123');
            expect(storage.refreshToken).toBe('refresh456');
            expect(storage.expiryDate).toBe('2026-12-31');
            expect(storage.apiKey).toBe('api789');
            expect(storage.tokenType).toBe('Bearer');
            expect(storage.scope).toBe('read write');
        });

        it('应使用下划线格式字段名', () => {
            const storage = new IFlowTokenStorage({
                access_token: 'access123',
                refresh_token: 'refresh456',
                expiry_date: '2026-12-31',
                api_key: 'api789'
            });
            expect(storage.accessToken).toBe('access123');
            expect(storage.refreshToken).toBe('refresh456');
            expect(storage.apiKey).toBe('api789');
        });

        it('应处理空数据', () => {
            const storage = new IFlowTokenStorage();
            expect(storage.accessToken).toBe('');
            expect(storage.refreshToken).toBe('');
            expect(storage.expiryDate).toBe('');
            expect(storage.apiKey).toBe('');
        });
    });

    describe('toJSON', () => {
        it('应返回正确格式的 JSON', () => {
            const storage = new IFlowTokenStorage({
                accessToken: 'access123',
                refreshToken: 'refresh456',
                expiryDate: '2026-12-31',
                apiKey: 'api789',
                tokenType: 'Bearer',
                scope: 'read'
            });
            const json = storage.toJSON();
            expect(json.access_token).toBe('access123');
            expect(json.refresh_token).toBe('refresh456');
            expect(json.expiry_date).toBe('2026-12-31');
            expect(json.apiKey).toBe('api789');
            expect(json.token_type).toBe('Bearer');
            expect(json.scope).toBe('read');
        });
    });

    describe('fromJSON', () => {
        it('应从 JSON 创建实例', () => {
            const json = {
                access_token: 'access123',
                refresh_token: 'refresh456',
                expiry_date: '2026-12-31',
                api_key: 'api789'
            };
            const storage = IFlowTokenStorage.fromJSON(json);
            expect(storage.accessToken).toBe('access123');
            expect(storage.refreshToken).toBe('refresh456');
            expect(storage.expiryDate).toBe('2026-12-31');
            expect(storage.apiKey).toBe('api789');
        });
    });
});

// ==================== IFlowApiService 测试 ====================

describe('IFlowApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createConfig(overrides = {}) {
        return {
            IFLOW_API_KEY: 'test-api-key',
            IFLOW_BASE_URL: 'https://apis.iflow.cn/v1',
            uuid: 'test-uuid-1234',
            ...overrides,
        };
    }

    describe('constructor', () => {
        it('应正确初始化实例', () => {
            const svc = new IFlowApiService(createConfig());
            expect(svc.config).toBeDefined();
            expect(svc.uuid).toBe('test-uuid-1234');
            expect(svc.isInitialized).toBe(false);
        });

        it('应使用默认 baseUrl', () => {
            const svc = new IFlowApiService(createConfig({ IFLOW_BASE_URL: undefined }));
            expect(svc.baseUrl).toBe('https://apis.iflow.cn/v1');
        });

        it('应配置 axiosInstance', () => {
            const svc = new IFlowApiService(createConfig());
            expect(svc.axiosInstance).toBeDefined();
        });

        it('应初始化 tokenStorage', () => {
            const svc = new IFlowApiService(createConfig());
            expect(svc.tokenStorage).toBeDefined();
        });
    });

    describe('isThinkingModel (module function)', () => {
        it('应正确识别 thinking 模型前缀', () => {
            const { isThinkingModel } = require('../../../src/providers/openai/iflow-core.js');
            expect(isThinkingModel('glm-4.6')).toBe(true);
            expect(isThinkingModel('qwen3-235b-a22b-thinking')).toBe(true);
            expect(isThinkingModel('deepseek-r1')).toBe(true);
        });

        it('应正确识别非 thinking 模型', () => {
            const { isThinkingModel } = require('../../../src/providers/openai/iflow-core.js');
            expect(isThinkingModel('qwen3-max')).toBe(false);
            expect(isThinkingModel('kimi-k2')).toBe(false);
            expect(isThinkingModel('deepseek-v3')).toBe(false);
        });
    });
});
