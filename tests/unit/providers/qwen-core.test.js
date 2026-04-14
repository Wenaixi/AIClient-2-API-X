/**
 * QwenApiService 核心单元测试
 * 覆盖：QwenOAuth2Event、qwenOAuth2Events、TokenError、构造函数
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
    configureTLSSidecar: jest.fn((cfg) => cfg),
}));

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn(() => false),
    MODEL_PROVIDER: { QWEN_API: 'qwen_api' },
    formatExpiryLog: jest.fn(() => ''),
}));

jest.mock('../../../src/providers/provider-models.js', () => ({
    getProviderModels: jest.fn(() => ['qwen3-max', 'qwen3-coder-plus', 'qwen-turbo']),
}));

jest.mock('../../../src/auth/oauth-handlers.js', () => ({
    handleQwenOAuth: jest.fn(() => ({
        authUrl: 'https://example.com/auth',
        authInfo: { device_code: 'test' },
    })),
}));

jest.mock('../../../src/services/service-manager.js', () => ({
    getProviderPoolManager: jest.fn(() => ({
        resetProviderRefreshStatus: jest.fn(),
    })),
}));

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1234') }));
jest.mock('open', () => jest.fn());

import { QwenApiService, QwenOAuth2Event, qwenOAuth2Events, TokenError } from '../../../src/providers/openai/qwen-core.js';

// ==================== QwenOAuth2Event 测试 ====================

describe('QwenOAuth2Event', () => {
    it('应包含正确的事件类型', () => {
        expect(QwenOAuth2Event.AuthUri).toBe('auth-uri');
        expect(QwenOAuth2Event.AuthProgress).toBe('auth-progress');
        expect(QwenOAuth2Event.AuthCancel).toBe('auth-cancel');
    });

    it('qwenOAuth2Events 应是 EventEmitter 实例', () => {
        expect(qwenOAuth2Events).toBeDefined();
        expect(typeof qwenOAuth2Events.emit).toBe('function');
        expect(typeof qwenOAuth2Events.on).toBe('function');
    });
});

// ==================== TokenError 测试 ====================

describe('TokenError', () => {
    it('应包含错误定义', () => {
        expect(TokenError).toBeDefined();
        expect(TokenError.REFRESH_FAILED).toBe('REFRESH_FAILED');
        expect(TokenError.NO_REFRESH_TOKEN).toBe('NO_REFRESH_TOKEN');
        expect(TokenError.LOCK_TIMEOUT).toBe('LOCK_TIMEOUT');
        expect(TokenError.FILE_ACCESS_ERROR).toBe('FILE_ACCESS_ERROR');
        expect(TokenError.NETWORK_ERROR).toBe('NETWORK_ERROR');
    });
});

// ==================== QwenApiService 测试 ====================

describe('QwenApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createConfig(overrides = {}) {
        return {
            QWEN_CLIENT_ID: 'test-client-id',
            QWEN_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            uuid: 'test-uuid-1234',
            ...overrides,
        };
    }

    describe('constructor', () => {
        it('应正确初始化实例', () => {
            const svc = new QwenApiService(createConfig());
            expect(svc.config).toBeDefined();
            expect(svc.uuid).toBe('test-uuid-1234');
            expect(svc.isInitialized).toBe(false);
        });

        it('应使用默认 baseUrl', () => {
            const svc = new QwenApiService(createConfig({ QWEN_BASE_URL: undefined }));
            expect(svc.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
        });
    });
});
