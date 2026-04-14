/**
 * GrokStrategy 单元测试
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

import { GrokStrategy } from '../../../src/providers/grok/grok-strategy.js';
import logger from '../../../src/utils/logger.js';

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
    return new GrokStrategy(config);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GrokStrategy', () => {

    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with config', () => {
            const config = createMockConfig();
            const strategy = new GrokStrategy(config);
            expect(strategy).toBeDefined();
        });
    });

    // --- extractModelAndStreamInfo ---

    describe('extractModelAndStreamInfo', () => {
        test('should extract model from requestBody with default', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/grok/chat', headers: { host: 'localhost:3000' } };
            const body = { model: 'grok-3' };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'grok-3', isStream: true });
        });

        test('should use default model when not specified', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/grok/chat', headers: { host: 'localhost:3000' } };
            const body = {};
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result.model).toBe('grok-3');
            expect(result.isStream).toBe(true);
        });

        test('should set isStream=false when stream is explicitly false', () => {
            const strategy = createStrategy();
            const req = { url: '/v1/grok/chat', headers: { host: 'localhost:3000' } };
            const body = { model: 'grok-2', stream: false };
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({ model: 'grok-2', isStream: false });
        });
    });

    // --- extractResponseText ---

    describe('extractResponseText', () => {
        test('should extract message from response', () => {
            const strategy = createStrategy();
            const response = { message: 'Hello world' };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello world');
        });

        test('should return empty string when no message', () => {
            const strategy = createStrategy();
            const response = {};
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when message is null', () => {
            const strategy = createStrategy();
            const response = { message: null };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });
    });

    // --- extractPromptText ---

    describe('extractPromptText', () => {
        test('should extract message from requestBody', () => {
            const strategy = createStrategy();
            const requestBody = { message: 'What is AI?' };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('What is AI?');
        });

        test('should return empty string when no message', () => {
            const strategy = createStrategy();
            const requestBody = {};
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });
    });

    // --- applySystemPromptFromFile ---

    describe('applySystemPromptFromFile', () => {
        test('should return requestBody unchanged when no SYSTEM_PROMPT_FILE_PATH', async () => {
            const strategy = createStrategy();
            const requestBody = { message: 'Hello' };
            const result = await strategy.applySystemPromptFromFile({}, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should return requestBody when SYSTEM_PROMPT_CONTENT is null', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: null
            });
            const strategy = new GrokStrategy(config);
            const requestBody = { message: 'Hello' };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should apply system prompt in replace mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'You are a helpful assistant',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GrokStrategy(config);
            const requestBody = { message: 'Hello' };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.message).toContain('You are a helpful assistant');
            expect(result.message).toContain('Hello');
        });

        test('should apply system prompt in append mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Be concise',
                SYSTEM_PROMPT_MODE: 'append'
            });
            const strategy = new GrokStrategy(config);
            const requestBody = { message: 'Hello' };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.message).toContain('Hello');
            expect(result.message).toContain('Be concise');
        });

        test('should handle empty message in replace mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'System prompt only',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GrokStrategy(config);
            const requestBody = { message: '' };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.message).toContain('System prompt only');
        });

        test('should call logger.info when applying system prompt', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Test prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GrokStrategy(config);
            const requestBody = { message: 'Hello' };
            await strategy.applySystemPromptFromFile(config, requestBody);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[System Prompt]'));
        });
    });

    // --- manageSystemPrompt ---

    describe('manageSystemPrompt', () => {
        test('should not throw when called (not implemented yet)', async () => {
            const strategy = createStrategy();
            const requestBody = { message: 'New system prompt' };
            // This method is not implemented yet, should not throw
            await expect(strategy.manageSystemPrompt(requestBody)).resolves.toBeUndefined();
        });
    });
});
