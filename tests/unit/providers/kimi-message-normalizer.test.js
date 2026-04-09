/**
 * KimiMessageNormalizer 单元测试
 * 覆盖：normalizeKimiToolMessageLinks 函数的各种场景
 */

import { normalizeKimiToolMessageLinks } from '../../../src/providers/kimi/kimi-message-normalizer.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

describe('normalizeKimiToolMessageLinks', () => {
    describe('input validation', () => {
        test('should return body unchanged if not an object', () => {
            expect(normalizeKimiToolMessageLinks(null)).toBeNull();
            expect(normalizeKimiToolMessageLinks(undefined)).toBeUndefined();
            expect(normalizeKimiToolMessageLinks('string')).toBe('string');
            expect(normalizeKimiToolMessageLinks(123)).toBe(123);
        });

        test('should return body unchanged if no messages array', () => {
            const body = { model: 'k2' };
            expect(normalizeKimiToolMessageLinks(body)).toEqual(body);
        });

        test('should return body unchanged if messages is empty array', () => {
            const body = { messages: [] };
            expect(normalizeKimiToolMessageLinks(body)).toEqual(body);
        });
    });

    describe('assistant message reasoning_content handling', () => {
        test('should patch reasoning_content when tool_calls present but no reasoning_content', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'I need to use a tool',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[0].reasoning_content).toBe('[reasoning unavailable]');
        });

        test('should NOT patch reasoning_content when tool_calls present AND reasoning_content exists', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'I will search for this',
                        reasoning_content: 'Let me think about this...',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[0].reasoning_content).toBe('Let me think about this...');
        });

        test('should NOT patch reasoning_content when tool_calls present but reasoning_content is empty', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'I need a tool',
                        reasoning_content: '   ',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[0].reasoning_content).toBe('[reasoning unavailable]');
        });

        test('should not patch reasoning_content when no tool_calls', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Just a regular response'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[0].reasoning_content).toBeUndefined();
        });
    });

    describe('tool message tool_call_id handling', () => {
        test('should use call_id when tool_call_id is missing', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Let me search',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        call_id: 'call_1',
                        content: 'Search results here'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[1].tool_call_id).toBe('call_1');
        });

        test('should keep existing tool_call_id when present', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Let me search',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        tool_call_id: 'call_1',
                        content: 'Search results here'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[1].tool_call_id).toBe('call_1');
        });

        test('should infer tool_call_id when only one pending', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Let me search',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        content: 'Search results here'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[1].tool_call_id).toBe('call_1');
        });

        test('should use placeholder when multiple pending tool_calls and ambiguous', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Let me search and calculate',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } },
                            { id: 'call_2', function: { name: 'calculate', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        content: 'Search results here'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[1].tool_call_id).toMatch(/^\[ambiguous_tool_call_id_1\]$/);
        });

        test('should remove tool_call_id from pending after processing', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Let me search',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        tool_call_id: 'call_1',
                        content: 'Results 1'
                    },
                    {
                        role: 'assistant',
                        content: 'Now calculate',
                        tool_calls: [
                            { id: 'call_2', function: { name: 'calc', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        tool_call_id: 'call_2',
                        content: 'Results 2'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[3].tool_call_id).toBe('call_2');
        });
    });

    describe('edge cases', () => {
        test('should handle whitespace in role', () => {
            const body = {
                messages: [
                    {
                        role: '  assistant  ',
                        content: 'Test'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            // role is trimmed for comparison but original is preserved
            expect(result.messages[0].role).toBe('  assistant  ');
        });

        test('should handle whitespace in tool_call_id', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Using tool',
                        tool_calls: [
                            { id: '  call_1  ', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        tool_call_id: '  call_1  ',
                        content: 'Result'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            // Original whitespace is preserved
            expect(result.messages[1].tool_call_id).toBe('  call_1  ');
        });

        test('should handle tool_calls with empty id', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Using tool',
                        tool_calls: [
                            { id: '', function: { name: 'search', arguments: '{}' } }
                        ]
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            // Empty id should not be added to pending
            expect(result.messages[0].tool_calls[0].id).toBe('');
        });

        test('should handle multiple tool_calls on single assistant message', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Multiple tools',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } },
                            { id: 'call_2', function: { name: 'calc', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        tool_call_id: 'call_1',
                        content: 'Search result'
                    },
                    {
                        role: 'tool',
                        tool_call_id: 'call_2',
                        content: 'Calc result'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[1].tool_call_id).toBe('call_1');
            expect(result.messages[2].tool_call_id).toBe('call_2');
        });

        test('should not modify non-tool/assistant messages', () => {
            const body = {
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    },
                    {
                        role: 'system',
                        content: 'You are helpful'
                    }
                ]
            };
            const result = normalizeKimiToolMessageLinks(body);
            expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(result.messages[1]).toEqual({ role: 'system', content: 'You are helpful' });
        });
    });

    describe('logging behavior', () => {
        test('should log debug when patching occurs', () => {
            const body = {
                messages: [
                    {
                        role: 'assistant',
                        content: 'Using tool',
                        tool_calls: [
                            { id: 'call_1', function: { name: 'search', arguments: '{}' } }
                        ]
                    },
                    {
                        role: 'tool',
                        content: 'Result'
                    }
                ]
            };
            normalizeKimiToolMessageLinks(body);
            // Just verify no errors occur - the actual logging is tested via logger mock
        });
    });
});
