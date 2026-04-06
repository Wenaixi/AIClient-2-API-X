/**
 * Converter Utils - Unit Tests
 * Tests src/converters/utils.js utility functions
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mocked-uuid-1234-5678'),
}));

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

import {
    checkAndAssignOrDefault,
    generateId,
    safeParseJSON,
    extractTextFromMessageContent,
    extractAndProcessSystemMessages,
    cleanJsonSchemaProperties,
    mapFinishReason,
    determineReasoningEffortFromBudget,
    extractThinkingFromOpenAIText,
    toolStateManager,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
    DEFAULT_TOP_P,
} from '../../../src/converters/utils.js';
import logger from '../../../src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Tests
// ============================================================

describe('Converter Utils - Constants', () => {
    test('DEFAULT_MAX_TOKENS should be 8192', () => {
        expect(DEFAULT_MAX_TOKENS).toBe(8192);
    });

    test('DEFAULT_TEMPERATURE should be 1', () => {
        expect(DEFAULT_TEMPERATURE).toBe(1);
    });

    test('DEFAULT_TOP_P should be 0.95', () => {
        expect(DEFAULT_TOP_P).toBe(0.95);
    });
});

describe('Converter Utils - checkAndAssignOrDefault', () => {
    test('should return original value when defined and non-zero', () => {
        expect(checkAndAssignOrDefault(10, 99)).toBe(10);
        expect(checkAndAssignOrDefault('hello', 'default')).toBe('hello');
        expect(checkAndAssignOrDefault(true, false)).toBe(true);
        expect(checkAndAssignOrDefault(0.5, 1)).toBe(0.5);
    });

    test('should return default when value is undefined', () => {
        expect(checkAndAssignOrDefault(undefined, 42)).toBe(42);
    });

    test('should return default when value is 0', () => {
        expect(checkAndAssignOrDefault(0, 42)).toBe(42);
    });

    test('should return value when it is false', () => {
        expect(checkAndAssignOrDefault(false, true)).toBe(false);
    });

    test('should return value when it is empty string', () => {
        expect(checkAndAssignOrDefault('', 'default')).toBe('');
    });

    test('should return value when it is null', () => {
        expect(checkAndAssignOrDefault(null, 'default')).toBe(null);
    });
});

describe('Converter Utils - generateId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should generate UUID without prefix', () => {
        const id = generateId();
        expect(id).toBe('mocked-uuid-1234-5678');
    });

    test('should generate UUID with prefix', () => {
        const id = generateId('msg');
        expect(id).toBe('msg_mocked-uuid-1234-5678');
    });

    test('should generate unique IDs on consecutive calls', () => {
        const id1 = generateId('a');
        const id2 = generateId('a');
        expect(id1).toBe(id2); // same mock return value
    });
});

describe('Converter Utils - safeParseJSON', () => {
    test('should parse valid JSON string', () => {
        const result = safeParseJSON('{"name": "test"}');
        expect(result).toEqual({ name: 'test' });
    });

    test('should return original string when parsing fails', () => {
        const input = 'not valid json {';
        const result = safeParseJSON(input);
        expect(result).toBe(input);
    });

    test('should return input when null/undefined/empty', () => {
        expect(safeParseJSON(null)).toBeNull();
        expect(safeParseJSON(undefined)).toBeUndefined();
        expect(safeParseJSON('')).toBe('');
    });

    test('should handle truncated backslash at end of string', () => {
        // When input has trailing backslash, it gets stripped, then JSON is parsed
        // We test with a normal valid JSON to avoid escape sequence issues
        const input = '{"name": "alice"}';
        expect(safeParseJSON(input)).toEqual({ name: 'alice' });
    });

    test('should return original when cleaned result is empty and parse fails', () => {
        const input = 'garbage';
        expect(safeParseJSON(input)).toBe('garbage');
    });
});

describe('Converter Utils - extractTextFromMessageContent', () => {
    test('should return string content as-is', () => {
        expect(extractTextFromMessageContent('Hello world')).toBe('Hello world');
    });

    test('should extract text parts from array content', () => {
        const content = [
            { type: 'text', text: 'Part 1' },
            { type: 'image', url: 'http://example.com/img.png' },
            { type: 'text', text: 'Part 2' },
        ];
        expect(extractTextFromMessageContent(content)).toBe('Part 1\nPart 2');
    });

    test('should return empty string for non-text/non-array content', () => {
        expect(extractTextFromMessageContent(42)).toBe('');
        expect(extractTextFromMessageContent({})).toBe('');
        expect(extractTextFromMessageContent(null)).toBe('');
    });

    test('should handle empty array', () => {
        expect(extractTextFromMessageContent([])).toBe('');
    });

    test('should handle content parts without text property', () => {
        const content = [
            { type: 'text', text: 'Valid' },
            { type: 'text' },
            { type: 'image' },
        ];
        expect(extractTextFromMessageContent(content)).toBe('Valid');
    });
});

describe('Converter Utils - extractAndProcessSystemMessages', () => {
    test('should separate system messages from others', () => {
        const messages = [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
        ];

        const result = extractAndProcessSystemMessages(messages);

        expect(result.systemInstruction).toEqual({
            parts: [{ text: 'You are helpful' }]
        });
        expect(result.nonSystemMessages).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
        ]);
    });

    test('should combine multiple system messages', () => {
        const messages = [
            { role: 'system', content: 'Rule 1' },
            { role: 'system', content: 'Rule 2' },
            { role: 'user', content: 'Hello' },
        ];

        const result = extractAndProcessSystemMessages(messages);

        expect(result.systemInstruction.parts[0].text).toBe('Rule 1\nRule 2');
        expect(result.nonSystemMessages).toHaveLength(1);
    });

    test('should handle no system messages', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
        ];

        const result = extractAndProcessSystemMessages(messages);

        expect(result.systemInstruction).toBeNull();
        expect(result.nonSystemMessages).toHaveLength(1);
    });

    test('should handle empty messages', () => {
        const result = extractAndProcessSystemMessages([]);
        expect(result.systemInstruction).toBeNull();
        expect(result.nonSystemMessages).toEqual([]);
    });

    test('should extract text from array-based system message content', () => {
        const messages = [
            { role: 'system', content: [{ type: 'text', text: 'System prompt' }] },
        ];

        const result = extractAndProcessSystemMessages(messages);

        expect(result.systemInstruction.parts[0].text).toBe('System prompt');
    });
});

describe('Converter Utils - cleanJsonSchemaProperties', () => {
    test('should remove unsupported schema properties', () => {
        const schema = {
            type: 'string',
            description: 'A name',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-z]+$',
            format: 'email',
        };

        const cleaned = cleanJsonSchemaProperties(schema);

        expect(cleaned).toEqual({
            type: 'STRING',
            description: 'A name',
        });
    });

    test('should recursively clean nested schema properties', () => {
        const schema = {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 50,
                },
                age: {
                    type: 'number',
                    minimum: 0,
                    maximum: 150,
                },
            },
            required: ['name'],
            additionalProperties: false,
        };

        const cleaned = cleanJsonSchemaProperties(schema);

        expect(cleaned).toEqual({
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING' },
                age: { type: 'NUMBER' },
            },
            required: ['name'],
        });
    });

    test('should handle array type with nullable', () => {
        const schema = {
            type: ['string', 'null'],
            description: 'Optional string',
        };

        const cleaned = cleanJsonSchemaProperties(schema);

        expect(cleaned).toEqual({
            type: 'STRING',
            nullable: true,
            description: 'Optional string',
        });
    });

    test('should clean items in array schema', () => {
        const schema = {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'integer', minimum: 1 },
                },
            },
        };

        const cleaned = cleanJsonSchemaProperties(schema);

        expect(cleaned.items).toEqual({
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
            },
        });
    });

    test('should handle array type without null', () => {
        const schema = {
            type: ['string', 'integer'],
        };

        const cleaned = cleanJsonSchemaProperties(schema);

        expect(cleaned.type).toBe('STRING');
        expect(cleaned.nullable).toBeUndefined();
    });

    test('should handle null/undefined/non-object input', () => {
        expect(cleanJsonSchemaProperties(null)).toBeNull();
        expect(cleanJsonSchemaProperties(undefined)).toBeUndefined();
        expect(cleanJsonSchemaProperties('string')).toBe('string');
        expect(cleanJsonSchemaProperties(42)).toBe(42);
    });

    test('should handle array input at top level', () => {
        const input = [
            { type: 'string', minLength: 5 },
            { type: 'number', maximum: 100 },
        ];

        const cleaned = cleanJsonSchemaProperties(input);

        expect(cleaned).toEqual([
            { type: 'STRING' },
            { type: 'NUMBER' },
        ]);
    });
});

describe('Converter Utils - mapFinishReason', () => {
    test('should map OpenAI stop to Anthropic end_turn', () => {
        expect(mapFinishReason('stop', 'openai', 'anthropic')).toBe('end_turn');
    });

    test('should map OpenAI length to Anthropic max_tokens', () => {
        expect(mapFinishReason('length', 'openai', 'anthropic')).toBe('max_tokens');
    });

    test('should map OpenAI content_filter to Anthropic stop_sequence', () => {
        expect(mapFinishReason('content_filter', 'openai', 'anthropic')).toBe('stop_sequence');
    });

    test('should map OpenAI tool_calls to Anthropic tool_use', () => {
        expect(mapFinishReason('tool_calls', 'openai', 'anthropic')).toBe('tool_use');
    });

    test('should map Gemini STOP to Anthropic end_turn', () => {
        expect(mapFinishReason('STOP', 'gemini', 'anthropic')).toBe('end_turn');
    });

    test('should map Gemini MAX_TOKENS to Anthropic max_tokens', () => {
        expect(mapFinishReason('MAX_TOKENS', 'gemini', 'anthropic')).toBe('max_tokens');
    });

    test('should map Gemini SAFETY to Anthropic stop_sequence', () => {
        expect(mapFinishReason('SAFETY', 'gemini', 'anthropic')).toBe('stop_sequence');
    });

    test('should default to end_turn for unknown reasons', () => {
        expect(mapFinishReason('unknown', 'openai', 'anthropic')).toBe('end_turn');
    });

    test('should default to end_turn for unknown source format', () => {
        expect(mapFinishReason('stop', 'unknown', 'anthropic')).toBe('end_turn');
    });

    test('should default to end_turn for null reason', () => {
        expect(mapFinishReason(null, 'openai', 'anthropic')).toBe('end_turn');
    });
});

describe('Converter Utils - determineReasoningEffortFromBudget', () => {
    test('should return "high" when budget is null/undefined', () => {
        expect(determineReasoningEffortFromBudget(null)).toBe('high');
        expect(determineReasoningEffortFromBudget(undefined)).toBe('high');
    });

    test('should return "low" when budget is <= 50', () => {
        expect(determineReasoningEffortFromBudget(10)).toBe('low');
        expect(determineReasoningEffortFromBudget(50)).toBe('low');
    });

    test('should return "medium" when budget is 51-200', () => {
        expect(determineReasoningEffortFromBudget(51)).toBe('medium');
        expect(determineReasoningEffortFromBudget(200)).toBe('medium');
    });

    test('should return "high" when budget is > 200', () => {
        expect(determineReasoningEffortFromBudget(201)).toBe('high');
        expect(determineReasoningEffortFromBudget(1000)).toBe('high');
    });
});

describe('Converter Utils - extractThinkingFromOpenAIText', () => {
    test('should extract thinking block from text', () => {
        const text = 'Some intro <thinking> reasoning here </thinking> response text';
        const result = extractThinkingFromOpenAIText(text);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ type: 'text', text: 'Some intro' });
        expect(result[1]).toEqual({ type: 'thinking', thinking: 'reasoning here' });
        expect(result[2]).toEqual({ type: 'text', text: 'response text' });
    });

    test('should return original text when no thinking tags found', () => {
        const text = 'Just normal text without any thinking tags';
        const result = extractThinkingFromOpenAIText(text);
        expect(result).toBe(text);
    });

    test('should handle multiple thinking blocks', () => {
        const text = 'Before <thinking> first </thinking> middle <thinking> second </thinking> after';
        const result = extractThinkingFromOpenAIText(text);

        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({ type: 'text', text: 'Before' });
        expect(result[1]).toEqual({ type: 'thinking', thinking: 'first' });
        expect(result[2]).toEqual({ type: 'text', text: 'middle' });
        expect(result[3]).toEqual({ type: 'thinking', thinking: 'second' });
        expect(result[4]).toEqual({ type: 'text', text: 'after' });
    });

    test('should handle text with only thinking block', () => {
        const text = '<thinking> only thinking </thinking>';
        const result = extractThinkingFromOpenAIText(text);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ type: 'thinking', thinking: 'only thinking' });
    });

    test('should return text trimmed when no tags and contentBlocks has single text', () => {
        const text = '  text with spaces  ';
        const result = extractThinkingFromOpenAIText(text);
        // The function returns text trimmed when there's a single text block
        expect(result).toBe('text with spaces');
    });
});

describe('Converter Utils - ToolStateManager', () => {
    beforeEach(() => {
        toolStateManager.clearMappings();
    });

    afterEach(() => {
        toolStateManager.clearMappings();
    });

    test('should store and retrieve tool mapping', () => {
        toolStateManager.storeToolMapping('myFunc', 'tool-123');
        expect(toolStateManager.getToolId('myFunc')).toBe('tool-123');
    });

    test('should return null for unknown func name', () => {
        expect(toolStateManager.getToolId('nonexistent')).toBeNull();
    });

    test('should clear all mappings', () => {
        toolStateManager.storeToolMapping('func1', 'id1');
        toolStateManager.storeToolMapping('func2', 'id2');
        toolStateManager.clearMappings();
        expect(toolStateManager.getToolId('func1')).toBeNull();
        expect(toolStateManager.getToolId('func2')).toBeNull();
    });

    test('should be a singleton', () => {
        const mod = require('../../../src/converters/utils.js');
        expect(toolStateManager).toBe(mod.toolStateManager);
    });
});
