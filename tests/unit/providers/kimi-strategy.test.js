/**
 * KimiStrategy 深度单元测试
 * 覆盖：构造、格式转换、响应提取、健康检查、模型列表、流式处理
 */

import { KimiStrategy } from '../../../src/providers/kimi/kimi-strategy.js';

// Mock dependencies
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));
jest.mock('../../../src/utils/provider-strategy.js', () => {
    return {
        ProviderStrategy: class ProviderStrategy {
            extractModelAndStreamInfo() { throw new Error('Not implemented'); }
            extractResponseText() { throw new Error('Not implemented'); }
            extractPromptText() { throw new Error('Not implemented'); }
            _updateSystemPromptFile() { throw new Error('Not implemented'); }
        }
    };
});
jest.mock('../../../src/providers/kimi/kimi-core.js', () => {
    return {
        KimiApiService: jest.fn().mockImplementation(() => ({
            setTokenStorage: jest.fn(),
            chatCompletion: jest.fn(),
            chatCompletionStream: jest.fn(),
            listModels: jest.fn(),
            getAccessToken: jest.fn(),
        })),
    };
});

import logger from '../../../src/utils/logger.js';
import { KimiApiService } from '../../../src/providers/kimi/kimi-core.js';

function createMockConfig(overrides = {}) {
    return {
        REQUEST_MAX_RETRIES: 3,
        REQUEST_BASE_DELAY: 1000,
        USE_SYSTEM_PROXY_KIMI: false,
        ...overrides,
    };
}

function createStrategy(overrides = {}) {
    const config = createMockConfig(overrides);
    return new KimiStrategy(config);
}

beforeEach(() => {
    jest.clearAllMocks();
    KimiApiService.mockClear();
});

