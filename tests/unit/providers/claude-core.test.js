/**
 * ClaudeApiService 核心单元测试
 * 覆盖：构造函数/createClient/callApi(重试逻辑)/streamApi/generateContent/listModels
 */

jest.mock('axios', () => {
    const mockRequest = jest.fn();
    const mockInstance = { request: mockRequest };
    const axios = {
        create: jest.fn(() => mockInstance),
        default: { create: jest.fn(() => mockInstance) },
        _mockInstance: mockInstance,
        _mockRequest: mockRequest,
    };
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
        CLAUDE_CUSTOM: 'claude_custom',
    },
}));

import axios from 'axios';
import { ClaudeApiService } from '../../../src/providers/claude/claude-core.js';
import { configureAxiosProxy, configureTLSSidecar } from '../../../src/utils/proxy-utils.js';
import { isRetryableNetworkError } from '../../../src/utils/common.js';

function getMockRequest() {
    return axios._mockRequest;
}

function createConfig(overrides = {}) {
    return {
        CLAUDE_API_KEY: 'test-api-key',
        CLAUDE_BASE_URL: 'https://api.anthropic.com',
        REQUEST_MAX_RETRIES: 2,
        REQUEST_BASE_DELAY: 10,
        ...overrides,
    };
}

describe('ClaudeApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isRetryableNetworkError.mockReturnValue(false);
    });

    // ─── 构造函数 ────────────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('正常构造：有 API key', () => {
            const svc = new ClaudeApiService(createConfig());
            expect(svc.apiKey).toBe('test-api-key');
            expect(svc.baseUrl).toBe('https://api.anthropic.com');
        });

        it('缺少 API key 抛出错误', () => {
            expect(() => new ClaudeApiService({})).toThrow('Claude API Key is required');
        });

        it('系统代理默认关闭', () => {
            const svc = new ClaudeApiService(createConfig());
            expect(svc.useSystemProxy).toBe(false);
        });

        it('USE_SYSTEM_PROXY_CLAUDE=true 启用代理', () => {
            const svc = new ClaudeApiService(createConfig({ USE_SYSTEM_PROXY_CLAUDE: true }));
            expect(svc.useSystemProxy).toBe(true);
        });

        it('调用 configureAxiosProxy', () => {
            new ClaudeApiService(createConfig());
            expect(configureAxiosProxy).toHaveBeenCalled();
        });
    });

    // ─── callApi ─────────────────────────────────────────────────────────────────

    describe('callApi', () => {
        it('成功请求返回 data', async () => {
            getMockRequest().mockResolvedValueOnce({ data: { id: 'msg_001' } });
            const svc = new ClaudeApiService(createConfig());
            const result = await svc.callApi('/messages', { model: 'claude-3' });
            expect(result).toEqual({ id: 'msg_001' });
        });

        it('401 错误不重试直接抛出', async () => {
            const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new ClaudeApiService(createConfig());
            await expect(svc.callApi('/messages', {})).rejects.toThrow('Unauthorized');
            expect(getMockRequest()).toHaveBeenCalledTimes(1);
        });

        it('403 错误不重试直接抛出', async () => {
            const err = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new ClaudeApiService(createConfig());
            await expect(svc.callApi('/messages', {})).rejects.toThrow();
            expect(getMockRequest()).toHaveBeenCalledTimes(1);
        });

        it('429 错误指数退避后重试并成功', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/messages', {});
            expect(result).toEqual({ ok: true });
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });

        it('429 超过最大重试次数后抛出', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            getMockRequest().mockRejectedValue(err);
            const svc = new ClaudeApiService(createConfig({ REQUEST_MAX_RETRIES: 1, REQUEST_BASE_DELAY: 1 }));
            await expect(svc.callApi('/messages', {})).rejects.toThrow();
            // 初次 + 1次重试 = 2 次
            expect(getMockRequest()).toHaveBeenCalledTimes(2);
        });

        it('500 服务器错误触发重试', async () => {
            const err = Object.assign(new Error('Server error'), { response: { status: 500 } });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/messages', {});
            expect(result).toEqual({ ok: true });
        });

        it('网络错误 (isRetryableNetworkError) 触发重试', async () => {
            isRetryableNetworkError.mockReturnValue(true);
            const err = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: { ok: true } });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const result = await svc.callApi('/messages', {});
            expect(result).toEqual({ ok: true });
        });

        it('未知错误直接抛出', async () => {
            const err = Object.assign(new Error('Unknown'), { response: { status: 400 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new ClaudeApiService(createConfig());
            await expect(svc.callApi('/messages', {})).rejects.toThrow('Unknown');
        });

        it('调用 _applySidecar', async () => {
            getMockRequest().mockResolvedValueOnce({ data: {} });
            const svc = new ClaudeApiService(createConfig());
            const spy = jest.spyOn(svc, '_applySidecar');
            await svc.callApi('/messages', {});
            expect(spy).toHaveBeenCalled();
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
            const chunk = 'data: {"type":"content_block_delta","delta":{"text":"hello"}}\n\ndata: {"type":"message_stop"}\n\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toMatchObject({ type: 'content_block_delta' });
        });

        it('message_stop 时停止迭代', async () => {
            const chunk = 'data: {"type":"message_stop"}\n\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            expect(results.find(r => r.type === 'message_stop')).toBeDefined();
        });

        it('忽略解析失败的 JSON 块（仅警告）', async () => {
            const chunk = 'data: invalid-json\n\ndata: {"type":"message_stop"}\n\n';
            getMockRequest().mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig());
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            // 只有 message_stop 被解析
            expect(results.some(r => r.type === 'message_stop')).toBe(true);
        });

        it('流式 401 错误直接抛出', async () => {
            const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
            getMockRequest().mockRejectedValueOnce(err);
            const svc = new ClaudeApiService(createConfig());
            const gen = svc.streamApi('/messages', {});
            await expect(gen.next()).rejects.toThrow();
        });

        it('流式 429 错误触发重试', async () => {
            const err = Object.assign(new Error('Rate limit'), { response: { status: 429 } });
            const chunk = 'data: {"type":"message_stop"}\n\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            expect(results.some(r => r.type === 'message_stop')).toBe(true);
        });

        it('流式 500 错误触发重试', async () => {
            const err = Object.assign(new Error('Server error'), { response: { status: 500 } });
            const chunk = 'data: {"type":"message_stop"}\n\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            expect(results.length).toBeGreaterThan(0);
        });

        it('流式网络错误触发重试', async () => {
            isRetryableNetworkError.mockReturnValue(true);
            const err = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
            const chunk = 'data: {"type":"message_stop"}\n\n';
            getMockRequest()
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({ data: makeAsyncIterable([chunk]) });
            const svc = new ClaudeApiService(createConfig({ REQUEST_BASE_DELAY: 1 }));
            const results = [];
            for await (const item of svc.streamApi('/messages', {})) {
                results.push(item);
            }
            expect(results.length).toBeGreaterThan(0);
        });
    });

    // ─── generateContent ─────────────────────────────────────────────────────────

    describe('generateContent', () => {
        it('委托调用 callApi("/messages")', async () => {
            getMockRequest().mockResolvedValueOnce({ data: { content: 'hello' } });
            const svc = new ClaudeApiService(createConfig());
            const spy = jest.spyOn(svc, 'callApi');
            await svc.generateContent('claude-3', { messages: [] });
            expect(spy).toHaveBeenCalledWith('/messages', expect.any(Object));
        });

        it('从请求体删除 _monitorRequestId 并存入 config', async () => {
            getMockRequest().mockResolvedValueOnce({ data: {} });
            const svc = new ClaudeApiService(createConfig());
            const body = { messages: [], _monitorRequestId: 'req-123' };
            await svc.generateContent('claude-3', body);
            expect(body._monitorRequestId).toBeUndefined();
            expect(svc.config._monitorRequestId).toBe('req-123');
        });

        it('从请求体删除 _requestBaseUrl', async () => {
            getMockRequest().mockResolvedValueOnce({ data: {} });
            const svc = new ClaudeApiService(createConfig());
            const body = { messages: [], _requestBaseUrl: 'http://x.com' };
            await svc.generateContent('claude-3', body);
            expect(body._requestBaseUrl).toBeUndefined();
        });
    });

    // ─── generateContentStream ────────────────────────────────────────────────────

    describe('generateContentStream', () => {
        it('委托调用 streamApi("/messages") 并转发结果', async () => {
            const chunk = 'data: {"type":"content_block_delta"}\n\ndata: {"type":"message_stop"}\n\n';
            getMockRequest().mockResolvedValueOnce({
                data: {
                    [Symbol.asyncIterator]() {
                        let done = false;
                        return {
                            next() {
                                if (!done) {
                                    done = true;
                                    return Promise.resolve({ value: Buffer.from(chunk), done: false });
                                }
                                return Promise.resolve({ done: true });
                            }
                        };
                    }
                }
            });
            const svc = new ClaudeApiService(createConfig());
            const results = [];
            for await (const item of svc.generateContentStream('claude-3', { messages: [] })) {
                results.push(item);
            }
            expect(results.length).toBeGreaterThan(0);
        });
    });

    // ─── listModels ───────────────────────────────────────────────────────────────

    describe('listModels', () => {
        it('返回内置模型列表', async () => {
            const svc = new ClaudeApiService(createConfig());
            const result = await svc.listModels();
            expect(result).toHaveProperty('models');
            expect(Array.isArray(result.models)).toBe(true);
            expect(result.models.length).toBeGreaterThan(0);
        });

        it('模型列表包含 claude-sonnet 相关模型', async () => {
            const svc = new ClaudeApiService(createConfig());
            const result = await svc.listModels();
            const names = result.models.map(m => m.name);
            expect(names.some(n => n.includes('claude'))).toBe(true);
        });
    });

    // ─── _applySidecar ────────────────────────────────────────────────────────────

    describe('_applySidecar', () => {
        it('调用 configureTLSSidecar', () => {
            const svc = new ClaudeApiService(createConfig());
            const axiosConfig = {};
            svc._applySidecar(axiosConfig);
            expect(configureTLSSidecar).toHaveBeenCalledWith(
                axiosConfig,
                expect.any(Object),
                expect.any(String),
                expect.anything()
            );
        });
    });
});
