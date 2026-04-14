/**
 * Forward API Service 单元测试
 * 覆盖：构造、API调用、流式处理、重试逻辑、错误处理
 */

import { ForwardApiService } from '../../../src/providers/forward/forward-core.js';
import { ForwardStrategy } from '../../../src/providers/forward/forward-strategy.js';

// Mock dependencies
jest.mock('axios', () => ({
    create: jest.fn(() => ({
        request: jest.fn(),
    })),
}));

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

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn((err) => {
        return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err?.code);
    }),
    MODEL_PROVIDER: { FORWARD_API: 'forward' },
    extractSystemPromptFromRequestBody: jest.fn(() => ''),
    MODEL_PROTOCOL_PREFIX: { OPENAI: 'openai' },
}));

jest.mock('../../../src/converters/utils.js', () => ({
    applySystemPromptReplacements: jest.fn((text) => text),
}));

import axios from 'axios';
import logger from '../../../src/utils/logger.js';
import { configureAxiosProxy, configureTLSSidecar } from '../../../src/utils/proxy-utils.js';
import { isRetryableNetworkError } from '../../../src/utils/common.js';

function createMockAxiosInstance(overrides = {}) {
    const instance = {
        request: jest.fn(overrides.request || (() => Promise.resolve({ data: { choices: [] } }))),
    };
    axios.create.mockReturnValue(instance);
    return instance;
}

function createBasicConfig(overrides = {}) {
    return {
        FORWARD_API_KEY: 'test-api-key',
        FORWARD_BASE_URL: 'https://api.example.com',
        USE_SYSTEM_PROXY_FORWARD: false,
        FORWARD_HEADER_NAME: 'Authorization',
        FORWARD_HEADER_VALUE_PREFIX: 'Bearer ',
        REQUEST_MAX_RETRIES: 3,
        REQUEST_BASE_DELAY: 10,
        MODEL_PROVIDER: 'forward',
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    axios.create.mockReset();
    createMockAxiosInstance();
});

