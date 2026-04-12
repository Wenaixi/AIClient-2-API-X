/**
 * ClaudeConverter 单元测试
 * 覆盖：请求转换、响应转换、流式块转换、模型列表转换
 */

import { ClaudeConverter } from '../../../src/converters/strategies/ClaudeConverter.js';
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
            this.sourceProtocol = 'claude';
        }
    }
}));

jest.mock('../../../src/converters/utils.js', () => ({
    checkAndAssignOrDefault: jest.fn((val, def) => val !== undefined && val !== null && val !== 0 ? val : def),
    cleanJsonSchemaProperties: jest.fn((schema) => schema),
    determineReasoningEffortFromBudget: jest.fn((budget) => {
        if (!budget) return 'high';
        if (budget <= 50) return 'low';
        if (budget <= 200) return 'medium';
        return 'high';
    }),
    OPENAI_DEFAULT_MAX_TOKENS: 8192,
    OPENAI_DEFAULT_TEMPERATURE: 1,
    OPENAI_DEFAULT_TOP_P: 0.95,
    GEMINI_DEFAULT_MAX_TOKENS: 8192,
    GEMINI_DEFAULT_TEMPERATURE: 0.9,
    GEMINI_DEFAULT_TOP_P: 1.0,
    GEMINI_DEFAULT_INPUT_TOKEN_LIMIT: 128000,
    GEMINI_DEFAULT_OUTPUT_TOKEN_LIMIT: 8192
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
    generateOutputTextDelta: jest.fn(() => ({ type: 'output_text_delta' })),
    streamStateManager: {
        getState: jest.fn(() => null),
        setState: jest.fn(),
        clearState: jest.fn()
    },
    startToolCall: jest.fn(() => ({ type: 'tool_call_start' })),
    finishToolCall: jest.fn(() => ({ type: 'tool_call_end' })),
    generateFunctionCallArgsDelta: jest.fn(() => ({ type: 'function_call_args_delta' })),
    generateFunctionCallArgsDone: jest.fn(() => ({ type: 'function_call_args_done' })),
    generateFunctionCallOutputItemDone: jest.fn(() => ({ type: 'function_call_output_item_done' })),
}));

