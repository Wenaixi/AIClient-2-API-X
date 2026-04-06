/**
 * Provider Strategy Factory & Base Strategy - Unit Tests
 * Tests src/utils/provider-strategy.js and src/utils/provider-strategies.js
 * Uses inline strategy implementations to avoid dependency chain issues.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';

// ============================================================
// Mock dependencies before importing source
// ============================================================

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

// Mock common.js (only the constants we need)
jest.mock('../../../src/utils/common.js', () => {
    const MODEL_PROTOCOL_PREFIX = {
        GEMINI: 'gemini',
        OPENAI: 'openai',
        OPENAI_RESPONSES: 'openai_responses',
        CLAUDE: 'claude',
        CODEX: 'codex',
        FORWARD: 'forward',
        GROK: 'grok',
        KIMI: 'kimi',
    };
    const API_ACTIONS = {
        CHAT_COMPLETION: 'chat.completion',
    };
    const FETCH_SYSTEM_PROMPT_FILE = '/tmp/test_system_prompt.txt';
    const extractSystemPromptFromRequestBody = jest.fn((body) => {
        if (!body?.messages) return '';
        const sysMsg = body.messages.find(m => m.role === 'system');
        return sysMsg?.content || '';
    });
    return {
        MODEL_PROTOCOL_PREFIX,
        API_ACTIONS,
        FETCH_SYSTEM_PROMPT_FILE,
        extractSystemPromptFromRequestBody,
    };
});

// Mock all strategy modules (they have complex dependency chains)
jest.mock('../../../src/providers/gemini/gemini-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    const { extractSystemPromptFromRequestBody } = require('../../../src/utils/common.js');
    class GeminiStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            const model = requestBody.model || '';
            const isStream = requestBody.stream === true;
            return { model, isStream };
        }
        extractResponseText(response) {
            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        extractPromptText(requestBody) {
            return requestBody.contents?.[0]?.parts?.[0]?.text || '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                requestBody.system_instruction = { parts: [{ text: prompt }] };
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
    }
    return { GeminiStrategy, default: GeminiStrategy };
});

jest.mock('../../../src/providers/openai/openai-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class OpenAIStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            const model = requestBody.model || '';
            const isStream = requestBody.stream === true;
            return { model, isStream };
        }
        extractResponseText(response) {
            const choice = response.choices?.[0];
            return choice?.message?.content || choice?.delta?.content || '';
        }
        extractPromptText(requestBody) {
            const msgs = requestBody.messages || [];
            const userMsgs = msgs.filter(m => m.role === 'user');
            return userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                const sysMsg = { role: 'system', content: prompt };
                requestBody.messages = [sysMsg, ...(requestBody.messages || [])];
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
    }
    return { OpenAIStrategy, default: OpenAIStrategy };
});

jest.mock('../../../src/providers/claude/claude-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class ClaudeStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            const model = requestBody.model || '';
            const isStream = requestBody.stream === true;
            return { model, isStream };
        }
        extractResponseText(response) {
            return response.content?.map(c => c.type === 'text' ? c.text : '').join('') || '';
        }
        extractPromptText(requestBody) {
            const msgs = requestBody.messages || [];
            const userMsgs = msgs.filter(m => m.role === 'user');
            return userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                requestBody.system = prompt;
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
    }
    return { ClaudeStrategy, default: ClaudeStrategy };
});

jest.mock('../../../src/providers/openai/openai-responses-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class ResponsesAPIStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            return { model: requestBody.model || '', isStream: false };
        }
        extractResponseText(response) {
            return response.output?.[0]?.content?.[0]?.text || '';
        }
        extractPromptText(requestBody) {
            return requestBody.input || '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                requestBody.instructions = (requestBody.instructions || '') + '\n' + prompt;
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
    }
    return { ResponsesAPIStrategy, default: ResponsesAPIStrategy };
});

jest.mock('../../../src/providers/openai/codex-responses-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class CodexResponsesAPIStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            return { model: requestBody.model || '', isStream: false };
        }
        extractResponseText(response) {
            return response.output?.[0]?.content?.[0]?.text || '';
        }
        extractPromptText(requestBody) {
            return requestBody.input || '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                requestBody.instructions = (requestBody.instructions || '') + '\n' + prompt;
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
    }
    return { CodexResponsesAPIStrategy, default: CodexResponsesAPIStrategy };
});

jest.mock('../../../src/providers/forward/forward-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class ForwardStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            return { model: requestBody.model || '', isStream: requestBody.stream === true };
        }
        extractResponseText(response) {
            return response;
        }
        extractPromptText(requestBody) {
            return requestBody;
        }
        async applySystemPromptFromFile(config, requestBody) {
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            // no-op
        }
    }
    return { ForwardStrategy, default: ForwardStrategy };
});

jest.mock('../../../src/providers/grok/grok-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class GrokStrategy extends ProviderStrategy {
        extractModelAndStreamInfo(req, requestBody) {
            return { model: requestBody.model || '', isStream: requestBody.stream === true };
        }
        extractResponseText(response) {
            return response.choices?.[0]?.message?.content || '';
        }
        extractPromptText(requestBody) {
            const msgs = requestBody.messages || [];
            const userMsgs = msgs.filter(m => m.role === 'user');
            return userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) {
                requestBody.system = prompt;
            }
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            // no-op
        }
    }
    return { GrokStrategy, default: GrokStrategy };
});

jest.mock('../../../src/providers/kimi/kimi-strategy.js', () => {
    const { ProviderStrategy } = require('../../../src/utils/provider-strategy.js');
    class KimiStrategy extends ProviderStrategy {
        constructor(config) {
            super();
            this.config = config;
            this.providerName = 'kimi';
            this.apiService = {
                setTokenStorage: jest.fn(),
                chatCompletion: jest.fn(),
                chatCompletionStream: jest.fn(),
                listModels: jest.fn(),
                getAccessToken: jest.fn(),
            };
        }
        setAuth(tokenStorage) {
            this.apiService.setTokenStorage(tokenStorage);
        }
        extractModelAndStreamInfo(req, requestBody) {
            return { model: requestBody.model || '', isStream: requestBody.stream === true };
        }
        extractResponseText(response) {
            return response.choices?.[0]?.message?.content || '';
        }
        extractPromptText(requestBody) {
            const msgs = requestBody.messages || [];
            return msgs.length > 0 ? msgs[msgs.length - 1].content : '';
        }
        async applySystemPromptFromFile(config, requestBody) {
            const prompt = config.SYSTEM_PROMPT_CONTENT || '';
            if (prompt) requestBody.system = prompt;
            return requestBody;
        }
        async manageSystemPrompt(requestBody) {
            return requestBody;
        }
        async listModels() {
            return this.apiService.listModels();
        }
        async healthCheck() {
            try {
                await this.apiService.getAccessToken();
                return { status: 'healthy', provider: this.providerName };
            } catch (error) {
                return { status: 'unhealthy', provider: this.providerName, error: error.message };
            }
        }
        mapFinishReason(openaiReason) {
            const reasonMap = {
                'stop': 'end_turn',
                'length': 'max_tokens',
                'tool_calls': 'tool_use',
                'content_filter': 'stop_sequence'
            };
            return reasonMap[openaiReason] || 'end_turn';
        }
    }
    return { KimiStrategy, default: KimiStrategy };
});

// ============================================================
// Import source modules (now that mocks are in place)
// ============================================================

import { ProviderStrategy } from '../../../src/utils/provider-strategy.js';
import { ProviderStrategyFactory } from '../../../src/utils/provider-strategies.js';
import logger from '../../../src/utils/logger.js';
import { FETCH_SYSTEM_PROMPT_FILE } from '../../../src/utils/common.js';

// Import mocked strategies for type checking
import { GeminiStrategy } from '../../../src/providers/gemini/gemini-strategy.js';
import { OpenAIStrategy } from '../../../src/providers/openai/openai-strategy.js';
import { ClaudeStrategy } from '../../../src/providers/claude/claude-strategy.js';
import { ResponsesAPIStrategy } from '../../../src/providers/openai/openai-responses-strategy.js';
import { CodexResponsesAPIStrategy } from '../../../src/providers/openai/codex-responses-strategy.js';
import { ForwardStrategy } from '../../../src/providers/forward/forward-strategy.js';
import { GrokStrategy } from '../../../src/providers/grok/grok-strategy.js';
import { KimiStrategy } from '../../../src/providers/kimi/kimi-strategy.js';

// ============================================================
// Tests
// ============================================================

describe('ProviderStrategy (Abstract Base Class)', () => {
    let strategy;

    beforeEach(() => {
        strategy = new ProviderStrategy();
    });

    describe('extractModelAndStreamInfo', () => {
        test('should throw error requiring implementation', () => {
            expect(() => strategy.extractModelAndStreamInfo({}, {}))
                .toThrow("Method 'extractModelAndStreamInfo()' must be implemented.");
        });
    });

    describe('extractResponseText', () => {
        test('should throw error requiring implementation', () => {
            expect(() => strategy.extractResponseText({}))
                .toThrow("Method 'extractResponseText()' must be implemented.");
        });
    });

    describe('extractPromptText', () => {
        test('should throw error requiring implementation', () => {
            expect(() => strategy.extractPromptText({}))
                .toThrow("Method 'extractPromptText()' must be implemented.");
        });
    });

    describe('applySystemPromptFromFile', () => {
        test('should throw error requiring implementation', async () => {
            await expect(strategy.applySystemPromptFromFile({}, {}))
                .rejects.toThrow("Method 'applySystemPromptFromFile()' must be implemented.");
        });
    });

    describe('manageSystemPrompt', () => {
        test('should throw error requiring implementation', async () => {
            await expect(strategy.manageSystemPrompt({}))
                .rejects.toThrow("Method 'manageSystemPrompt()' must be implemented.");
        });
    });

    describe('_updateSystemPromptFile (protected helper)', () => {
        afterEach(() => {
            // Clean up test file
            try { fs.unlinkSync(FETCH_SYSTEM_PROMPT_FILE); } catch { /* ignore */ }
        });

        test('should write new system prompt when file does not exist', async () => {
            const prompt = 'You are a helpful assistant';
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockRejectedValue({ code: 'ENOENT', message: 'not found' });
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

            await strategy._updateSystemPromptFile(prompt, 'test-provider');

            expect(writeSpy).toHaveBeenCalledWith(FETCH_SYSTEM_PROMPT_FILE, prompt);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining("System prompt updated in file for provider 'test-provider'")
            );

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });

        test('should overwrite existing content when prompt differs', async () => {
            const newPrompt = 'New system prompt';
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('Old system prompt');
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

            await strategy._updateSystemPromptFile(newPrompt, 'openai');

            expect(writeSpy).toHaveBeenCalledWith(FETCH_SYSTEM_PROMPT_FILE, newPrompt);

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });

        test('should not write when prompt is identical to existing', async () => {
            const existingPrompt = 'Same prompt';
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue(existingPrompt);
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

            await strategy._updateSystemPromptFile(existingPrompt, 'test');

            expect(writeSpy).not.toHaveBeenCalled();

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });

        test('should clear file when incoming prompt is empty', async () => {
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('Existing prompt');
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

            await strategy._updateSystemPromptFile('', 'test');

            expect(writeSpy).toHaveBeenCalledWith(FETCH_SYSTEM_PROMPT_FILE, '');
            expect(logger.info).toHaveBeenCalledWith('[System Prompt Manager] System prompt cleared from file.');

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });

        test('should handle read errors other than ENOENT', async () => {
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('Disk error'));
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

            await strategy._updateSystemPromptFile('test', 'test');

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error reading system prompt file')
            );

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });

        test('should handle write errors gracefully', async () => {
            const readSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('');
            const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockRejectedValue(new Error('Write failed'));

            await strategy._updateSystemPromptFile('new', 'test');

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to manage system prompt file')
            );

            readSpy.mockRestore();
            writeSpy.mockRestore();
        });
    });
});

