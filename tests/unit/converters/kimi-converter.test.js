/**
 * KimiConverter 单元测试
 * 覆盖：请求转换、响应转换、流式块转换、模型列表转换
 */

import { KimiConverter } from '../../../src/converters/strategies/KimiConverter.js';

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
            this.sourceProtocol = 'kimi';
        }
    }
}));
jest.mock('../../../src/converters/utils.js', () => ({
    mapKimiFinishReason: jest.fn((reason) => {
        const map = {
            'stop': 'end_turn',
            'length': 'max_tokens',
            'tool_calls': 'tool_use',
            'content_filter': 'stop_sequence'
        };
        return map[reason] || 'end_turn';
    }),
    MODEL_PROTOCOL_PREFIX: {
        OPENAI: 'openai',
        CLAUDE: 'claude'
    }
}));

import { mapKimiFinishReason } from '../../../src/converters/utils.js';

function createConverter() {
    return new KimiConverter();
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('KimiConverter', () => {
    describe('constructor', () => {
        test('should create instance with kimi source protocol', () => {
            const converter = createConverter();
            expect(converter).toBeDefined();
            expect(converter.sourceProtocol).toBe('kimi');
        });
    });

    describe('convertRequest', () => {
        test('should convert to OpenAI format', () => {
            const converter = createConverter();
            const data = { model: 'k2', messages: [{ role: 'user', content: 'Hi' }] };
            const result = converter.convertRequest(data, 'openai');
            expect(result).toEqual(data);
        });

        test('should convert to Claude format', () => {
            const converter = createConverter();
            const data = {
                model: 'k2',
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1000,
                temperature: 0.7
            };
            const result = converter.convertRequest(data, 'claude');
            expect(result.model).toBe('k2');
            expect(result.messages).toEqual(data.messages);
            expect(result.max_tokens).toBe(1000);
            expect(result.temperature).toBe(0.7);
        });

        test('should return data unchanged for unknown target protocol', () => {
            const converter = createConverter();
            const data = { model: 'k2' };
            const result = converter.convertRequest(data, 'unknown');
            expect(result).toEqual(data);
        });
    });

    describe('convertResponse', () => {
        test('should return OpenAI response unchanged', () => {
            const converter = createConverter();
            const data = { id: 'resp-1', choices: [] };
            const result = converter.convertResponse(data, 'openai', 'k2');
            expect(result).toEqual(data);
        });

        test('should convert to Claude format', () => {
            const converter = createConverter();
            const data = {
                id: 'resp-1',
                choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = converter.convertResponse(data, 'claude', 'k2');
            expect(result.id).toBe('resp-1');
            expect(result.type).toBe('message');
            expect(result.role).toBe('assistant');
            expect(result.content).toBe('Hello');
            expect(result.model).toBe('k2');
            expect(result.stop_reason).toBe('end_turn');
            expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
        });

        test('should handle missing choices in Claude conversion', () => {
            const converter = createConverter();
            const data = { id: 'resp-1' };
            const result = converter.convertResponse(data, 'claude', 'k2');
            expect(result.content).toBe('');
        });

        test('should generate id when missing', () => {
            const converter = createConverter();
            const data = { choices: [] };
            const result = converter.convertResponse(data, 'claude', 'k2');
            expect(result.id).toMatch(/^kimi-/);
        });

        test('should return data unchanged for unknown target protocol', () => {
            const converter = createConverter();
            const data = { id: 'resp-1' };
            const result = converter.convertResponse(data, 'unknown', 'k2');
            expect(result).toEqual(data);
        });
    });

    describe('convertStreamChunk', () => {
        test('should return OpenAI chunk unchanged', () => {
            const converter = createConverter();
            const chunk = { id: 'chunk-1', choices: [] };
            const result = converter.convertStreamChunk(chunk, 'openai', 'k2', 'req-1');
            expect(result).toEqual(chunk);
        });

        test('should convert to Claude format', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: { content: 'Hello' },
                    index: 0
                }]
            };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result.type).toBe('content_block_delta');
            expect(result.delta.type).toBe('text_delta');
            expect(result.delta.text).toBe('Hello');
        });

        test('should return null for chunk without choices', () => {
            const converter = createConverter();
            const chunk = {};
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result).toBeNull();
        });

        test('should return null for chunk without delta', () => {
            const converter = createConverter();
            const chunk = { choices: [{}] };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result).toBeNull();
        });

        test('should return chunk unchanged for unknown target protocol', () => {
            const converter = createConverter();
            const chunk = { id: 'chunk-1' };
            const result = converter.convertStreamChunk(chunk, 'unknown', 'k2', 'req-1');
            expect(result).toEqual(chunk);
        });
    });

    describe('toClaudeStreamChunk with finish reason', () => {
        test('should return message_delta on finish', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: {},
                    finish_reason: 'stop',
                    index: 0
                }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result).toBeInstanceOf(Array);
            expect(result[0].type).toBe('message_delta');
            expect(result[0].delta.stop_reason).toBe('end_turn');
            expect(result[0].usage).toEqual({ input_tokens: 10, output_tokens: 5 });
        });

        test('should return content block + message_delta when both exist', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: { content: 'Hello' },
                    finish_reason: 'stop',
                    index: 0
                }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('content_block_delta');
            expect(result[1].type).toBe('message_delta');
        });
    });

    describe('toClaudeStreamChunk with tool_calls', () => {
        test('should convert tool_calls to partial_json', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: {
                        tool_calls: [{
                            function: {
                                arguments: '{"query": "search"}'
                            }
                        }]
                    },
                    index: 0
                }]
            };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            // Returns single object for tool_calls without finish_reason
            expect(result).toBeInstanceOf(Object);
            expect(result.type).toBe('content_block_delta');
            expect(result.delta.type).toBe('input_json_delta');
            expect(result.delta.partial_json).toContain('search');
        });

        test('should handle tool_calls with object arguments', () => {
            const converter = createConverter();
            const chunk = {
                choices: [{
                    delta: {
                        tool_calls: [{
                            function: {
                                arguments: { query: 'search' }
                            }
                        }]
                    },
                    index: 0
                }]
            };
            const result = converter.convertStreamChunk(chunk, 'claude', 'k2', 'req-1');
            expect(result).toBeInstanceOf(Object);
            expect(result.delta.partial_json).toBe('{"query":"search"}');
        });
    });

    describe('convertModelList', () => {
        test('should return model list unchanged', () => {
            const converter = createConverter();
            const data = { object: 'list', data: [{ id: 'kimi-k2' }] };
            const result = converter.convertModelList(data, 'openai');
            expect(result).toEqual(data);
        });
    });

    describe('toOpenAIRequest', () => {
        test('should return data unchanged (Kimi uses OpenAI format)', () => {
            const converter = createConverter();
            const data = { model: 'k2', messages: [] };
            expect(converter.toOpenAIRequest(data)).toEqual(data);
        });
    });

    describe('toClaudeRequest', () => {
        test('should convert OpenAI format to Claude format', () => {
            const converter = createConverter();
            const data = {
                model: 'k2',
                messages: [{ role: 'user', content: 'Hi' }],
                system: 'You are helpful',
                max_tokens: 1000,
                temperature: 0.7,
                top_p: 0.9,
                stream: true
            };
            const result = converter.toClaudeRequest(data);
            expect(result.model).toBe('k2');
            expect(result.messages).toEqual(data.messages);
            expect(result.system).toBe('You are helpful');
            expect(result.max_tokens).toBe(1000);
            expect(result.temperature).toBe(0.7);
            expect(result.top_p).toBe(0.9);
            expect(result.stream).toBe(true);
        });

        test('should handle system_instruction field', () => {
            const converter = createConverter();
            const data = {
                model: 'k2',
                messages: [],
                system_instruction: 'Be helpful'
            };
            const result = converter.toClaudeRequest(data);
            expect(result.system).toBe('Be helpful');
        });

        test('should remove undefined values', () => {
            const converter = createConverter();
            const data = {
                model: 'k2',
                messages: []
            };
            const result = converter.toClaudeRequest(data);
            expect(result.system).toBeUndefined();
            expect(result.max_tokens).toBeUndefined();
            expect(result.temperature).toBeUndefined();
        });
    });

    describe('toClaudeResponse', () => {
        test('should convert OpenAI response to Claude format', () => {
            const converter = createConverter();
            const data = {
                id: 'resp-1',
                choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
                usage: { input_tokens: 10, output_tokens: 5 }
            };
            const result = converter.toClaudeResponse(data, 'k2');
            expect(result.id).toBe('resp-1');
            expect(result.type).toBe('message');
            expect(result.role).toBe('assistant');
            expect(result.content).toBe('Hello');
            expect(result.model).toBe('k2');
            expect(result.stop_reason).toBe('end_turn');
            expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
        });

        test('should handle missing choices', () => {
            const converter = createConverter();
            const result = converter.toClaudeResponse({}, 'k2');
            expect(result.content).toBe('');
        });

        test('should generate id when missing', () => {
            const converter = createConverter();
            const result = converter.toClaudeResponse({ choices: [] }, 'k2');
            expect(result.id).toMatch(/^kimi-/);
        });

        test('should map finish_reason using mapFinishReason', () => {
            const converter = createConverter();
            const data = {
                choices: [{ finish_reason: 'length' }]
            };
            const result = converter.toClaudeResponse(data, 'k2');
            expect(mapKimiFinishReason).toHaveBeenCalledWith('length');
        });
    });

    describe('mapFinishReason', () => {
        test('should delegate to mapKimiFinishReason', () => {
            const converter = createConverter();
            converter.mapFinishReason('stop');
            expect(mapKimiFinishReason).toHaveBeenCalledWith('stop');
        });
    });
});