function createConverter() {
    return new ClaudeConverter();
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ClaudeConverter', () => {
    describe('constructor', () => {
        test('should create instance with claude source protocol', () => {
            const converter = createConverter();
            expect(converter).toBeDefined();
            expect(converter.sourceProtocol).toBe('claude');
        });
    });

    describe('convertRequest', () => {
        test('should convert to OpenAI format', () => {
            const converter = createConverter();
            const data = {
                model: 'claude-3-5-sonnet',
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.OPENAI);
            expect(result).toBeDefined();
            expect(result.model).toBe('claude-3-5-sonnet');
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.GEMINI);
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES);
            expect(result).toBeDefined();
        });

        test('should convert to Codex format', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.CODEX);
            expect(result).toBeDefined();
        });

        test('should convert to Grok format', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.GROK);
            expect(result).toBeDefined();
        });

        test('should convert to Kimi format via OpenAI', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet', messages: [] };
            const result = converter.convertRequest(data, MODEL_PROTOCOL_PREFIX.KIMI);
            expect(result).toBeDefined();
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const data = { model: 'claude-3-5-sonnet' };
            expect(() => converter.convertRequest(data, 'unknown')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertResponse', () => {
        test('should convert to OpenAI format', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello' }]
            };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.OPENAI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
            expect(result.object).toBe('chat.completion');
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { type: 'message', content: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.GEMINI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const data = { type: 'message', content: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to Codex format', () => {
            const converter = createConverter();
            const data = { type: 'message', content: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.CODEX, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to Kimi format via OpenAI', () => {
            const converter = createConverter();
            const data = { type: 'message', content: [] };
            const result = converter.convertResponse(data, MODEL_PROTOCOL_PREFIX.KIMI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const data = { type: 'message' };
            expect(() => converter.convertResponse(data, 'unknown', 'claude-3-5-sonnet')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertStreamChunk', () => {
        test('should convert to OpenAI format', () => {
            const converter = createConverter();
            const chunk = { type: 'message_start', message: { role: 'assistant' } };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.OPENAI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const chunk = { type: 'content_block_start', content_block: { type: 'text' } };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.GEMINI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to OpenAI Responses format', () => {
            const converter = createConverter();
            const chunk = { type: 'message_start' };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to Codex format', () => {
            const converter = createConverter();
            const chunk = { type: 'message_start' };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.CODEX, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should convert to Kimi format via OpenAI', () => {
            const converter = createConverter();
            const chunk = { type: 'message_start' };
            const result = converter.convertStreamChunk(chunk, MODEL_PROTOCOL_PREFIX.KIMI, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should throw error for unknown target protocol', () => {
            const converter = createConverter();
            const chunk = { type: 'message_start' };
            expect(() => converter.convertStreamChunk(chunk, 'unknown', 'claude-3-5-sonnet')).toThrow('Unsupported target protocol');
        });
    });

    describe('convertModelList', () => {
        test('should convert to OpenAI format', () => {
            const converter = createConverter();
            const data = { models: [{ name: 'claude-3-5-sonnet' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.OPENAI);
            expect(result).toBeDefined();
        });

        test('should convert to Gemini format', () => {
            const converter = createConverter();
            const data = { models: [{ name: 'claude-3-5-sonnet' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.GEMINI);
            expect(result).toBeDefined();
        });

        test('should convert to Kimi format via OpenAI', () => {
            const converter = createConverter();
            const data = { models: [{ name: 'claude-3-5-sonnet' }] };
            const result = converter.convertModelList(data, MODEL_PROTOCOL_PREFIX.KIMI);
            expect(result).toBeDefined();
        });

        test('should return data unchanged for default case', () => {
            const converter = createConverter();
            const data = { models: [{ name: 'claude-3-5-sonnet' }] };
            const result = converter.convertModelList(data, 'unknown');
            expect(result).toEqual(data);
        });
    });

    describe('toOpenAIRequest', () => {
        test('should convert basic request', () => {
            const converter = createConverter();
            const data = {
                model: 'claude-3-5-sonnet',
                messages: [{ role: 'user', content: 'Hello' }]
            };
            const result = converter.toOpenAIRequest(data);
            expect(result).toBeDefined();
            expect(result.model).toBe('claude-3-5-sonnet');
            expect(result.messages).toBeDefined();
        });

        test('should handle system message', () => {
            const converter = createConverter();
            const data = {
                model: 'claude-3-5-sonnet',
                messages: [{ role: 'user', content: 'Hello' }],
                system: 'You are helpful'
            };
            const result = converter.toOpenAIRequest(data);
            expect(result.messages[0].role).toBe('system');
        });

        test('should handle tools', () => {
            const converter = createConverter();
            const data = {
                model: 'claude-3-5-sonnet',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [{ name: 'get_weather', description: 'Get weather', input_schema: {} }]
            };
            const result = converter.toOpenAIRequest(data);
            expect(result.tools).toBeDefined();
            expect(result.tools[0].type).toBe('function');
        });

        test('should handle thinking config with enabled type', () => {
            const converter = createConverter();
            const data = {
                model: 'claude-3-5-sonnet',
                messages: [{ role: 'user', content: 'Hello' }],
                thinking: { type: 'enabled', budget_tokens: 10000 },
                max_tokens: 1000
            };
            const result = converter.toOpenAIRequest(data);
            expect(result.reasoning_effort).toBeDefined();
        });
    });

    describe('toOpenAIResponse', () => {
        test('should handle empty content', () => {
            const converter = createConverter();
            const data = {};
            const result = converter.toOpenAIResponse(data, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
            expect(result.id).toMatch(/^chatcmpl-/);
        });

        test('should handle text content', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello' }]
            };
            const result = converter.toOpenAIResponse(data, 'claude-3-5-sonnet');
            expect(result.choices[0].message.content).toBe('Hello');
        });

        test('should handle tool_use content', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Let me check' },
                    { type: 'tool_use', id: 'tool_1', name: 'get_weather', input: { city: 'NYC' } }
                ]
            };
            const result = converter.toOpenAIResponse(data, 'claude-3-5-sonnet');
            expect(result.choices[0].message.tool_calls).toBeDefined();
        });

        test('should handle thinking blocks', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [
                    { type: 'thinking', thinking: 'Thinking...' },
                    { type: 'text', text: 'Hello' }
                ]
            };
            const result = converter.toOpenAIResponse(data, 'claude-3-5-sonnet');
            expect(result.choices[0].message.reasoning_content).toBeDefined();
        });

        test('should map stop_reason correctly', () => {
            const converter = createConverter();
            const data = {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello' }],
                stop_reason: 'end_turn'
            };
            const result = converter.toOpenAIResponse(data, 'claude-3-5-sonnet');
            expect(result.choices[0].finish_reason).toBe('stop');
        });
    });

    describe('toOpenAIStreamChunk', () => {
        test('should handle message_start event', () => {
            const converter = createConverter();
            const chunk = {
                type: 'message_start',
                message: { role: 'assistant', usage: { input_tokens: 10 } }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
            expect(result.choices[0].delta.role).toBe('assistant');
        });

        test('should handle content_block_start for tool_use', () => {
            const converter = createConverter();
            const chunk = {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'tool_1', name: 'get_weather' }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
            expect(result.choices[0].delta.tool_calls[0].function.name).toBe('get_weather');
        });

        test('should handle content_block_delta for text', () => {
            const converter = createConverter();
            const chunk = {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Hello' }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result.choices[0].delta.content).toBe('Hello');
        });

        test('should handle content_block_delta for thinking', () => {
            const converter = createConverter();
            const chunk = {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'thinking_delta', thinking: 'Thinking...' }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result.choices[0].delta.reasoning_content).toBe('Thinking...');
        });

        test('should handle content_block_delta for input_json', () => {
            const converter = createConverter();
            const chunk = {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'input_json_delta', partial_json: '{"city"' }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should handle message_delta event', () => {
            const converter = createConverter();
            const chunk = {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn' },
                usage: { output_tokens: 10 }
            };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
            expect(result.choices[0].delta).toEqual({});
        });

        test('should handle message_stop event', () => {
            const converter = createConverter();
            const chunk = { type: 'message_stop' };
            const result = converter.toOpenAIStreamChunk(chunk, 'claude-3-5-sonnet');
            expect(result).toBeDefined();
        });

        test('should return null for null chunk', () => {
            const converter = createConverter();
            const result = converter.toOpenAIStreamChunk(null, 'claude-3-5-sonnet');
            expect(result).toBeNull();
        });
    });

    describe('toOpenAIModelList', () => {
        test('should convert model list', () => {
            const converter = createConverter();
            const data = {
                models: [
                    { name: 'claude-3-5-sonnet-20241022', description: 'Claude 3.5 Sonnet' },
                    { name: 'claude-3-opus-20240229', description: 'Claude 3 Opus' }
                ]
            };
            const result = converter.toOpenAIModelList(data);
            expect(result.data).toHaveLength(2);
        });
    });

    describe('toGeminiModelList', () => {
        test('should convert model list to Gemini format', () => {
            const converter = createConverter();
            const data = {
                models: [{ name: 'claude-3-5-sonnet' }]
            };
            const result = converter.toGeminiModelList(data);
            expect(result.models).toBeDefined();
        });
    });
});
