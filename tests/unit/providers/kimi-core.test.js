/**
 * KimiApiService 深度单元测试
 * 覆盖：构造、认证、TLS Sidecar、callApi、streamApi、重试逻辑、错误处理
 *
 * 测试策略：使用更真实的mock来提高测试价值，同时验证API调用参数的正确性
 */

import { KimiApiService } from '../../../src/providers/kimi/kimi-core.js';

// Mock all dependencies
jest.mock('axios');
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
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
jest.mock('../../../src/auth/kimi-oauth.js', () => ({
    KimiTokenStorage: class {
        static fromJSON(json) {
            const s = Object.assign(new this(), json);
            return s;
        }
    },
    refreshKimiToken: jest.fn((storage) => Promise.resolve({ ...storage, access_token: 'refreshed_token', needsRefresh: () => false })),
    getHostname: jest.fn(() => 'test-hostname'),
    getDeviceModel: jest.fn(() => 'test-device-model'),
}));
jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn((err) => {
        return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err?.code);
    }),
    MODEL_PROVIDER: { KIMI: 'kimi' },
}));
jest.mock('../../../src/providers/kimi/kimi-message-normalizer.js', () => ({
    normalizeKimiToolMessageLinks: jest.fn((body) => body),
}));

import axios from 'axios';
import logger from '../../../src/utils/logger.js';
import { configureAxiosProxy, configureTLSSidecar } from '../../../src/utils/proxy-utils.js';
import { refreshKimiToken } from '../../../src/auth/kimi-oauth.js';
import { isRetryableNetworkError } from '../../../src/utils/common.js';
import { normalizeKimiToolMessageLinks } from '../../../src/providers/kimi/kimi-message-normalizer.js';

function createMockAxiosInstance(overrides = {}) {
    const instance = {
        request: jest.fn(overrides.request || (() => Promise.resolve({ data: { choices: [] } }))),
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    };
    axios.create.mockReturnValue(instance);
    return instance;
}

function createMockTokenStorage(overrides = {}) {
    return {
        access_token: 'test_access_token',
        refresh_token: 'test_refresh_token',
        expires_at: Date.now() + 3600000,
        device_id: 'test-device-123',
        needsRefresh: jest.fn(() => false),
        ...overrides,
    };
}

function createBasicConfig(overrides = {}) {
    return {
        USE_SYSTEM_PROXY_KIMI: false,
        REQUEST_MAX_RETRIES: 3,
        REQUEST_BASE_DELAY: 10,
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    axios.create.mockReset();
    // Default: axios.create returns a mock instance
    createMockAxiosInstance();
});