describe('ForwardApiService', () => {
    describe('constructor', () => {
        test('should create instance with valid config', () => {
            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            expect(service).toBeDefined();
            expect(service.baseUrl).toBe('https://api.example.com');
            expect(service.apiKey).toBe('test-api-key');
            expect(service.useSystemProxy).toBe(false);
        });

        test('should throw error if FORWARD_API_KEY is missing', () => {
            const config = createBasicConfig({ FORWARD_API_KEY: null });
            expect(() => new ForwardApiService(config)).toThrow('API Key is required');
        });

        test('should throw error if FORWARD_BASE_URL is missing', () => {
            const config = createBasicConfig({ FORWARD_BASE_URL: null });
            expect(() => new ForwardApiService(config)).toThrow('Base URL is required');
        });

        test('should use custom header name and prefix', () => {
            const config = createBasicConfig({
                FORWARD_HEADER_NAME: 'X-API-Token',
                FORWARD_HEADER_VALUE_PREFIX: 'Custom ',
            });
            const service = new ForwardApiService(config);
            expect(service.headerName).toBe('X-API-Token');
            expect(service.headerValuePrefix).toBe('Custom ');
        });

        test('should enable system proxy when configured', () => {
            const config = createBasicConfig({ USE_SYSTEM_PROXY_FORWARD: true });
            const service = new ForwardApiService(config);
            expect(service.useSystemProxy).toBe(true);
        });

        test('should configure axios with proxy disabled by default', () => {
            const config = createBasicConfig();
            new ForwardApiService(config);
            expect(axios.create).toHaveBeenCalled();
            const createCall = axios.create.mock.calls[0][0];
            expect(createCall.proxy).toBe(false);
        });

        test('should configure axios with proxy enabled when USE_SYSTEM_PROXY_FORWARD is true', () => {
            const config = createBasicConfig({ USE_SYSTEM_PROXY_FORWARD: true });
            new ForwardApiService(config);
            expect(axios.create).toHaveBeenCalled();
        });
    });

    describe('callApi', () => {
        test('should make successful API call', async () => {
            const mockResponse = { data: { choices: [{ message: { content: 'test response' } }] } };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue(mockResponse),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/chat/completions', { model: 'test', messages: [] });
            expect(result).toEqual(mockResponse.data);
            expect(mockInstance.request).toHaveBeenCalled();
        });

        test('should throw on 401 error', async () => {
            const error = { response: { status: 401, data: {} }, code: 'ERR_BAD_REQUEST' };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockRejectedValue(error),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/chat/completions', {})).rejects.toMatchObject({ response: { status: 401 } });
        });

        test('should throw on 403 error', async () => {
            const error = { response: { status: 403, data: {} }, code: 'ERR_BAD_REQUEST' };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockRejectedValue(error),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/chat/completions', {})).rejects.toMatchObject({ response: { status: 403 } });
        });

        test('should retry on 429 error', async () => {
            const rateLimitError = { response: { status: 429, data: {} }, code: 'ERR_BAD_REQUEST' };
            const successResponse = { data: { choices: [{ message: { content: 'success' } }] } };
            let callCount = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) return Promise.reject(rateLimitError);
                    return Promise.resolve(successResponse);
                }),
            });

            const config = createBasicConfig({ REQUEST_BASE_DELAY: 1 });
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/chat/completions', {});
            expect(callCount).toBe(2);
            expect(result).toEqual(successResponse.data);
        });

        test('should retry on 500 error', async () => {
            const serverError = { response: { status: 500, data: {} }, code: 'ERR_BAD_REQUEST' };
            const successResponse = { data: { choices: [] } };
            let callCount = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) return Promise.reject(serverError);
                    return Promise.resolve(successResponse);
                }),
            });

            const config = createBasicConfig({ REQUEST_BASE_DELAY: 1 });
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/chat/completions', {});
            expect(callCount).toBe(2);
            expect(result).toEqual(successResponse.data);
        });

        test('should retry on network error', async () => {
            const networkError = { code: 'ECONNRESET', message: 'Connection reset' };
            const successResponse = { data: { choices: [] } };
            let callCount = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) return Promise.reject(networkError);
                    return Promise.resolve(successResponse);
                }),
            });

            const config = createBasicConfig({ REQUEST_BASE_DELAY: 1 });
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.callApi('/chat/completions', {});
            expect(callCount).toBe(2);
            expect(result).toEqual(successResponse.data);
        });

        test('should throw after exhausting retries', async () => {
            const error = { response: { status: 429, data: {} }, code: 'ERR_BAD_REQUEST' };
            let callCount = 0;
            const mockInstance = {
                request: jest.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.reject(error);
                }),
            };

            const config = createBasicConfig({ REQUEST_MAX_RETRIES: 2, REQUEST_BASE_DELAY: 1 });
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            await expect(service.callApi('/chat/completions', {})).rejects.toMatchObject({ response: { status: 429 } });
            // initial + 2 retries = 3 calls
            expect(callCount).toBe(3);
        });

        test('should apply sidecar configuration', async () => {
            const mockResponse = { data: { choices: [] } };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue(mockResponse),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            await service.callApi('/chat/completions', {});
            expect(configureTLSSidecar).toHaveBeenCalled();
        });
    });

    describe('generateContent', () => {
        test('should call callApi with endpoint', async () => {
            const mockResponse = { data: { choices: [] } };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue(mockResponse),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const requestBody = { model: 'test', messages: [], endpoint: '/v1/chat/completions' };
            const result = await service.generateContent('test', requestBody);
            expect(mockInstance.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: '/v1/chat/completions',
            }));
        });

        test('should strip _monitorRequestId from request body', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue({ data: {} }),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const requestBody = {
                model: 'test',
                messages: [],
                _monitorRequestId: 'test-123',
                endpoint: '/chat',
            };
            await service.generateContent('test', requestBody);

            const callArg = mockInstance.request.mock.calls[0][0];
            expect(callArg.data._monitorRequestId).toBeUndefined();
        });

        test('should strip _requestBaseUrl from request body', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue({ data: {} }),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const requestBody = {
                model: 'test',
                messages: [],
                _requestBaseUrl: 'http://test.com',
                endpoint: '/chat',
            };
            await service.generateContent('test', requestBody);

            const callArg = mockInstance.request.mock.calls[0][0];
            expect(callArg.data._requestBaseUrl).toBeUndefined();
        });
    });

    describe('listModels', () => {
        test('should return models from API', async () => {
            const mockResponse = { data: { data: [{ id: 'model-1' }, { id: 'model-2' }] } };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue(mockResponse),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.listModels();
            expect(result).toEqual(mockResponse.data);
            expect(mockInstance.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: '/models',
            }));
        });

        test('should return empty data on error', async () => {
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockRejectedValue(new Error('Network error')),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const result = await service.listModels();
            expect(result).toEqual({ data: [] });
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('streamApi', () => {
        test('should handle SSE stream data', async () => {
            const mockStreamData = [
                { choices: [{ delta: { content: 'Hello' } }] },
                { choices: [{ delta: { content: ' world' } }] },
            ];
            const mockStream = {
                [Symbol.asyncIterator]: jest.fn(() => {
                    let index = 0;
                    return {
                        next: jest.fn().mockImplementation(() => {
                            if (index >= mockStreamData.length) {
                                return Promise.resolve({ done: true });
                            }
                            const chunk = `data: ${JSON.stringify(mockStreamData[index])}\n`;
                            index++;
                            return Promise.resolve({ value: Buffer.from(chunk), done: false });
                        }),
                    };
                }),
            };

            const mockResponse = { data: mockStream };
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue(mockResponse),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const results = [];
            for await (const chunk of service.streamApi('/stream', {})) {
                results.push(chunk);
            }

            expect(results.length).toBe(2);
            expect(results[0]).toEqual(mockStreamData[0]);
            expect(results[1]).toEqual(mockStreamData[1]);
        });

        test('should handle [DONE] SSE event', async () => {
            const mockStream = {
                [Symbol.asyncIterator]: jest.fn(() => {
                    return {
                        next: jest.fn()
                            .mockResolvedValueOnce({ value: Buffer.from('data: {"choices":[{"delta":{"content":"test"}}]}\n'), done: false })
                            .mockResolvedValueOnce({ value: Buffer.from('data: [DONE]\n'), done: false })
                            .mockResolvedValueOnce({ done: true }),
                    };
                }),
            };

            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockResolvedValue({ data: mockStream }),
            });

            const config = createBasicConfig();
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const results = [];
            for await (const chunk of service.streamApi('/stream', {})) {
                results.push(chunk);
            }

            expect(results.length).toBe(1);
            expect(results[0]).toEqual({ choices: [{ delta: { content: 'test' } }] });
        });

        test('should retry on stream error 429', async () => {
            let callCount = 0;
            const mockInstance = createMockAxiosInstance({
                request: jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        const error = { response: { status: 429, data: {} }, code: 'ERR_BAD_REQUEST' };
                        return Promise.reject(error);
                    }
                    const mockStream = {
                        [Symbol.asyncIterator]: jest.fn(() => ({
                            next: jest.fn().mockResolvedValue({ done: true }),
                        })),
                    };
                    return Promise.resolve({ data: mockStream });
                }),
            });

            const config = createBasicConfig({ REQUEST_BASE_DELAY: 1 });
            const service = new ForwardApiService(config);
            service.axiosInstance = mockInstance;

            const results = [];
            for await (const chunk of service.streamApi('/stream', {})) {
                results.push(chunk);
            }

            expect(callCount).toBe(2);
        });
    });
});

