/**
 * OpenAIConverter 单元测试
 * 覆盖：请求转换、响应转换、流式块转换、模型列表转换
 */

import { OpenAIConverter } from '../../../src/converters/strategies/OpenAIConverter.js';
import { MODEL_PROTOCOL_PREFIX } from '../../../src/utils/common.js';

// Mock dependencies
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../../../src/converters/BaseConverter.js', () => ({
    BaseConverter: class BaseConverter {
        constructor() {
            this.sourceProtocol = 'openai';
        }
    }
}));

jest.mock('../../../src/converters/utils.js', () => ({
    extractAndProcessSystemMessages: jest.fn((messages) => {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const systemInstruction = systemMessages.length > 0
            ? { parts: [{ text: systemMessages.map(m => m.content).join('\n') }] }
            : null;
        return { systemInstruction, nonSystemMessages };
    }),
    extractTextFromMessageContent: jest.fn((content) => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
        }
        return '';
    }),
    safeParseJSON: jest.fn((str) => {
        if (typeof str !== 'string') return str;
        try { return JSON.parse(str); } catch { return str; }
    }),
    checkAndAssignOrDefault: jest.fn((val, def) => val !== undefined && val !== null && val !== 0 ? val : def),
    extractThinkingFromOpenAIText: jest.fn((text) => text),
    mapFinishReason: jest.fn((reason) => {
        const map = { 'stop': 'end_turn', 'length': 'max_tokens', 'tool_calls': 'tool_use', 'content_filter': 'stop_sequence' };
        return map[reason] || 'end_turn';
    }),
    cleanJsonSchemaProperties: jest.fn((schema) => schema),
    CLAUDE_DEFAULT_MAX_TOKENS: 8192,
    CLAUDE_DEFAULT_TEMPERATURE: 1,
    CLAUDE_DEFAULT_TOP_P: 0.95,
    GEMINI_DEFAULT_MAX_TOKENS: 8192,
    GEMINI_DEFAULT_TEMPERATURE: 0.9,
    GEMINI_DEFAULT_TOP_P: 1.0,
    OPENAI_DEFAULT_INPUT_TOKEN_LIMIT: 128000,
    OPENAI_DEFAULT_OUTPUT_TOKEN_LIMIT: 8192
}));

jest.mock('../../../src/converters/strategies/CodexConverter.js', () => ({
    CodexConverter: class CodexConverter {
        toOpenAIRequestToCodexRequest(data) { return data; }
        toOpenAIResponsesToCodexRequest(data) { return data; }
        toCodexResponse(data) { return data; }
        toCodexStreamChunk(data) { return data; }
    }
}));

jest.mock('../../../src/providers/openai/openai-responses-core.mjs', () => ({
    generateResponseCreated: jest.fn(() => ({ type: 'response_created' })),
    generateResponseInProgress: jest.fn(() => ({ type: 'response_in_progress' })),
    generateOutputItemAdded: jest.fn(() => ({ type: 'output_item_added' })),
    generateContentPartAdded: jest.fn(() => ({ type: 'content_part_added' })),
    generateOutputTextDone: jest.fn(() => ({ type: 'output_text_done' })),
    generateContentPartDone: jest.fn(() => ({ type: 'content_part_done' })),
    generateOutputItemDone: jest.fn(() => ({ type: 'output_item_done' })),
    generateResponseCompleted: jest.fn(() => ({ type: 'response_completed' })),
}));