describe('KimiStrategy', () => {
    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with config', () => {
            const config = createMockConfig();
            const strategy = new KimiStrategy(config);
            expect(strategy).toBeDefined();
            expect(strategy.config).toBe(config);
            expect(strategy.providerName).toBe('kimi');
        });

        test('should create KimiApiService instance', () => {
            new KimiStrategy(createMockConfig());
            expect(KimiApiService).toHaveBeenCalledWith(createMockConfig());
        });
    });

    // --- setAuth ---

    describe('setAuth', () => {
        test('should set token storage on api service', () => {
            const strategy = createStrategy();
            const tokenStorage = { access_token: 'tok' };
            strategy.setAuth(tokenStorage);
            expect(strategy.apiService.setTokenStorage).toHaveBeenCalledWith(tokenStorage);
        });
    });

    // --- extractModelAndStreamInfo ---

    describe('extractModelAndStreamInfo', () => {
        test('should extract model and stream flag from request body', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'kimi-k2', stream: true };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'kimi-k2', isStream: true });
        });

        test('should handle non-streaming request', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'k2', stream: false };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result.isStream).toBe(false);
            expect(result.model).toBe('k2');
        });

        test('should handle missing model field', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { messages: [] };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result.model).toBe('');
        });

        test('should handle missing stream field', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'k2' };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result.isStream).toBe(false);
        });
    });

    // --- extractResponseText ---

    describe('extractResponseText', () => {
        test('should extract content from choices', () => {
            const strategy = createStrategy();
            const response = { choices: [{ message: { content: 'Hello world' } }] };
            expect(strategy.extractResponseText(response)).toBe('Hello world');
        });

        test('should handle empty choices', () => {
            const strategy = createStrategy();
            expect(strategy.extractResponseText({ choices: [] })).toBe('');
        });

        test('should handle missing choices', () => {
            const strategy = createStrategy();
            expect(strategy.extractResponseText({})).toBe('');
        });

        test('should handle missing message.content', () => {
            const strategy = createStrategy();
            expect(strategy.extractResponseText({ choices: [{ message: {} }] })).toBe('');
        });

        test('should handle null message', () => {
            const strategy = createStrategy();
            expect(strategy.extractResponseText({ choices: [{ message: null }] })).toBe('');
        });
    });

    // --- extractPromptText ---

    describe('extractPromptText', () => {
        test('should extract last message content', () => {
            const strategy = createStrategy();
            const body = { messages: [
                { role: 'user', content: 'First message' },
                { role: 'assistant', content: 'Second message' },
            ] };
            expect(strategy.extractPromptText(body)).toBe('Second message');
        });

        test('should handle empty messages', () => {
            const strategy = createStrategy();
            expect(strategy.extractPromptText({ messages: [] })).toBe('');
        });

        test('should handle missing messages', () => {
            const strategy = createStrategy();
            expect(strategy.extractPromptText({})).toBe('');
        });

        test('should handle message without content', () => {
            const strategy = createStrategy();
            expect(strategy.extractPromptText({ messages: [{ role: 'user' }] })).toBe('');
        });
    });

    // --- handleChatCompletion ---

    describe('handleChatCompletion', () => {
        test('should call apiService.chatCompletion with openai format', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletion.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });

            const body = { model: 'k2', messages: [{ role: 'user', content: 'Hi' }] };
            const result = await strategy.handleChatCompletion(body, 'openai');
            expect(result).toEqual({ choices: [{ message: { content: 'OK' } }] });
            expect(strategy.apiService.chatCompletion).toHaveBeenCalledWith(body);
        });

        test('should convert claude format to openai before calling', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletion.mockResolvedValue({ choices: [] });

            const claudeBody = {
                model: 'k2',
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1000,
                temperature: 0.7,
            };
            await strategy.handleChatCompletion(claudeBody, 'claude');

            const convertedBody = strategy.apiService.chatCompletion.mock.calls[0][0];
            expect(convertedBody.model).toBe('k2');
            expect(convertedBody.max_tokens).toBe(1000);
            expect(convertedBody.temperature).toBe(0.7);
        });

        test('should convert response to claude format when sourceFormat is claude', async () => {
            const strategy = createStrategy();
            const openaiResponse = {
                id: 'resp-1',
                choices: [{ message: { content: 'Hello' } }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            strategy.apiService.chatCompletion.mockResolvedValue(openaiResponse);

            const body = { model: 'k2', messages: [{ role: 'user', content: 'Hi' }] };
            const result = await strategy.handleChatCompletion(body, 'claude');

            expect(result.type).toBe('message');
            expect(result.role).toBe('assistant');
            expect(result.content).toBe('Hello');
            // convertOpenAIResponseToClaude is called without model arg, so model is undefined
            expect(result.model).toBeUndefined();
        });

        test('should propagate errors', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletion.mockRejectedValue(new Error('API Error'));

            await expect(strategy.handleChatCompletion({ model: 'k2' }, 'openai'))
                .rejects.toThrow('API Error');
        });
    });

    // --- handleChatCompletionStream ---

    describe('handleChatCompletionStream', () => {
        test('should yield chunks from apiService', async () => {
            const strategy = createStrategy();
            const chunks = [{ id: '1' }, { id: '2' }];
            strategy.apiService.chatCompletionStream.mockImplementation(async function* () {
                for (const chunk of chunks) yield chunk;
            });

            const results = [];
            for await (const chunk of strategy.handleChatCompletionStream({ model: 'k2' }, 'openai')) {
                results.push(chunk);
            }
            expect(results).toEqual(chunks);
        });

        test('should convert to claude format when sourceFormat is claude', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletionStream.mockImplementation(async function* () {
                yield { choices: [{ delta: { content: 'Hello' } }] };
            });

            const results = [];
            for await (const chunk of strategy.handleChatCompletionStream({ model: 'k2' }, 'claude')) {
                results.push(chunk);
            }
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe('content_block_delta');
            expect(results[0].delta.type).toBe('text_delta');
        });

        test('should filter out null chunks from claude conversion', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletionStream.mockImplementation(async function* () {
                yield { choices: [] }; // Will produce null from convertStreamChunkToClaude
            });

            const results = [];
            for await (const chunk of strategy.handleChatCompletionStream({ model: 'k2' }, 'claude')) {
                results.push(chunk);
            }
            expect(results).toHaveLength(0);
        });

        test('should propagate errors', async () => {
            const strategy = createStrategy();
            strategy.apiService.chatCompletionStream.mockImplementation(async function* () {
                throw new Error('Stream error');
            });

            await expect(async () => {
                for await (const _ of strategy.handleChatCompletionStream({ model: 'k2' }, 'openai')) {}
            }).rejects.toThrow('Stream error');
        });
    });

    // --- convertClaudeToOpenAI ---

    describe('convertClaudeToOpenAI', () => {
        test('should convert claude request fields to openai format', () => {
            const strategy = createStrategy();
            const claudeReq = {
                model: 'k2',
                messages: [{ role: 'user', content: 'Hi' }],
                system: 'You are helpful',
                max_tokens: 1000,
                temperature: 0.7,
                top_p: 0.9,
                stream: true,
            };
            const result = strategy.convertClaudeToOpenAI(claudeReq);
            expect(result).toEqual({
                model: 'k2',
                messages: [{ role: 'user', content: 'Hi' }],
                system: 'You are helpful',
                max_tokens: 1000,
                temperature: 0.7,
                top_p: 0.9,
                stream: true,
            });
        });

        test('should remove undefined values', () => {
            const strategy = createStrategy();
            const claudeReq = {
                model: 'k2',
                messages: [],
            };
            const result = strategy.convertClaudeToOpenAI(claudeReq);
            expect(result.system).toBeUndefined();
            expect(result.max_tokens).toBeUndefined();
            expect(result.temperature).toBeUndefined();
        });

        test('should handle system_instruction field', () => {
            const strategy = createStrategy();
            const claudeReq = {
                model: 'k2',
                messages: [],
                system_instruction: 'Be nice',
            };
            const result = strategy.convertClaudeToOpenAI(claudeReq);
            expect(result.system).toBe('Be nice');
        });
    });

    // --- convertOpenAIResponseToClaude ---

    describe('convertOpenAIResponseToClaude', () => {
        test('should convert openai response to claude format', () => {
            const strategy = createStrategy();
            const openaiResp = {
                id: 'resp-1',
                choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = strategy.convertOpenAIResponseToClaude(openaiResp, 'k2');
            expect(result.type).toBe('message');
            expect(result.role).toBe('assistant');
            expect(result.content).toBe('Hello');
            expect(result.model).toBe('k2');
            expect(result.stop_reason).toBe('end_turn');
        });

        test('should handle missing choices', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude({}, 'k2');
            expect(result.content).toBe('');
        });

        test('should generate id when missing', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude({ choices: [] }, 'k2');
            expect(result.id).toMatch(/^kimi-/);
        });

        test('should map stop finish_reason to max_tokens', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude(
                { choices: [{ finish_reason: 'length' }] }, 'k2'
            );
            expect(result.stop_reason).toBe('max_tokens');
        });

        test('should map tool_calls finish_reason to tool_use', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude(
                { choices: [{ finish_reason: 'tool_calls' }] }, 'k2'
            );
            expect(result.stop_reason).toBe('tool_use');
        });

        test('should map content_filter finish_reason to stop_sequence', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude(
                { choices: [{ finish_reason: 'content_filter' }] }, 'k2'
            );
            expect(result.stop_reason).toBe('stop_sequence');
        });

        test('should default to end_turn for unknown finish_reason', () => {
            const strategy = createStrategy();
            const result = strategy.convertOpenAIResponseToClaude(
                { choices: [{ finish_reason: 'unknown' }] }, 'k2'
            );
            expect(result.stop_reason).toBe('end_turn');
        });
    });

    // --- convertStreamChunkToClaude ---

    describe('convertStreamChunkToClaude', () => {
        test('should convert text delta chunk', () => {
            const strategy = createStrategy();
            const chunk = { choices: [{ delta: { content: 'Hello' } }] };
            const result = strategy.convertStreamChunkToClaude(chunk);
            expect(result.type).toBe('content_block_delta');
            expect(result.delta.type).toBe('text_delta');
            expect(result.delta.text).toBe('Hello');
        });

        test('should convert tool_calls delta chunk', () => {
            const strategy = createStrategy();
            const chunk = { choices: [{ delta: { tool_calls: [{ function: { arguments: '{"query": "search"}' } }] } }] };
            const result = strategy.convertStreamChunkToClaude(chunk);
            expect(result.type).toBe('content_block_delta');
            expect(result.delta.type).toBe('input_json_delta');
            expect(result.delta.partial_json).toContain('search');
        });

        test('should return message_delta on finish', () => {
            const strategy = createStrategy();
            const chunk = { choices: [{ delta: {}, finish_reason: 'stop' }] };
            const result = strategy.convertStreamChunkToClaude(chunk);
            expect(result.type).toBe('message_delta');
            expect(result.delta.stop_reason).toBe('end_turn');
        });

        test('should return null when no choices', () => {
            const strategy = createStrategy();
            expect(strategy.convertStreamChunkToClaude({})).toBeNull();
        });

        test('should return null when no delta', () => {
            const strategy = createStrategy();
            expect(strategy.convertStreamChunkToClaude({ choices: [{}] })).toBeNull();
        });

        test('should return null on conversion error', () => {
            const strategy = createStrategy();
            // Pass invalid data that will cause an error in the conversion
            expect(strategy.convertStreamChunkToClaude(null)).toBeNull();
        });
    });

    // --- mapFinishReason ---

    describe('mapFinishReason', () => {
        test('should map stop to end_turn', () => {
            expect(createStrategy().mapFinishReason('stop')).toBe('end_turn');
        });

        test('should map length to max_tokens', () => {
            expect(createStrategy().mapFinishReason('length')).toBe('max_tokens');
        });

        test('should map tool_calls to tool_use', () => {
            expect(createStrategy().mapFinishReason('tool_calls')).toBe('tool_use');
        });

        test('should map content_filter to stop_sequence', () => {
            expect(createStrategy().mapFinishReason('content_filter')).toBe('stop_sequence');
        });

        test('should default to end_turn for unknown reasons', () => {
            expect(createStrategy().mapFinishReason('anything')).toBe('end_turn');
        });

        test('should handle null reason', () => {
            expect(createStrategy().mapFinishReason(null)).toBe('end_turn');
        });

        test('should handle undefined reason', () => {
            expect(createStrategy().mapFinishReason(undefined)).toBe('end_turn');
        });
    });

    // --- listModels ---

    describe('listModels', () => {
        test('should return models from apiService', async () => {
            const strategy = createStrategy();
            const models = { data: [{ id: 'kimi-k2' }] };
            strategy.apiService.listModels.mockResolvedValue(models);

            const result = await strategy.listModels();
            expect(result).toEqual(models);
            expect(strategy.apiService.listModels).toHaveBeenCalled();
        });

        test('should propagate errors', async () => {
            const strategy = createStrategy();
            strategy.apiService.listModels.mockRejectedValue(new Error('List failed'));

            await expect(strategy.listModels()).rejects.toThrow('List failed');
        });
    });

    // --- healthCheck ---

    describe('healthCheck', () => {
        test('should return healthy status when token is valid', async () => {
            const strategy = createStrategy();
            strategy.apiService.getAccessToken.mockResolvedValue('valid_token');

            const result = await strategy.healthCheck();
            expect(result).toEqual({ status: 'healthy', provider: 'kimi' });
        });

        test('should return unhealthy status when token refresh fails', async () => {
            const strategy = createStrategy();
            strategy.apiService.getAccessToken.mockRejectedValue(new Error('Token expired'));

            const result = await strategy.healthCheck();
            expect(result).toEqual({ status: 'unhealthy', provider: 'kimi', error: 'Token expired' });
        });
    });

    // --- applySystemPromptFromFile ---

    describe('applySystemPromptFromFile', () => {
        test('should return request body unchanged when no system prompt file', async () => {
            const strategy = createStrategy();
            const config = {};
            const body = { model: 'k2', messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, body);
            expect(result).toBe(body);
        });

        test('should return request body unchanged when SYSTEM_PROMPT_CONTENT is null', async () => {
            const strategy = createStrategy();
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: null,
            };
            const body = { model: 'k2', messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, body);
            expect(result).toBe(body);
        });

        test('should replace system prompt in append mode when no existing prompt', async () => {
            const strategy = createStrategy();
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'New system prompt',
                SYSTEM_PROMPT_MODE: 'append',
            };
            const body = { model: 'k2', messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, body);
            expect(result.system).toBe('New system prompt');
        });

        test('should append system prompt when existing prompt exists', async () => {
            const strategy = createStrategy();
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'File prompt',
                SYSTEM_PROMPT_MODE: 'append',
            };
            const body = { model: 'k2', system: 'Existing prompt', messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, body);
            expect(result.system).toBe('Existing prompt\nFile prompt');
        });

        test('should replace system prompt in replace mode', async () => {
            const strategy = createStrategy();
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'New prompt',
                SYSTEM_PROMPT_MODE: 'replace',
            };
            const body = { model: 'k2', system: 'Old prompt', messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, body);
            expect(result.system).toBe('New prompt');
        });
    });
});
