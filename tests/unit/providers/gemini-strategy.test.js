/**
 * GeminiStrategy 深度单元测试
 * 覆盖：构造、格式转换、响应提取、系统提示词应用
 */

// Mock external dependencies BEFORE importing the module under test
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/converters/utils.js', () => ({
    applySystemPromptReplacements: jest.fn((text) => text),
}));

// Mock common.js entirely to avoid circular dependencies
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

import { GeminiStrategy } from '../../../src/providers/gemini/gemini-strategy.js';
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
    return new GeminiStrategy(config);
}

beforeEach(() => {
    jest.clearAllMocks();
    extractSystemPromptFromRequestBody.mockReturnValue('');
});

describe('GeminiStrategy', () => {

    // --- Constructor ---

    describe('constructor', () => {
        test('should create instance with config', () => {
            const config = createMockConfig();
            const strategy = new GeminiStrategy(config);
            expect(strategy).toBeDefined();
            expect(strategy.providerName).toBe('gemini');
        });
    });

    // --- extractModelAndStreamInfo ---

    describe('extractModelAndStreamInfo', () => {
        test('should extract model and stream info from generate_content URL', () => {
            const strategy = createStrategy();
            const req = {
                url: '/v1beta/models/gemini-pro:generateContent',
                headers: { host: 'localhost:3000' }
            };
            const body = {};
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({
                model: 'gemini-pro',
                isStream: false
            });
        });

        test('should extract model and stream=true from stream_generate_content URL', () => {
            const strategy = createStrategy();
            const req = {
                url: '/v1beta/models/gemini-2.0-flash:streamGenerateContent',
                headers: { host: 'localhost:3000' }
            };
            const body = {};
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({
                model: 'gemini-2.0-flash',
                isStream: true
            });
        });

        test('should handle complex model names with versions', () => {
            const strategy = createStrategy();
            const req = {
                url: '/v1beta/models/gemini-1.5-pro-002:generateContent',
                headers: { host: 'localhost:3000' }
            };
            const body = {};
            const result = strategy.extractModelAndStreamInfo(req, body);
            expect(result).toEqual({
                model: 'gemini-1.5-pro-002',
                isStream: false
            });
        });

        test('should throw on invalid URL pattern', () => {
            const strategy = createStrategy();
            const req = {
                url: '/v1/invalid/path',
                headers: { host: 'localhost:3000' }
            };
            const body = {};
            expect(() => strategy.extractModelAndStreamInfo(req, body)).toThrow();
        });
    });

    // --- extractResponseText ---

    describe('extractResponseText', () => {
        test('should extract text from candidates', () => {
            const strategy = createStrategy();
            const response = {
                candidates: [{
                    content: {
                        parts: [{ text: 'Hello world' }]
                    }
                }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Hello world');
        });

        test('should join multiple parts', () => {
            const strategy = createStrategy();
            const response = {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'Part 1 ' },
                            { text: 'Part 2' }
                        ]
                    }
                }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('Part 1 Part 2');
        });

        test('should return empty string when no candidates', () => {
            const strategy = createStrategy();
            const response = {};
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when candidates is empty array', () => {
            const strategy = createStrategy();
            const response = { candidates: [] };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when no parts in content', () => {
            const strategy = createStrategy();
            const response = {
                candidates: [{ content: {} }]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });

        test('should return empty string when content is missing', () => {
            const strategy = createStrategy();
            const response = {
                candidates: [{}]
            };
            const result = strategy.extractResponseText(response);
            expect(result).toBe('');
        });
    });

    // --- extractPromptText ---

    describe('extractPromptText', () => {
        test('should extract text from last content part', () => {
            const strategy = createStrategy();
            const requestBody = {
                contents: [{
                    parts: [{ text: 'What is AI?' }]
                }]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('What is AI?');
        });

        test('should join multiple parts in last content', () => {
            const strategy = createStrategy();
            const requestBody = {
                contents: [{
                    parts: [
                        { text: 'Hello ' },
                        { text: 'World' }
                    ]
                }]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('Hello World');
        });

        test('should return empty string when no contents', () => {
            const strategy = createStrategy();
            const requestBody = {};
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });

        test('should return empty string when contents is empty array', () => {
            const strategy = createStrategy();
            const requestBody = { contents: [] };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });

        test('should return empty string when parts missing', () => {
            const strategy = createStrategy();
            const requestBody = {
                contents: [{}]
            };
            const result = strategy.extractPromptText(requestBody);
            expect(result).toBe('');
        });
    });

    // --- applySystemPromptFromFile ---

    describe('applySystemPromptFromFile', () => {
        test('should return requestBody unchanged when no SYSTEM_PROMPT_FILE_PATH', async () => {
            const strategy = createStrategy();
            const requestBody = { contents: [] };
            const result = await strategy.applySystemPromptFromFile({}, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should return requestBody when SYSTEM_PROMPT_CONTENT is null', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: null
            });
            const strategy = new GeminiStrategy(config);
            const requestBody = { contents: [] };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result).toBe(requestBody);
        });

        test('should apply system prompt in replace mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'You are a helpful assistant',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GeminiStrategy(config);
            const requestBody = {
                contents: [{ parts: [{ text: 'Hello' }] }]
            };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.systemInstruction).toEqual({ parts: [{ text: 'You are a helpful assistant' }] });
        });

        test('should apply system prompt in append mode', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Be concise',
                SYSTEM_PROMPT_MODE: 'append'
            });
            const strategy = new GeminiStrategy(config);
            const requestBody = {
                contents: [{ parts: [{ text: 'Hello' }] }],
                systemInstruction: { parts: [{ text: 'Existing prompt' }] }
            };
            extractSystemPromptFromRequestBody.mockReturnValue('Existing prompt');
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.systemInstruction.parts[0].text).toContain('Existing prompt');
            expect(result.systemInstruction.parts[0].text).toContain('Be concise');
        });

        test('should delete old system_instruction key', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'New prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GeminiStrategy(config);
            const requestBody = {
                contents: [],
                system_instruction: { parts: [{ text: 'Old prompt' }] }
            };
            const result = await strategy.applySystemPromptFromFile(config, requestBody);
            expect(result.system_instruction).toBeUndefined();
            expect(result.systemInstruction).toBeDefined();
        });

        test('should call logger.info when applying system prompt', async () => {
            const config = createMockConfig({
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Test prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            });
            const strategy = new GeminiStrategy(config);
            const requestBody = { contents: [] };
            await strategy.applySystemPromptFromFile(config, requestBody);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[System Prompt]'));
        });
    });

    // --- manageSystemPrompt ---

    describe('manageSystemPrompt', () => {
        test('should call _updateSystemPromptFile with GEMINI prefix', async () => {
            const strategy = createStrategy();
            const requestBody = {
                contents: [{ parts: [{ text: 'New system prompt' }] }]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('New system prompt');
            strategy._updateSystemPromptFile = jest.fn().mockResolvedValue(undefined);
            await strategy.manageSystemPrompt(requestBody);
            expect(strategy._updateSystemPromptFile).toHaveBeenCalledWith('New system prompt', 'gemini');
        });

        test('should handle empty system prompt', async () => {
            const strategy = createStrategy();
            const requestBody = {
                contents: [{ parts: [{ text: 'User message' }] }]
            };
            extractSystemPromptFromRequestBody.mockReturnValue('');
            strategy._updateSystemPromptFile = jest.fn().mockResolvedValue(undefined);
            await strategy.manageSystemPrompt(requestBody);
            expect(strategy._updateSystemPromptFile).toHaveBeenCalledWith('', 'gemini');
        });
    });
});