function createConverter() {
    return new OpenAIConverter();
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('OpenAIConverter', () => {
    describe('constructor', () => {
        test('should create instance with openai source protocol', () => {
            const converter = createConverter();
            expect(converter).toBeDefined();
            expect(converter.sourceProtocol).toBe('openai');
        });

        test('should create codexConverter instance', () => {
            const converter = createConverter();
            expect(converter.codexConverter).toBeDefined();
        });
    });

    describe('convertRequest', () => {
        test('should convert to Claude format', () => {
            const converter = createConverter();
            const data = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.CLAUDE);
            expect(result).toBeDefined();
            expect(result.model).toBe('gpt-4');
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.GEMINI);
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES);
            expect(result).toBeDefined();
        });

        test('should convert to Codex format', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.CODEX);
            expect(result).toBeDefined();
        });

        test('should convert to Grok format', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.GROK);
            expect(result).toBeDefined();
        });

        test('should return data unchanged for Kimi target', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.KIMI);
            expect(result).toEqual(data);
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const data = { model: 'gpt-4' };
            expect(() => converter.convertRequest(data, 'unknown')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertResponse', () => {
        test('should convert to Claude format', () => {
            const converter = createConverter();
            const data = {
                id: 'chatcmpl-123',
                choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }]
            };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.CLAUDE, 'gpt-4');
            expect(result).toBeDefined();
            expect(result.type).toBe('message');
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { id: 'chatcmpl-123', choices: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.GEMINI, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const data = { id: 'chatcmpl-123', choices: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should convert to Grok format', () => {
            const converter = createConverter();
            const data = { id: 'chatcmpl-123', choices: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.GROK, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should return data unchanged for Kimi target', () => {
            const converter = createConverter();
            const data = { id: 'chatcmpl-123' };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.KIMI, 'gpt-4');
            expect(result).toEqual(data);
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const data = { id: 'chatcmpl-123' };
            expect(() => converter.convertResponse(data, 'unknown', 'gpt-4')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertStreamChunk', () => {
        test('should convert to Claude format', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: { content: 'Hello' },
                    finish_reason: 'stop'
                }]
            };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.CLAUDE, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const chunk = { choices: [{ delta: { content: 'Hello' } }] };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.GEMINI, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const chunk = { choices: [{ delta: { content: 'Hello' } }] };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should convert to Grok format', () => {
            const converter = createConverter();
            const chunk = { choices: [{ delta: { content: 'Hello' } }] };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.GROK, 'gpt-4');
            expect(result).toBeDefined();
        });

        test('should return chunk unchanged for Kimi target', () => {
            const converter = createConverter();
            const chunk = { id: 'chunk-1' };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.KIMI, 'gpt-4');
            expect(result).toEqual(chunk);
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const chunk = { choices: [] };
            expect(() => converter.convertStreamChunk(chunk, 'unknown', 'gpt-4')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertModelList', () => {
        test('should convert to Claude format', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.CLAUDE);
            expect(result).toBeDefined();
            expect(result.models).toBeDefined();
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.GEMINI);
            expect(result).toBeDefined();
            expect(result.models).toBeDefined();
        });

        test('should return data unchanged for Kimi target', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.KIMI);
            expect(result).toEqual(data);
        });

        test('should ensure display name for default case', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4' }] };
            const result = converter.convertModelList(data, 'unknown');
            expect(result).toBeDefined();
            expect(result.data[0].display_name).toBe('gpt-4');
        });
    });

    describe('ensureDisplayName', () => {
        test('should add display_name when missing', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4' }] };
            const result = converter.ensureDisplayName(data);
            expect(result.data[0].display_name).toBe('gpt-4');
        });

        test('should preserve existing display_name', () => {
            const converter = createConverter();
            const data = { data: [{ id: 'gpt-4', display_name: 'GPT-4 Turbo' }] };
            const result = converter.ensureDisplayName(data);
            expect(result.data[0].display_name).toBe('GPT-4 Turbo');
        });

        test('should return data unchanged when data is missing', () => {
            const converter = createConverter();
            const data = null;
            const result = converter.ensureDisplayName(data);
            expect(result).toBeNull();
        });
    });

    describe('toClaudeRequest', () => {
        test('should convert basic request', () => {
            const converter = createConverter();
            const data = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = converter.toClaudeRequest(data);
            expect(result).toBeDefined();
            expect(result.model).toBe('gpt-4');
        });

        test('should handle system instruction', () => {
            const converter = createConverter();
            const data = {
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hello' }
                ]
            };
            const result = converter.toClaudeRequest(data);
            expect(result.system).toBeDefined();
        });

        test('should handle tools', () => {
            const converter = createConverter();
            const data = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [{
                    function: {
                        name: 'get_weather',
                        description: 'Get weather',
                        parameters: { type: 'object', properties: {} }
                    }
                }]
            };
            const result = converter.toClaudeRequest(data);
            expect(result.tools).toBeDefined();
            expect(result.tools[0].name).toBe('get_weather');
        });
    });

    describe('toGeminiRequest', () => {
        test('should convert basic request', () => {
            const converter = createConverter();
            const data = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = converter.toGeminiRequest(data);
            expect(result).toBeDefined();
        });
    });

    describe('toClaudeResponse', () => {
        test('should handle empty response', () => {
            const converter = createConverter();
            const data = {};
            const result = converter.toClaudeResponse(data, 'gpt-4');
            expect(result).toBeDefined();
            expect(result.id).toMatch(/^msg_/);
        });

        test('should handle tool calls', () => {
            const converter = createConverter();
            const data = {
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [{
                            id: 'call_123',
                            function: { name: 'get_weather', arguments: '{}' }
                        }]
                    },
                    finish_reason: 'tool_calls'
                }]
            };
            const result = converter.toClaudeResponse(data, 'gpt-4');
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        });

        test('should handle reasoning_content', () => {
            const converter = createConverter();
            const data = {
                choices: [{
                    message: {
                        content: 'Hello',
                        reasoning_content: 'Thinking...'
                    },
                    finish_reason: 'stop'
                }]
            };
            const result = converter.toClaudeResponse(data, 'gpt-4');
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        });
    });

    describe('toGeminiResponse', () => {
        test('should convert Claude response to Gemini format', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello' }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = converter.toGeminiResponse(data, 'gpt-4');
            expect(result).toBeDefined();
            expect(result.candidates).toBeDefined();
        });
    });

    describe('toClaudeModelList', () => {
        test('should convert model list', () => {
            const converter = createConverter();
            const data = {
                data: [
                    { id: 'gpt-4', description: 'GPT-4 model' },
                    { id: 'gpt-3.5', description: 'GPT-3.5 model' }
                ]
            };
            const result = converter.toClaudeModelList(data);
            expect(result.models).toHaveLength(2);
            expect(result.models[0].name).toBe('gpt-4');
        });
    });

    describe('toGeminiModelList', () => {
        test('should convert model list with proper format', () => {
            const converter = createConverter();
            const data = {
                data: [{ id: 'gpt-4' }]
            };
            const result = converter.toGeminiModelList(data);
            expect(result.models[0].name).toBe('models/gpt-4');
        });
    });

    describe('buildClaudeToolChoice', () => {
        test('should handle string tool_choice', () => {
            const converter = createConverter();
            expect(converter.buildClaudeToolChoice('auto')).toEqual({ type: 'auto' });
            expect(converter.buildClaudeToolChoice('none')).toEqual({ type: 'none' });
            expect(converter.buildClaudeToolChoice('required')).toEqual({ type: 'any' });
        });

        test('should handle object tool_choice with type and name', () => {
            const converter = createConverter();
            const result = converter.buildClaudeToolChoice({ type: 'tool', name: 'get_weather' });
            expect(result).toEqual({ type: 'tool', name: 'get_weather' });
        });

        test('should handle OpenAI format tool_choice', () => {
            const converter = createConverter();
            const result = converter.buildClaudeToolChoice({ function: { name: 'get_weather' } });
            expect(result).toEqual({ type: 'tool', name: 'get_weather' });
        });

        test('should return undefined for invalid input', () => {
            const converter = createConverter();
            expect(converter.buildClaudeToolChoice(null)).toBeUndefined();
            expect(converter.buildClaudeToolChoice(undefined)).toBeUndefined();
        });
    });
});
