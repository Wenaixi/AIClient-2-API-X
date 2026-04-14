/**
 * OpenAIStrategy 单元测试
 * 覆盖：模型/流信息提取、响应文本提取、提示词提取、系统提示词应用
 */

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/converters/utils.js', () => ({
    applySystemPromptReplacements: jest.fn((text) => text),
}));

jest.mock('../../../src/utils/common.js', () => ({
    API_ACTIONS: {
        GENERATE_CONTENT: 'generateContent',
        STREAM_GENERATE_CONTENT: 'streamGenerateContent'
    },
    MODEL_PROTOCOL_PREFIX: {
        GEMINI: 'gemini',
        OPENAI: 'openai',
        CLAUDE: 'claude'
    },
    extractSystemPromptFromRequestBody: jest.fn(),
}));

import { OpenAIStrategy } from '../../../src/providers/openai/openai-strategy.js';
import logger from '../../../src/utils/logger.js';
import { extractSystemPromptFromRequestBody } from '../../../src/utils/common.js';

function createMockConfig(overrides = {}) {
    return {
        REQUEST_MAX_RETRIES: 3,
        REQUEST_BASE_DELAY: 1000,
        SYSTEM_PROMPT_FILE_PATH: null,
        SYSTEM_PROMPT_CONTENT: null,
        SYSTEM_PROMPT_MODE: 'replace',
        SYSTEM_PROMPT_REPLACEMENTS: [],
        ...overrides,
    };
}

function createStrategy(overrides = {}) {
    const config = createMockConfig(overrides);
    return new OpenAIStrategy(config);
}

beforeEach(() => {
    jest.clearAllMocks();
    extractSystemPromptFromRequestBody.mockReturnValue('');
});

describe('OpenAIStrategy', () => {

    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with config', () => {
            const config = createMockConfig();
            const strategy = new OpenAIStrategy(config);
            expect(strategy).toBeDefined();
        });
    });

    // --- extractModelAndStreamInfo ---

    describe('extractModelAndStreamInfo', () => {
        test('should extract model from requestBody', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'gpt-4' };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'gpt-4', isStream: false });
        });

        test('should extract model and isStream=true when stream is true', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'gpt-4', stream: true };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'gpt-4', isStream: true });
        });

        test('should return isStream=false when stream is explicitly false', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = { model: 'gpt-4', stream: false };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'gpt-4', isStream: false });
        });

        test('should handle missing model gracefully', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/chat/completions', headers: { host: 'localhost:3000' } };
            const body = {};
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result.model).toBeUndefined();
            expect(result.isStream).toBe(false);
        });
    });

    // --- extractResponseText ---

    describe('extractResponseText', () => {
        test('should extract text from message.content', () => {
            const strategy = createStrategy();
            const response = {
                choices: [{
                    message: { content: 'Hello world' }
                }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello world');
        });

        test('should extract delta.content for streaming responses', () => {
            const strategy = createStrategy();
            const response = {
                choices: [{
                    delta: { content: 'Hello' }
                }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello');
        });

        test('should extract tool_calls from delta', () => {
            const strategy = createStrategy();
            const response = {
                choices: [{
                    delta: {
                        tool_calls: [{ id: 'call_123', type: 'function', function: { name: 'test', arguments: '{}' } }]
                    }
                }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toEqual([{ id: 'call_123', type: 'function', function: { name: 'test', arguments: '{}' } }]);
        });

        test('should return empty string when no choices', () => {
            const strategy = createStrategy();
            const response = {};
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when choices is empty array', () => {
            const strategy = createStrategy();
            const response = { choices: [] };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when message has no content', () => {
            const strategy = createStrategy();
            const response = {
                choices: [{ message: {} }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });
    });

    // --- extractPromptText ---

    describe('extractPromptText', () => {
        test('should extract text from last message content', () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: 'Hello' }
                ]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('Hello');
        });

        test('should JSON stringify object content', () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: { text: 'Hello' } }
                ]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('{"text":"Hello"}');
        });

        test('should return empty string when no messages', () => {
            const strategy = createStrategy();
            const requestBody = {};
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });

        test('should return empty string when messages is empty array', () => {
            const strategy = createStrategy();
            const requestBody = { messages: [] };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });
    });

    // --- applySystemPromptFromFile ---

    describe('applySystemPromptFromFile', () => {
        test('should return requestBody unchanged when no SYSTEM_PROMPT_FILE_PATH', async () => {
            const strategy = createStrategy();
            const requestBody = { messages: [] };
            const result = await strategy.applySystemPromptFromFile({}, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should return requestBody when SYSTEM_PROMPT_CONTENT is null', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: null
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = { messages: [] };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should apply system prompt in replace mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'You are a helpful assistant',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = {
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
        });

        test('should apply system prompt in append mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Be concise',
                SYSTEM_PROMPT_MODE: 'append'
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = {
                messages: [
                    { role: 'system', content: 'You are smart' },
                    { role: 'user', content: 'Hello' }
                ]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('You are smart');
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.messages[0].content).toContain('You are smart');
            expect(result.messages[0].content).toContain('Be concise');
        });

        test('should update existing system message', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'New system prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = {
                messages: [
                    { role: 'system', content: 'Old system prompt' },
                    { role: 'user', content: 'Hello' }
                ]
            };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.messages[0].content).toBe('New system prompt');
        });

        test('should create messages array if missing', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'You are a helper',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = {};
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.messages).toBeDefined();
            expect(result.messages[0]).toEqual({ role: 'system', content: 'You are a helper' });
        });

        test('should call logger.info when applying system prompt', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Test prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new OpenAIStrategy(config);
            const requestBody = { messages: [] };
            await strategy.applySystemPromptFromFile(config, requestBody);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[System Prompt]'));
        });
    });

    // --- manageSystemPrompt ---

    describe('manageSystemPrompt', () => {
        test('should call _updateSystemPromptFile with OPENAI prefix', async () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [{ role: 'system', content: 'New system prompt' }]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('New system prompt');
            strategy._updateSystemPromptFile = jest.fn().mockResolvedValue(undefined);
            await strategy.manageSystemPrompt(requestBody);
            expect(strategy._updateSystemPromptFile).toHaveBeenCalledWith('New system prompt', 'openai');
        });
    });
});