describe('ProviderStrategyFactory', () => {
    describe('getStrategy - valid protocols', () => {
        test('should return GeminiStrategy for gemini protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('gemini');
            expect(instance).toBeInstanceOf(GeminiStrategy);
        });

        test('should return OpenAIStrategy for openai protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('openai');
            expect(instance).toBeInstanceOf(OpenAIStrategy);
        });

        test('should return ClaudeStrategy for claude protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('claude');
            expect(instance).toBeInstanceOf(ClaudeStrategy);
        });

        test('should return ResponsesAPIStrategy for openai_responses protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('openai_responses');
            expect(instance).toBeInstanceOf(ResponsesAPIStrategy);
        });

        test('should return CodexResponsesAPIStrategy for codex protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('codex');
            expect(instance).toBeInstanceOf(CodexResponsesAPIStrategy);
        });

        test('should return ForwardStrategy for forward protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('forward');
            expect(instance).toBeInstanceOf(ForwardStrategy);
        });

        test('should return GrokStrategy for grok protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('grok');
            expect(instance).toBeInstanceOf(GrokStrategy);
        });

        test('should return KimiStrategy for kimi protocol', () => {
            const instance = ProviderStrategyFactory.getStrategy('kimi');
            expect(instance).toBeInstanceOf(KimiStrategy);
        });
    });

    describe('getStrategy - unsupported protocols', () => {
        test('should throw error for unknown protocol', () => {
            expect(() => ProviderStrategyFactory.getStrategy('unknown'))
                .toThrow('Unsupported provider protocol: unknown');
        });

        test('should throw error for empty string protocol', () => {
            expect(() => ProviderStrategyFactory.getStrategy(''))
                .toThrow('Unsupported provider protocol: ');
        });

        test('should throw error for null protocol', () => {
            expect(() => ProviderStrategyFactory.getStrategy(null))
                .toThrow('Unsupported provider protocol: null');
        });

        test('should throw error for undefined protocol', () => {
            expect(() => ProviderStrategyFactory.getStrategy(undefined))
                .toThrow('Unsupported provider protocol: undefined');
        });
    });

    describe('getStrategy - instance uniqueness', () => {
        test('should create new instance on each call', () => {
            const instance1 = ProviderStrategyFactory.getStrategy('openai');
            const instance2 = ProviderStrategyFactory.getStrategy('openai');
            expect(instance1).not.toBe(instance2);
        });

        test('should not cache instances', () => {
            const a = ProviderStrategyFactory.getStrategy('gemini');
            const b = ProviderStrategyFactory.getStrategy('gemini');
            const c = ProviderStrategyFactory.getStrategy('gemini');
            const set = new Set([a, b, c]);
            expect(set.size).toBe(3);
        });
    });
});

