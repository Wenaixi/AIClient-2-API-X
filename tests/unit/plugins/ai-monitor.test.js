/**
 * AI Monitor 插件单元测试
 * 测试 AI 接口监控插件的请求捕获、响应监控和流式响应聚合功能
 */

import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Import the plugin after mocking
import { default as aiMonitorPlugin } from '../../../src/plugins/ai-monitor/index.js';
import logger from '../../../src/utils/logger.js';

describe('AI Monitor Plugin', () => {
    beforeEach(() => {
        // Clear all mocks and stream cache before each test
        jest.clearAllMocks();
        aiMonitorPlugin.streamCache.clear();
    });

    afterEach(() => {
        // Clean up stream cache after each test
        aiMonitorPlugin.streamCache.clear();
    });

    describe('Plugin Metadata', () => {
        test('should have correct name', () => {
            expect(aiMonitorPlugin.name).toBe('ai-monitor');
        });

        test('should have correct version', () => {
            expect(aiMonitorPlugin.version).toBe('1.0.0');
        });

        test('should have correct type', () => {
            expect(aiMonitorPlugin.type).toBe('middleware');
        });

        test('should have priority set', () => {
            expect(aiMonitorPlugin._priority).toBe(100);
        });
    });

    describe('init', () => {
        test('should log initialization message', async () => {
            await aiMonitorPlugin.init({});
            expect(logger.info).toHaveBeenCalledWith('[AI Monitor Plugin] Initialized');
        });
    });

    describe('middleware', () => {
        test('should return handled: false for non-AI paths', async () => {
            const req = { method: 'POST' };
            const res = {};
            const requestUrl = { pathname: '/v1/models' };
            const config = {};

            const result = await aiMonitorPlugin.middleware(req, res, requestUrl, config);

            expect(result).toEqual({ handled: false });
            expect(config._monitorRequestId).toBeUndefined();
        });

        test('should return handled: false for GET requests on AI paths', async () => {
            const req = { method: 'GET' };
            const res = {};
            const requestUrl = { pathname: '/v1/chat/completions' };
            const config = {};

            const result = await aiMonitorPlugin.middleware(req, res, requestUrl, config);

            expect(result).toEqual({ handled: false });
            expect(config._monitorRequestId).toBeUndefined();
        });

        test('should set request ID for POST requests on AI paths', async () => {
            const req = { method: 'POST' };
            const res = {};
            const requestUrl = { pathname: '/v1/chat/completions' };
            const config = {};

            const result = await aiMonitorPlugin.middleware(req, res, requestUrl, config);

            expect(result).toEqual({ handled: false });
            expect(config._monitorRequestId).toBeDefined();
            expect(typeof config._monitorRequestId).toBe('string');
        });

        test.each([
            '/v1/chat/completions',
            '/v1/chat/completions/',
            '/api/v1/chat/completions',
            '/v1/responses',
            '/v1/messages',
            '/v1beta/models'
        ])('should recognize AI path: %s', async (pathname) => {
            const req = { method: 'POST' };
            const requestUrl = { pathname };
            const config = {};

            await aiMonitorPlugin.middleware(req, {}, requestUrl, config);

            expect(config._monitorRequestId).toBeDefined();
        });

        test.each([
            '/v1/models',
            '/v1/completions',
            '/auth/login',
            '/users'
        ])('should not recognize non-AI path: %s', async (pathname) => {
            const req = { method: 'POST' };
            const requestUrl = { pathname };
            const config = {};

            await aiMonitorPlugin.middleware(req, {}, requestUrl, config);

            expect(config._monitorRequestId).toBeUndefined();
        });
    });

    describe('hooks.onContentGenerated', () => {
        test('should return early when originalRequestBody is missing', async () => {
            const config = {
                processedRequestBody: { model: 'test' },
                fromProvider: 'openai',
                toProvider: 'kimi'
            };

            await aiMonitorPlugin.hooks.onContentGenerated(config);

            // Should not log anything
            expect(logger.info).not.toHaveBeenCalled();
        });

        test('should log request info with conversion details', async () => {
            const config = {
                originalRequestBody: { model: 'gpt-4', messages: [] },
                processedRequestBody: { model: 'moonshot-v1-8k', messages: [] },
                fromProvider: 'openai',
                toProvider: 'kimi',
                model: 'moonshot-v1-8k',
                _monitorRequestId: 'test123',
                isStream: false
            };

            await aiMonitorPlugin.hooks.onContentGenerated(config);

            // Wait for setImmediate to execute
            await new Promise(resolve => setImmediate(resolve));

            expect(logger.info).toHaveBeenCalled();
            const logCalls = logger.info.mock.calls;

            // Should log the protocol conversion
            const protocolLog = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][test123] >>> Req Protocol')
            );
            expect(protocolLog).toBeDefined();

            // Should log original and processed bodies
            const originalLog = logCalls.find(call =>
                call[0] && call[0].includes('[Req Original]')
            );
            expect(originalLog).toBeDefined();

            const processedLog = logCalls.find(call =>
                call[0] && call[0].includes('[Req Processed]')
            );
            expect(processedLog).toBeDefined();
        });

        test('should log request info without conversion when bodies are equal', async () => {
            const sameBody = { model: 'gpt-4', messages: [] };
            const config = {
                originalRequestBody: sameBody,
                processedRequestBody: sameBody,
                fromProvider: 'openai',
                toProvider: 'openai',
                model: 'gpt-4',
                _monitorRequestId: 'test456',
                isStream: false
            };

            await aiMonitorPlugin.hooks.onContentGenerated(config);

            await new Promise(resolve => setImmediate(resolve));

            // Should log without conversion indicator
            const logCalls = logger.info.mock.calls;
            const protocolLog = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][test456] >>> Req Protocol')
            );
            expect(protocolLog).toBeDefined();
            expect(protocolLog[0]).not.toContain('->');
        });
    });

    describe('hooks.onUnaryResponse', () => {
        test('should log unary response with conversion details', async () => {
            const config = {
                nativeResponse: { choices: [{ message: 'hi' }] },
                clientResponse: { choices: [{ message: { role: 'assistant', content: 'hi' } }] },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'req789'
            };

            await aiMonitorPlugin.hooks.onUnaryResponse(config);

            await new Promise(resolve => setImmediate(resolve));

            const logCalls = logger.info.mock.calls;

            const protocolLog = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][req789] <<< Res Protocol')
            );
            expect(protocolLog).toBeDefined();
        });

        test('should use N/A for missing requestId', async () => {
            const config = {
                nativeResponse: { result: 'test' },
                clientResponse: { result: 'test' },
                fromProvider: 'openai',
                toProvider: 'openai'
            };

            await aiMonitorPlugin.hooks.onUnaryResponse(config);

            await new Promise(resolve => setImmediate(resolve));

            const logCalls = logger.info.mock.calls;
            const protocolLog = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][N/A]')
            );
            expect(protocolLog).toBeDefined();
        });

        test('should handle native and client response comparison', async () => {
            const nativeResponse = { result: 'native' };
            const clientResponse = { result: 'client' };
            const config = {
                nativeResponse,
                clientResponse,
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'compare123'
            };

            await aiMonitorPlugin.hooks.onUnaryResponse(config);

            await new Promise(resolve => setImmediate(resolve));

            const logCalls = logger.info.mock.calls;

            // Should log both native and converted responses when they differ
            const nativeLog = logCalls.find(call =>
                call[0] && call[0].includes('[Res Native]')
            );
            const convertedLog = logCalls.find(call =>
                call[0] && call[0].includes('[Res Converted]')
            );

            expect(nativeLog).toBeDefined();
            expect(convertedLog).toBeDefined();
        });
    });

    describe('hooks.onStreamChunk', () => {
        test('should return early when requestId is missing', async () => {
            const config = {
                nativeChunk: { content: 'chunk1' },
                chunkToSend: { content: 'chunk1' },
                fromProvider: 'openai',
                toProvider: 'kimi'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            // Should not create cache entry
            expect(aiMonitorPlugin.streamCache.size).toBe(0);
        });

        test('should create cache entry for new stream', async () => {
            const config = {
                nativeChunk: { delta: 'hello' },
                chunkToSend: { delta: 'hello' },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'stream123'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            expect(aiMonitorPlugin.streamCache.has('stream123')).toBe(true);

            const cache = aiMonitorPlugin.streamCache.get('stream123');
            expect(cache.fromProvider).toBe('openai');
            expect(cache.toProvider).toBe('kimi');
            expect(cache.nativeChunks).toEqual([{ delta: 'hello' }]);
            expect(cache.convertedChunks).toEqual([{ delta: 'hello' }]);
        });

        test('should append chunks to existing cache', async () => {
            const config1 = {
                nativeChunk: { delta: 'hello' },
                chunkToSend: { delta: 'hello' },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'stream456'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config1);

            const config2 = {
                nativeChunk: { delta: ' world' },
                chunkToSend: { delta: ' world' },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'stream456'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config2);

            const cache = aiMonitorPlugin.streamCache.get('stream456');
            expect(cache.nativeChunks).toHaveLength(2);
            expect(cache.nativeChunks).toEqual([{ delta: 'hello' }, { delta: ' world' }]);
        });

        test('should filter null values from nativeChunk', async () => {
            const config = {
                nativeChunk: [null, { delta: 'valid' }, null],
                chunkToSend: { delta: 'valid' },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'filter123'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            const cache = aiMonitorPlugin.streamCache.get('filter123');
            expect(cache.nativeChunks).toEqual([{ delta: 'valid' }]);
        });

        test('should handle null nativeChunk', async () => {
            const config = {
                nativeChunk: null,
                chunkToSend: { delta: 'hello' },
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'nullnative'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            const cache = aiMonitorPlugin.streamCache.get('nullnative');
            expect(cache.nativeChunks).toEqual([]);
            expect(cache.convertedChunks).toEqual([{ delta: 'hello' }]);
        });

        test('should handle null chunkToSend', async () => {
            const config = {
                nativeChunk: { delta: 'hello' },
                chunkToSend: null,
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'nullchunk'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            const cache = aiMonitorPlugin.streamCache.get('nullchunk');
            expect(cache.nativeChunks).toEqual([{ delta: 'hello' }]);
            expect(cache.convertedChunks).toEqual([]);
        });

        test('should handle undefined values in arrays', async () => {
            const config = {
                nativeChunk: [undefined, { delta: 'valid' }],
                chunkToSend: [{ content: 'a' }, undefined, { content: 'b' }],
                fromProvider: 'openai',
                toProvider: 'kimi',
                requestId: 'undef123'
            };

            await aiMonitorPlugin.hooks.onStreamChunk(config);

            const cache = aiMonitorPlugin.streamCache.get('undef123');
            expect(cache.nativeChunks).toEqual([{ delta: 'valid' }]);
            expect(cache.convertedChunks).toEqual([{ content: 'a' }, { content: 'b' }]);
        });
    });

    describe('hooks.onInternalRequestConverted', () => {
        test('should log internal request conversion', async () => {
            const config = {
                requestId: 'internal123',
                internalRequest: { model: 'test', prompt: 'hello' },
                converterName: 'TestConverter'
            };

            await aiMonitorPlugin.hooks.onInternalRequestConverted(config);

            await new Promise(resolve => setImmediate(resolve));

            const logCalls = logger.info.mock.calls;
            const log = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][internal123] >>> Internal Req Converted [TestConverter]')
            );
            expect(log).toBeDefined();
        });

        test('should use N/A for missing requestId', async () => {
            const config = {
                internalRequest: { model: 'test' },
                converterName: 'TestConverter'
            };

            await aiMonitorPlugin.hooks.onInternalRequestConverted(config);

            await new Promise(resolve => setImmediate(resolve));

            const logCalls = logger.info.mock.calls;
            const log = logCalls.find(call =>
                call[0] && call[0].includes('[AI Monitor][N/A]')
            );
            expect(log).toBeDefined();
        });
    });

    describe('Stream Cache', () => {
        test('should be a Map', () => {
            expect(aiMonitorPlugin.streamCache).toBeInstanceOf(Map);
        });

        test('should store multiple stream caches with different IDs', async () => {
            const configs = [
                { nativeChunk: { id: 1 }, chunkToSend: { id: 1 }, fromProvider: 'a', toProvider: 'b', requestId: 'stream1' },
                { nativeChunk: { id: 2 }, chunkToSend: { id: 2 }, fromProvider: 'c', toProvider: 'd', requestId: 'stream2' },
            ];

            for (const config of configs) {
                await aiMonitorPlugin.hooks.onStreamChunk(config);
            }

            expect(aiMonitorPlugin.streamCache.size).toBe(2);
            expect(aiMonitorPlugin.streamCache.has('stream1')).toBe(true);
            expect(aiMonitorPlugin.streamCache.has('stream2')).toBe(true);
        });
    });
});
