/**
 * ClaudeStrategy 单元测试
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

import { ClaudeStrategy } from '../../../src/providers/claude/claude-strategy.js';
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
    return new ClaudeStrategy(config);
}

beforeEach(() => {
    jest.clearAllMocks();
    extractSystemPromptFromRequestBody.mockReturnValue('');
});

describe('ClaudeStrategy', () => {

    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with config', () => {
            const config = createMockConfig();
            const strategy = new ClaudeStrategy(config);
            expect(strategy).toBeDefined();
        });
    });

    // --- extractModelAndStreamInfo ---

    describe('extractModelAndStreamInfo', () => {
        test('should extract model from requestBody', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/messages', headers: { host: 'localhost:3000' } };
            const body = { model: 'claude-3-opus' };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'claude-3-opus', isStream: false });
        });

        test('should extract model and isStream=true when stream is true', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/messages', headers: { host: 'localhost:3000' } };
            const body = { model: 'claude-3-opus', stream: true };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'claude-3-opus', isStream: true });
        });

        test('should return isStream=false when stream is explicitly false', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/messages', headers: { host: 'localhost:3000' } };
            const body = { model: 'claude-3-opus', stream: false };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'claude-3-opus', isStream: false });
        });
    });

    // --- extractResponseText ---

    describe('extractResponseText', () => {
        test('should extract text_delta from content_block_delta', () => {
            const strategy = createStrategy();
            const response = {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Hello world' }
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello world');
        });

        test('should extract input_json_delta from content_block_delta', () => {
            const strategy = createStrategy();
            const response = {
                type: 'content_block_delta',
                delta: { type: 'input_json_delta', partial_json: '{"key":' }
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('{"key":');
        });

        test('should extract text from content array', () => {
            const strategy = createStrategy();
            const response = {
                content: [
                    { type: 'text', text: 'Hello' },
                    { type: 'text', text: ' World' }
                ]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello World');
        });

        test('should extract text from content.type=text object', () => {
            const strategy = createStrategy();
            const response = {
                content: { type: 'text', text: 'Hello world' }
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello world');
        });

        test('should filter out blocks without text', () => {
            const strategy = createStrategy();
            const response = {
                content: [
                    { type: 'text', text: 'Hello' },
                    { type: 'tool_use' },
                    { type: 'text', text: 'World' }
                ]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('HelloWorld');
        });

        test('should return empty string for content_block_delta without delta', () => {
            const strategy = createStrategy();
            const response = {
                type: 'content_block_delta',
                delta: {}
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when no content', () => {
            const strategy = createStrategy();
            const response = {};
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when content is empty array', () => {
            const strategy = createStrategy();
            const response = { content: [] };
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

        test('should extract from nested content array', () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
                ]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('Hello');
        });

        test('should join multiple text blocks', () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'World' }] }
                ]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('Hello World');
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

        test('should handle string content', () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [
                    { role: 'user', content: 'Hello' }
                ]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('Hello');
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
            const strategy = new ClaudeStrategy(config);
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
            const strategy = new ClaudeStrategy(config);
            const requestBody = {
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.system).toBe('You are a helpful assistant');
        });

        test('should apply system prompt in append mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Be concise',
                SYSTEM_PROMPT_MODE: 'append'
            });
            const strategy = new ClaudeStrategy(config);
            const requestBody = {
                messages: [{ role: 'user', content: 'Hello' }]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('Existing prompt');
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.system).toContain('Existing prompt');
            expect(result.system).toContain('Be concise');
        });

        test('should call logger.info when applying system prompt', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Test prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new ClaudeStrategy(config);
            const requestBody = { messages: [] };
            await strategy.applySystemPromptFromFile(config, requestBody);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[System Prompt]'));
        });
    });

    // --- manageSystemPrompt ---

    describe('manageSystemPrompt', () => {
        test('should call _updateSystemPromptFile with CLAUDE prefix', async () => {
            const strategy = createStrategy();
            const requestBody = {
                messages: [{ role: 'system', content: 'New system prompt' }]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('New system prompt');
            strategy._updateSystemPromptFile = jest.fn().mockResolvedValue(undefined);
            await strategy.manageSystemPrompt(requestBody);
            expect(strategy._updateSystemPromptFile).toHaveBeenCalledWith('New system prompt', 'claude');
        });
    });
});