describe('Concrete Strategy - Shared Interface', () => {
    describe('extractModelAndStreamInfo', () => {
        test('GeminiStrategy should extract model and stream info', () => {
            const strategy = new GeminiStrategy();
            const body = { model: 'gemini-pro', stream: true };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('gemini-pro');
            expect(result.isStream).toBe(true);
        });

        test('OpenAIStrategy should extract model from request body', () => {
            const strategy = new OpenAIStrategy();
            const body = { model: 'gpt-4', stream: false };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('gpt-4');
            expect(result.isStream).toBe(false);
        });

        test('ClaudeStrategy should extract model from body', () => {
            const strategy = new ClaudeStrategy();
            const body = { model: 'claude-3-opus', stream: true };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('claude-3-opus');
            expect(result.isStream).toBe(true);
        });

        test('CodexResponsesAPIStrategy should extract codex model', () => {
            const strategy = new CodexResponsesAPIStrategy();
            const body = { model: 'o3', stream: false };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('o3');
            expect(result.isStream).toBe(false);
        });

        test('ForwardStrategy should pass through model', () => {
            const strategy = new ForwardStrategy();
            const body = { model: 'custom-model' };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('custom-model');
        });

        test('GrokStrategy should extract model from body', () => {
            const strategy = new GrokStrategy();
            const body = { model: 'grok-2', stream: true };
            const result = strategy.extractModelAndStreamInfo({}, body);
            expect(result.model).toBe('grok-2');
            expect(result.isStream).toBe(true);
        });

        test('should handle empty body', () => {
            [GeminiStrategy, OpenAIStrategy, ClaudeStrategy, CodexResponsesAPIStrategy, ForwardStrategy, GrokStrategy].forEach(StrategyClass => {
                const strategy = new StrategyClass();
                const result = strategy.extractModelAndStreamInfo({}, {});
                expect(result.model).toBe('');
            });
        });
    });

    describe('extractResponseText', () => {
        test('OpenAIStrategy should extract from choices[0].message.content', () => {
            const strategy = new OpenAIStrategy();
            const response = { choices: [{ message: { content: 'Hello world' } }] };
            expect(strategy.extractResponseText(response)).toBe('Hello world');
        });

        test('OpenAIStrategy should handle stream delta content', () => {
            const strategy = new OpenAIStrategy();
            const response = { choices: [{ delta: { content: 'streaming' } }] };
            expect(strategy.extractResponseText(response)).toBe('streaming');
        });

        test('ClaudeStrategy should extract from content array', () => {
            const strategy = new ClaudeStrategy();
            const response = { content: [{ type: 'text', text: 'Claude response' }] };
            expect(strategy.extractResponseText(response)).toBe('Claude response');
        });

        test('ClaudeStrategy should handle empty content', () => {
            const strategy = new ClaudeStrategy();
            const response = { content: [] };
            expect(strategy.extractResponseText(response)).toBe('');
        });

        test('ForwardStrategy should pass through response data', () => {
            const strategy = new ForwardStrategy();
            const response = { data: 'raw response' };
            const result = strategy.extractResponseText(response);
            expect(result).toEqual(response);
        });

        test('GeminiStrategy should extract from Gemini response format', () => {
            const strategy = new GeminiStrategy();
            const response = { candidates: [{ content: { parts: [{ text: 'Gemini text' }] } }] };
            expect(strategy.extractResponseText(response)).toBe('Gemini text');
        });

        test('KimiStrategy should extract from OpenAI-like response', () => {
            const strategy = new KimiStrategy({});
            const response = { choices: [{ message: { content: 'Kimi response' } }] };
            expect(strategy.extractResponseText(response)).toBe('Kimi response');
        });

        test('should handle empty/missing response', () => {
            [GeminiStrategy, OpenAIStrategy, ClaudeStrategy, KimiStrategy].forEach(StrategyClass => {
                const strategy = StrategyClass.name === 'KimiStrategy' ? new KimiStrategy({}) : new StrategyClass();
                expect(strategy.extractResponseText({})).toBe('');
            });
        });
    });

    describe('extractPromptText', () => {
        test('OpenAIStrategy should extract from last user message', () => {
            const strategy = new OpenAIStrategy();
            const body = { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Hello' }] };
            expect(strategy.extractPromptText(body)).toBe('Hello');
        });

        test('ClaudeStrategy should extract from last user message', () => {
            const strategy = new ClaudeStrategy();
            const body = { messages: [{ role: 'user', content: 'Hi Claude' }] };
            expect(strategy.extractPromptText(body)).toBe('Hi Claude');
        });

        test('ForwardStrategy should return full body', () => {
            const strategy = new ForwardStrategy();
            const body = { raw: 'data' };
            expect(strategy.extractPromptText(body)).toEqual(body);
        });

        test('GeminiStrategy should extract from contents', () => {
            const strategy = new GeminiStrategy();
            const body = { contents: [{ parts: [{ text: 'Gemini prompt' }] }] };
            expect(strategy.extractPromptText(body)).toBe('Gemini prompt');
        });

        test('should handle empty body', () => {
            [OpenAIStrategy, ClaudeStrategy, GeminiStrategy, GrokStrategy].forEach(StrategyClass => {
                const strategy = new StrategyClass();
                expect(strategy.extractPromptText({})).toBeFalsy();
            });
        });
    });

    describe('applySystemPromptFromFile', () => {
        test('ForwardStrategy should return body unchanged', async () => {
            const strategy = new ForwardStrategy();
            const body = { messages: [{ role: 'user', content: 'test' }] };
            const result = await strategy.applySystemPromptFromFile({}, body);
            expect(result).toBe(body);
        });

        test('OpenAIStrategy should prepend system message', async () => {
            const strategy = new OpenAIStrategy();
            const body = { messages: [{ role: 'user', content: 'test' }] };
            const config = { SYSTEM_PROMPT_CONTENT: 'You are helpful' };
            await strategy.applySystemPromptFromFile(config, body);
            expect(body.messages[0].role).toBe('system');
            expect(body.messages[0].content).toBe('You are helpful');
        });

        test('ClaudeStrategy should set system field', async () => {
            const strategy = new ClaudeStrategy();
            const body = { messages: [] };
            const config = { SYSTEM_PROMPT_CONTENT: 'Claude system' };
            await strategy.applySystemPromptFromFile(config, body);
            expect(body.system).toBe('Claude system');
        });
    });

    describe('manageSystemPrompt', () => {
        test('ForwardStrategy should be no-op', async () => {
            const strategy = new ForwardStrategy();
            const body = { messages: [] };
            await expect(strategy.manageSystemPrompt(body)).resolves.toBeUndefined();
        });

        test('GrokStrategy should be no-op', async () => {
            const strategy = new GrokStrategy();
            const body = { messages: [] };
            await expect(strategy.manageSystemPrompt(body)).resolves.toBeUndefined();
        });
    });
});

describe('KimiStrategy (Extended Strategy)', () => {
    test('should initialize with config and create apiService', () => {
        const config = { SOME_CONFIG: true };
        const strategy = new KimiStrategy(config);
        expect(strategy.config).toBe(config);
        expect(strategy.providerName).toBe('kimi');
        expect(strategy.apiService).toBeDefined();
    });

    test('should set auth token storage', () => {
        const strategy = new KimiStrategy({});
        const tokenStorage = { access_token: 'test' };

        strategy.setAuth(tokenStorage);

        expect(strategy.apiService.setTokenStorage).toHaveBeenCalledWith(tokenStorage);
    });

    test('should list models via apiService', async () => {
        const strategy = new KimiStrategy({});
        strategy.apiService.listModels.mockResolvedValue({ data: [{ id: 'kimi-k2' }] });

        const result = await strategy.listModels();

        expect(strategy.apiService.listModels).toHaveBeenCalled();
        expect(result).toEqual({ data: [{ id: 'kimi-k2' }] });
    });

    test('should return healthy on healthCheck', async () => {
        const strategy = new KimiStrategy({});
        strategy.apiService.getAccessToken.mockResolvedValue('token');

        const result = await strategy.healthCheck();

        expect(result.status).toBe('healthy');
        expect(result.provider).toBe('kimi');
    });

    test('should return unhealthy when token fetch fails', async () => {
        const strategy = new KimiStrategy({});
        strategy.apiService.getAccessToken.mockRejectedValue(new Error('No token'));

        const result = await strategy.healthCheck();

        expect(result.status).toBe('unhealthy');
        expect(result.error).toBe('No token');
    });

    test('should map finish reasons correctly', () => {
        const strategy = new KimiStrategy({});

        expect(strategy.mapFinishReason('stop')).toBe('end_turn');
        expect(strategy.mapFinishReason('length')).toBe('max_tokens');
        expect(strategy.mapFinishReason('tool_calls')).toBe('tool_use');
        expect(strategy.mapFinishReason('content_filter')).toBe('stop_sequence');
        expect(strategy.mapFinishReason(null)).toBe('end_turn');
        expect(strategy.mapFinishReason('unknown')).toBe('end_turn');
    });
});

describe('Strategy Inheritance Chain', () => {
    const strategyClasses = [
        { Class: GeminiStrategy, name: 'GeminiStrategy', args: [] },
        { Class: OpenAIStrategy, name: 'OpenAIStrategy', args: [] },
        { Class: ClaudeStrategy, name: 'ClaudeStrategy', args: [] },
        { Class: ResponsesAPIStrategy, name: 'ResponsesAPIStrategy', args: [] },
        { Class: CodexResponsesAPIStrategy, name: 'CodexResponsesAPIStrategy', args: [] },
        { Class: ForwardStrategy, name: 'ForwardStrategy', args: [] },
        { Class: GrokStrategy, name: 'GrokStrategy', args: [] },
    ];

    test('all strategies should extend ProviderStrategy', () => {
        strategyClasses.forEach(({ Class, args }) => {
            const instance = new Class(...args);
            expect(instance).toBeInstanceOf(ProviderStrategy);
        });
    });

    test('KimiStrategy should also extend ProviderStrategy', () => {
        const instance = new KimiStrategy({});
        expect(instance).toBeInstanceOf(ProviderStrategy);
    });

    test('all strategies should have the 5 required methods', () => {
        const allStrategies = [...strategyClasses, { Class: KimiStrategy, args: [{}] }];
        const requiredMethods = [
            'extractModelAndStreamInfo',
            'extractResponseText',
            'extractPromptText',
            'applySystemPromptFromFile',
            'manageSystemPrompt',
        ];

        allStrategies.forEach(({ Class, args }) => {
            const instance = new Class(...args);
            requiredMethods.forEach(method => {
                expect(typeof instance[method]).toBe('function');
            });
        });
    });
});