describe('ForwardStrategy', () => {
    describe('extractModelAndStreamInfo', () => {
        test('should extract model and stream info', () => {
            const strategy = new ForwardStrategy();
            const req = {};
            const requestBody = { model: 'gpt-4', stream: true };

            const result = strategy.extractModelAndStreamInfo(req, requestBody);

            expect(result.model).toBe('gpt-4');
            expect(result.isStream).toBe(true);
        });

        test('should default to "default" model when not specified', () => {
            const strategy = new ForwardStrategy();
            const req = {};
            const requestBody = { stream: false };

            const result = strategy.extractModelAndStreamInfo(req, requestBody);

            expect(result.model).toBe('default');
            expect(result.isStream).toBe(false);
        });
    });

    describe('extractResponseText', () => {
        test('should extract text from OpenAI-style response', () => {
            const strategy = new ForwardStrategy();
            const response = {
                choices: [{ message: { content: 'Hello world' } }],
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('Hello world');
        });

        test('should extract text from delta content', () => {
            const strategy = new ForwardStrategy();
            const response = {
                choices: [{ delta: { content: 'Hello' } }],
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('Hello');
        });

        test('should extract text from content array', () => {
            const strategy = new ForwardStrategy();
            const response = {
                content: [{ text: 'Part 1' }, { text: 'Part 2' }],
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('Part 1Part 2');
        });

        test('should return empty string for unrecognized format', () => {
            const strategy = new ForwardStrategy();
            const response = { unknown: 'format' };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('');
        });
    });

    describe('extractPromptText', () => {
        test('should extract text from last message', () => {
            const strategy = new ForwardStrategy();
            const requestBody = {
                messages: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hello' },
                ],
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('Hello');
        });

        test('should handle object content', () => {
            const strategy = new ForwardStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: { type: 'text', text: 'Hello' } },
                ],
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('{"type":"text","text":"Hello"}');
        });

        test('should return empty string when no messages', () => {
            const strategy = new ForwardStrategy();
            const requestBody = {};

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('');
        });
    });

    describe('manageSystemPrompt', () => {
        test('should be no-op', async () => {
            const strategy = new ForwardStrategy();
            const requestBody = { messages: [] };

            await strategy.manageSystemPrompt(requestBody);

            // No errors should be thrown
        });
    });
});