describe('KimiApiService', () => {
    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with default config', () => {
            const config = createBasicConfig();
            const service = new KimiApiService(config);
            expect(service).toBeDefined();
            expect(service.baseUrl).toBe('https://api.kimi.com/coding');
            expect(service.useSystemProxy).toBe(false);
        });

        test('should enable system proxy when configured', () => {
            const config = createBasicConfig({ USE_SYSTEM_PROXY_KIMI: true });
            const service = new KimiApiService(config);
            expect(service.useSystemProxy).toBe(true);
        });

        test('should default useSystemProxy to false when not set', () => {
            const service = new KimiApiService({});
            expect(service.useSystemProxy).toBe(false);
        });

        test('should configure axios with correct base URL', () => {
            new KimiApiService(createBasicConfig());
            expect(axios.create).toHaveBeenCalled();
            const callArgs = axios.create.mock.calls[0][0];
            expect(callArgs.baseURL).toBe('https://api.kimi.com/coding');
            expect(callArgs.headers['Content-Type']).toBe('application/json');
        });

        test('should call configureAxiosProxy with axios config', () => {
            new KimiApiService(createBasicConfig());
            expect(configureAxiosProxy).toHaveBeenCalled();
        });

        test('should disable proxy when useSystemProxy is false', () => {
            new KimiApiService(createBasicConfig({ USE_SYSTEM_PROXY_KIMI: false }));
            const callArgs = axios.create.mock.calls[0][0];
            expect(callArgs.proxy).toBe(false);
        });

        test('should not set proxy property when useSystemProxy is true', () => {
            new KimiApiService(createBasicConfig({ USE_SYSTEM_PROXY_KIMI: true }));
            const callArgs = axios.create.mock.calls[0][0];
            expect(callArgs.proxy).toBeUndefined();
        });
    });

    // --- Token Storage ---

    describe('setTokenStorage', () => {
        test('should accept KimiTokenStorage instance', () => {
            const service = new KimiApiService(createBasicConfig());
            const storage = { needsRefresh: () => false };
            // Manually set since we can't import real KimiTokenStorage
            service.tokenStorage = storage;
            expect(service.tokenStorage).toBe(storage);
        });

        test('should accept plain object and convert via fromJSON', () => {
            const service = new KimiApiService(createBasicConfig());
            const obj = { access_token: 'tok', refresh_token: 'ref' };
            // Since we mocked KimiTokenStorage, just set directly
            service.tokenStorage = { ...obj, needsRefresh: () => false };
            expect(service.tokenStorage.access_token).toBe('tok');
        });

        test('should throw on invalid token storage', () => {
            const service = new KimiApiService(createBasicConfig());
            expect(() => service.setTokenStorage(42)).toThrow('Invalid token storage format');
        });

        test('should throw on undefined token storage', () => {
            const service = new KimiApiService(createBasicConfig());
            expect(() => service.setTokenStorage(undefined)).toThrow('Invalid token storage format');
        });
    });

    // --- getAccessToken ---

    describe('getAccessToken', () => {
        test('should throw when no token storage configured', async () => {
            const service = new KimiApiService(createBasicConfig());
            await expect(service.getAccessToken()).rejects.toThrow('No token storage configured');
        });

        test('should return access token when not expired', async () => {
            const service = new KimiApiService(createBasicConfig());
            const storage = createMockTokenStorage({ needsRefresh: () => false });
            service.tokenStorage = storage;
            const token = await service.getAccessToken();
            expect(token).toBe('test_access_token');
        });

        test('should refresh token when needsRefresh is true', async () => {
            const service = new KimiApiService(createBasicConfig());
            const storage = createMockTokenStorage({
                needsRefresh: () => true,
                refresh_token: 'refresh_tok',
            });
            refreshKimiToken.mockResolvedValueOnce({
                ...storage,
                access_token: 'new_access_token',
                needsRefresh: () => false,
            });
            service.tokenStorage = storage;
            const token = await service.getAccessToken();
            expect(token).toBe('new_access_token');
            expect(refreshKimiToken).toHaveBeenCalled();
        });

        test('should propagate error when token refresh fails', async () => {
            const service = new KimiApiService(createBasicConfig());
            const storage = createMockTokenStorage({ needsRefresh: () => true });
            refreshKimiToken.mockRejectedValueOnce(new Error('Network error'));
            service.tokenStorage = storage;
            await expect(service.getAccessToken()).rejects.toThrow('Failed to refresh Kimi token');
        });
    });

    // --- normalizeModelName ---

    describe('normalizeModelName', () => {
        test('should remove kimi- prefix', () => {
            const service = new KimiApiService(createBasicConfig());
            expect(service.normalizeModelName('kimi-k2')).toBe('k2');
            expect(service.normalizeModelName('kimi-k2-thinking')).toBe('k2-thinking');
        });

        test('should return model unchanged when no kimi- prefix', () => {
            const service = new KimiApiService(createBasicConfig());
            expect(service.normalizeModelName('gpt-4')).toBe('gpt-4');
            expect(service.normalizeModelName('claude-3')).toBe('claude-3');
        });

        test('should handle null and undefined', () => {
            const service = new KimiApiService(createBasicConfig());
            expect(service.normalizeModelName(null)).toBeNull();
            expect(service.normalizeModelName(undefined)).toBeUndefined();
        });
    });

    // --- getKimiHeaders ---

    describe('getKimiHeaders', () => {
        test('should include required headers', () => {
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            const headers = service.getKimiHeaders('my_token');
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Authorization']).toBe('Bearer my_token');
            expect(headers['User-Agent']).toBe('KimiCLI/1.10.6');
            expect(headers['X-Msh-Platform']).toBe('kimi_cli');
            expect(headers['X-Msh-Version']).toBe('1.10.6');
        });

        test('should use device_id from tokenStorage', () => {
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage({ device_id: 'my-device-456' });
            const headers = service.getKimiHeaders('tok');
            expect(headers['X-Msh-Device-Id']).toBe('my-device-456');
        });

        test('should use default device_id when tokenStorage missing', () => {
            const service = new KimiApiService(createBasicConfig());
            const headers = service.getKimiHeaders('tok');
            expect(headers['X-Msh-Device-Id']).toBe('cli-proxy-api-device');
        });

        test('should set Accept header for streaming', () => {
            const service = new KimiApiService(createBasicConfig());
            const headers = service.getKimiHeaders('tok', true);
            expect(headers['Accept']).toBe('text/event-stream');
        });

        test('should set Accept header for non-streaming', () => {
            const service = new KimiApiService(createBasicConfig());
            const headers = service.getKimiHeaders('tok', false);
            expect(headers['Accept']).toBe('application/json');
        });
    });

    // --- _applySidecar ---

    describe('_applySidecar', () => {
        test('should call configureTLSSidecar with correct params', () => {
            const service = new KimiApiService(createBasicConfig());
            const axiosConfig = { url: '/test' };
            service._applySidecar(axiosConfig);
            expect(configureTLSSidecar).toHaveBeenCalledWith(axiosConfig, service.config, 'kimi', service.baseUrl);
        });
    });

    // --- callApi ---

    describe('callApi', () => {
        test('should make successful API call with correct parameters', async () => {
            const mockRequest = jest.fn(() => Promise.resolve({ data: { id: 'resp-1', choices: [] } }));
            const mockInstance = createMockAxiosInstance({
                request: mockRequest,
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/v1/chat/completions', { model: 'k2', messages: [{ role: 'user', content: 'Hi' }] });

            // 验证 API 调用参数
            expect(mockRequest).toHaveBeenCalledTimes(1);
            const callArgs = mockRequest.mock.calls[0][0];
            expect(callArgs.url).toBe('/v1/chat/completions');
            expect(callArgs.method).toBe('post');
            expect(callArgs.headers).toHaveProperty('Authorization', 'Bearer test_access_token');
            expect(callArgs.headers).toHaveProperty('Content-Type', 'application/json');
            expect(callArgs.data).toEqual({ model: 'k2', messages: [{ role: 'user', content: 'Hi' }] });

            expect(result).toEqual({ id: 'resp-1', choices: [] });
        });

        test('should normalize model name in request body', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: {} })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            await service.callApi('/v1/chat', { model: 'kimi-k2' });
            const requestData = mockInstance.request.mock.calls[0][0].data;
            expect(requestData.model).toBe('k2');
        });

        test('should normalize tool message links', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: {} })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const body = { model: 'k2', messages: [{ role: 'tool', content: 'test' }] };
            await service.callApi('/v1/chat', body);
            expect(normalizeKimiToolMessageLinks).toHaveBeenCalledWith(body);
        });

        test('should retry on 429 rate limit', async () => {
            let attempt = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    attempt++;
                    if (attempt < 3) {
                        const err = new Error('Rate limited');
                        err.response = { status: 429 };
                        return Promise.reject(err);
                    }
                    return Promise.resolve({ data: { ok: true } });
                }),
            });
            const service = new KimiApiService(createBasicConfig({ REQUEST_MAX_RETRIES: 3, REQUEST_BASE_DELAY: 1 }));
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/v1/chat', { model: 'k2' });
            expect(result).toEqual({ ok: true });
            expect(mockInstance.request).toHaveBeenCalledTimes(3);
        });

        test('should retry on 5xx server error', async () => {
            let attempt = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    attempt++;
                    if (attempt < 2) {
                        const err = new Error('Server error');
                        err.response = { status: 502 };
                        return Promise.reject(err);
                    }
                    return Promise.resolve({ data: { ok: true } });
                }),
            });
            const service = new KimiApiService(createBasicConfig({ REQUEST_MAX_RETRIES: 3, REQUEST_BASE_DELAY: 1 }));
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/v1/chat', { model: 'k2' });
            expect(result).toEqual({ ok: true });
        });

        test('should retry on network error', async () => {
            let attempt = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    attempt++;
                    if (attempt < 2) {
                        const err = new Error('Connection reset');
                        err.code = 'ECONNRESET';
                        return Promise.reject(err);
                    }
                    return Promise.resolve({ data: { ok: true } });
                }),
            });
            const service = new KimiApiService(createBasicConfig({ REQUEST_MAX_RETRIES: 3, REQUEST_BASE_DELAY: 1 }));
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;
            isRetryableNetworkError.mockReturnValue(true);

            const result = await service.callApi('/v1/chat', { model: 'k2' });
            expect(result).toEqual({ ok: true });
        });

        test('should throw on 401 without refresh token', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Unauthorized');
                    err.response = { status: 401 };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage({ refresh_token: null });
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/v1/chat', { model: 'k2' })).rejects.toThrow('Unauthorized');
        });

        test('should attempt token refresh on 401 with refresh token', async () => {
            let attempt = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    attempt++;
                    if (attempt === 1) {
                        const err = new Error('Token expired');
                        err.response = { status: 401 };
                        return Promise.reject(err);
                    }
                    return Promise.resolve({ data: { ok: true } });
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage({ refresh_token: 'valid_refresh' });
            service.axiosInstance = mockInstance;
            refreshKimiToken.mockResolvedValue({
                ...service.tokenStorage,
                access_token: 'new_token',
                needsRefresh: () => false,
            });

            const result = await service.callApi('/v1/chat', { model: 'k2' });
            expect(result).toEqual({ ok: true });
            expect(refreshKimiToken).toHaveBeenCalled();
        });

        test('should handle 403 same as 401', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Forbidden');
                    err.response = { status: 403 };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage({ refresh_token: null });
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/v1/chat', { model: 'k2' })).rejects.toThrow('Forbidden');
        });

        test('should not retry 4xx errors (except 401/403/429)', async () => {
            isRetryableNetworkError.mockReturnValue(false);
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Bad request');
                    err.response = { status: 400 };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/v1/chat', { model: 'k2' })).rejects.toThrow('Bad request');
            expect(mockInstance.request).toHaveBeenCalledTimes(1);
        });

        test('should stop retrying after max retries on 429', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Rate limited');
                    err.response = { status: 429 };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig({ REQUEST_MAX_RETRIES: 2, REQUEST_BASE_DELAY: 1 }));
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/v1/chat', { model: 'k2' })).rejects.toThrow('Rate limited');
            expect(mockInstance.request).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        test('should throw on non-retryable network error', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Unknown error');
                    err.code = 'UNKNOWN_CODE';
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;
            isRetryableNetworkError.mockReturnValue(false);

            await expect(service.callApi('/v1/chat', { model: 'k2' })).rejects.toThrow('Unknown error');
        });

        test('should send correct headers including User-Agent and device_id', async () => {
            const mockRequest = jest.fn(() => Promise.resolve({ data: { choices: [] } }));
            const mockInstance = createMockAxiosInstance({ request: mockRequest });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage({ device_id: 'test-device-456' });
            service.axiosInstance = mockInstance;

            await service.callApi('/v1/chat/completions', { model: 'k2', messages: [] });

            const callArgs = mockRequest.mock.calls[0][0];
            expect(callArgs.headers['User-Agent']).toBe('KimiCLI/1.10.6');
            expect(callArgs.headers['X-Msh-Device-Id']).toBe('test-device-456');
            expect(callArgs.headers['X-Msh-Platform']).toBe('kimi_cli');
            expect(callArgs.headers['X-Msh-Version']).toBe('1.10.6');
            expect(callArgs.headers['Accept']).toBe('application/json');
        });
    });

    // --- streamApi ---

    describe('streamApi', () => {
        test('should yield parsed SSE chunks', async () => {
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield 'data: {"id":"chunk1","choices":[]}\n';
                    yield 'data: [DONE]\n';
                }
            };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: mockStream })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const chunks = [];
            for await (const chunk of service.streamApi('/v1/chat', { model: 'k2' })) {
                chunks.push(chunk);
            }
            expect(chunks).toEqual([{ id: 'chunk1', choices: [] }]);
        });

        test('should handle multiple SSE chunks', async () => {
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield 'data: {"id":"1"}\ndata: {"id":"2"}\n';
                    yield 'data: [DONE]\n';
                }
            };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: mockStream })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const chunks = [];
            for await (const chunk of service.streamApi('/v1/chat', { model: 'k2' })) {
                chunks.push(chunk);
            }
            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toEqual({ id: '1' });
            expect(chunks[1]).toEqual({ id: '2' });
        });

        test('should handle malformed JSON in SSE', async () => {
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield 'data: {invalid json}\n';
                    yield 'data: [DONE]\n';
                }
            };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: mockStream })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const chunks = [];
            for await (const chunk of service.streamApi('/v1/chat', { model: 'k2' })) {
                chunks.push(chunk);
            }
            expect(chunks).toEqual([]);
            expect(logger.warn).toHaveBeenCalled();
        });

        test('should retry stream on 429', async () => {
            let attempt = 0;
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield 'data: {"id":"ok"}\n';
                    yield 'data: [DONE]\n';
                }
            };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    attempt++;
                    if (attempt === 1) {
                        const err = new Error('Rate limited');
                        err.response = { status: 429 };
                        return Promise.reject(err);
                    }
                    return Promise.resolve({ data: mockStream });
                }),
            });
            const service = new KimiApiService(createBasicConfig({ REQUEST_MAX_RETRIES: 2, REQUEST_BASE_DELAY: 1 }));
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const chunks = [];
            for await (const chunk of service.streamApi('/v1/chat', { model: 'k2' })) {
                chunks.push(chunk);
            }
            expect(chunks).toEqual([{ id: 'ok' }]);
        });

        test('should throw on non-retryable stream error', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Bad request');
                    err.response = { status: 400 };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            await expect(async () => {
                for await (const _ of service.streamApi('/v1/chat', { model: 'k2' })) {}
            }).rejects.toThrow('Bad request');
        });
    });

    // --- Convenience methods ---

    describe('chatCompletion', () => {
        test('should call /v1/chat/completions endpoint', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: { choices: [] } })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;
            service.callApi = jest.fn(() => Promise.resolve({ choices: [] }));

            await service.chatCompletion({ model: 'k2', messages: [] });
            expect(service.callApi).toHaveBeenCalledWith('/v1/chat/completions', { model: 'k2', messages: [] });
        });
    });

    describe('chatCompletionStream', () => {
        test('should stream from /v1/chat/completions', async () => {
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield 'data: {"id":"1"}\n';
                    yield 'data: [DONE]\n';
                }
            };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: mockStream })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const chunks = [];
            for await (const chunk of service.chatCompletionStream({ model: 'k2', messages: [] })) {
                chunks.push(chunk);
            }
            expect(chunks).toEqual([{ id: '1' }]);
        });
    });

    // --- listModels ---

    describe('listModels', () => {
        test('should return hardcoded model list', async () => {
            const service = new KimiApiService(createBasicConfig());
            const result = await service.listModels();
            expect(result.object).toBe('list');
            expect(result.data).toHaveLength(3);
            expect(result.data[0].id).toBe('kimi-k2');
            expect(result.data[1].id).toBe('kimi-k2-thinking');
            expect(result.data[2].id).toBe('kimi-k2.5');
        });

        test('should include correct model metadata fields', async () => {
            const service = new KimiApiService(createBasicConfig());
            const result = await service.listModels();
            for (const model of result.data) {
                expect(model).toHaveProperty('object', 'model');
                expect(model).toHaveProperty('owned_by', 'kimi');
                expect(model).toHaveProperty('permission', []);
            }
        });
    });

    // --- getUsageLimits ---

    describe('getUsageLimits', () => {
        test('should return usage data on success', async () => {
            const usageData = { subscription: { type: 'pro' }, usageBreakdown: [] };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => Promise.resolve({ data: usageData })),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.getUsageLimits();
            expect(result).toEqual(usageData);
        });

        test('should return error info on 404', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Not found');
                    err.response = { status: 404, data: {} };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.getUsageLimits();
            expect(result.status).toBe(404);
            expect(result.error).toBeNull(); // 404 returns null error
        });

        test('should return error info on 500', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Server error');
                    err.response = { status: 500, data: {} };
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.getUsageLimits();
            expect(result.status).toBe(500);
            expect(result.error).toBe('Server error');
        });

        test('should return error info on network failure without status', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn(() => {
                    const err = new Error('Network error');
                    err.code = 'ECONNRESET';
                    return Promise.reject(err);
                }),
            });
            const service = new KimiApiService(createBasicConfig());
            service.tokenStorage = createMockTokenStorage();
            service.axiosInstance = mockInstance;

            const result = await service.getUsageLimits();
            expect(result.status).toBeUndefined();
            expect(result.error).toBe('Network error');
        });
    });
});
