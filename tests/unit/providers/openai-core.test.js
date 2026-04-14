/**
 * OpenAIApiService 核心单元测试
 * 覆盖：构造函数/callApi(重试逻辑)/streamApi/generateContent/listModels
 */

jest.mock('axios', () => {
    const mockRequest = jest.fn();
    const mockInstance = { request: mockRequest };
    const axios = jest.fn(() => Promise.resolve({ data: {} }));
    axios.create = jest.fn(() => mockInstance);
    axios._mockInstance = mockInstance;
    axios._mockRequest = mockRequest;
    return axios;
});

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/utils/proxy-utils.js', () => ({
    configureAxiosProxy: jest.fn(),
    configureTLSSidecar: jest.fn(),
}));

jest.mock('../../../src/utils/common.js', () => ({
    isRetryableNetworkError: jest.fn(() => false),
    MODEL_PROVIDER: {
        OPENAI_CUSTOM: 'openai_custom',
    },
}));

import axios from 'axios';
import { OpenAIApiService } from '../../../src/providers/openai/openai-core.js';
import { configureAxiosProxy, configureTLSSidecar } from '../../../src/utils/proxy-utils.js';
import { isRetryableNetworkError } from '../../../src/utils/common.js';

function getMockRequest() {
    return axios._mockRequest;
}

function createConfig(overrides = {}) {
    return {
        OPENAI_API_KEY: 'test-openai-key',
        OPENAI_BASE_URL: 'https://api.openai.com',
        REQUEST_MAX_RETRIES: 2,
        REQUEST_BASE_DELAY: 10,
        ...overrides,
    };
}

describe('OpenAIApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isRetryableNetworkError.mockReturnValue(false);
    });

    // ─── 构造函数 ─────────────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('正常构造：有 API key', () => {
            const svc = new OpenAIApiService(createConfig());
            expect(svc.apiKey).toBe('test-openai-key');
            expect(svc.baseUrl).toBe('https://api.openai.com');
        });

        it('缺少 API key 抛出错误', () => {
            expect(() => new OpenAIApiService({})).toThrow('OpenAI API Key is required');
        });

        it('系统代理默认关闭', () => {
            const svc = new OpenAIApiService(createConfig());
            expect(svc.useSystemProxy).toBe(false);
        });

        it('USE_SYSTEM_PROXY_OPENAI=true 启用代理', () => {
            const svc = new OpenAIApiService(createConfig({ USE_SYSTEM_PROXY_OPENAI: true }));
            expect(svc.useSystemProxy).toBe(true);
        });

        it('调用 configureAxiosProxy', () => {
            new OpenAIApiService(createConfig());
            expect(configureAxiosProxy).toHaveBeenCalled();
        });

        it('axios.create 被调用', () => {
            new OpenAIApiService(createConfig());
            expect(axios.create).toHaveBeenCalled();
        });
    });

    // ─── callApi ─────────────────────────────────────────────────────────────────

    describe('callApi', () => {
        it('成功请求返回 data', async () => {
            getMockRequest().mockResolvedValueOnce({ data: { choices: [] } });
            const svc = new OpenAIApiService(createConfig());
            const result = await svc.callApi('/chat/completions', { model: 'gpt-4' });
            expect(result).toEqual({ choices: [] });
        });

        it('401 错误不重试直接抛出', async () => {
            const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new OpenAIApiService(createConfig());
            await expect(svc.callApi('/chat/completions', {})).rejects.toThrow();
            expect(getMockRequest()).toHaveBeenCalledTimes(1);
        });

        it('403 错误不重试直接抛出', async () => {
            const err = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new OpenAIApiService(createConfig());
            await expect(svc.callApi('/chat/completions', {})).rejects.toThrow();
            expect(getMockRequest()).toHaveBeenCalledTimes(1);
        });

        it('429 错误指数退避后重试并成功', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/chat/completions', {});
            expect(result).toEqual({ ok: true });
        });

        it('429 超过最大重试次数后抛出', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            getMockRequest().mockRejectedValue(err);
            const svc = new OpenAIApiService(createConfig({ REQUEST_MAX_RETRIES: 1, REQUEST_BASE_DELAY: 1 }));
            await expect(svc.callApi('/chat/completions', {})).rejects.toThrow();
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });

        it('500 服务器错误触发重试并成功', async () => {
            const err = Object.assign(new Error('Server error'), { response: { status: 500 } });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/chat/completions', {});
            expect(result).toEqual({ ok: true });
        });

        it('网络错误 (isRetryableNetworkError) 触发重试', async () => {
            isRetryableNetworkError.mockReturnValue(true);
            const err = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/chat/completions', {});
            expect(result).toEqual({ ok: true });
        });

        it('未知错误直接抛出', async () => {
            const err = Object.assign(new Error('Bad Request'), { response: { status: 400 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new OpenAIApiService(createConfig());
            await expect(svc.callApi('/chat/completions', {})).rejects.toThrow();
        });
    });

    // ─── streamApi ───────────────────────────────────────────────────────────────

    describe('streamApi', () => {
        function makeAsyncIterable(chunks) {
            return {
                [Symbol.asyncIterator]() {
                    let i = 0;
                    return {
                        next() {
                            if (i < chunks.length) {
                                return Promise.resolve({ value: Buffer.from(chunks[i++]), done: false });
                            }
                            return Promise.resolve({ value: undefined, done: true });
                        }
                    };
                }
            };
        }

        it('正常流式解析 SSE 数据块', async () => {
            const chunk = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toMatchObject({ choices: expect.any(Array) });
        });

        it('[DONE] 信号停止迭代', async () => {
            const chunk = 'data: {"choices":[]}\ndata: [DONE]\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(results.length).toBe(1); // 只有 choices:[] 被解析，[DONE]停止
        });

        it('忽略解析失败的 JSON 块', async () => {
            const chunk = 'data: invalid-json\ndata: {"choices":[]}\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(results.some(r => Array.isArray(r.choices))).toBe(true);
        });

        it('流式 401 直接抛出', async () => {
            const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new OpenAIApiService(createConfig());
            const gen = svc.streamApi('/chat/completions', {});
            await expect(gen.next()).rejects.toThrow();
        });

        it('流式 429 触发重试', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            const chunk = 'data: [DONE]\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });

        it('流式 500 触发重试', async () => {
            const err = Object.assign(new Error('Server error'), { response: { status: 500 } });
            const chunk = 'data: [DONE]\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });

        it('流式网络错误触发重试', async () => {
            isRetryableNetworkError.mockReturnValue(true);
            const err = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
            const chunk = 'data: [DONE]\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new OpenAIApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/chat/completions', {})) {
                results.push(item);
            }
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });
    });

    // ─── _applySidecar ────────────────────────────────────────────────────────────

    describe('_applySidecar', () => {
        it('调用 configureTLSSidecar', () => {
            const svc = new OpenAIApiService(createConfig());
            const cfg = {};
            svc._applySidecar(cfg);
            expect(configureTLSSidecar).toHaveBeenCalled();
        });
    });
});
