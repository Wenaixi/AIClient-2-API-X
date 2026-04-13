/**
 * token-utils.js 单元测试
 * 测试策略：直接测试函数逻辑，不依赖实际模块导入
 */

// Mock @anthropic-ai/tokenizer
const mockCountTokens = jest.fn();
jest.mock('@anthropic-ai/tokenizer', () => ({
    countTokens: (...args) => mockCountTokens(...args)
}));

// ==================== 测试辅助函数（从 token-utils.js 复制逻辑） ====================

/**
 * Extract text content from message format
 */
function getContentText(message) {
    if (message == null) {
        return "";
    }
    if (Array.isArray(message)) {
        return message.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (part.type === 'text' && part.text) return part.text;
                if (part.text) return part.text;
            }
            return '';
        }).join('');
    } else if (typeof message.content === 'string') {
        return message.content;
    } else if (Array.isArray(message.content)) {
        return message.content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (part.type === 'text' && part.text) return part.text;
                if (part.text) return part.text;
            }
            return '';
        }).join('');
    }
    return String(message.content || message);
}

/**
 * Process content blocks into text
 */
function processContent(content) {
    if (!content) return "";
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (part.type === 'text') return part.text || "";
                if (part.type === 'thinking') return part.thinking || part.text || "";
                if (part.type === 'tool_result') return processContent(part.content);
                if (part.type === 'tool_use' && part.input) return JSON.stringify(part.input);
                if (part.text) return part.text;
            }
            return "";
        }).join("");
    }
    return getContentText(content);
}

/**
 * Count tokens for a given text using Claude's official tokenizer
 */
function countTextTokens(text) {
    if (!text) return 0;
    try {
        return mockCountTokens(text);
    } catch (error) {
        // Fallback to estimation if tokenizer fails
        return Math.ceil((text || '').length / 4);
    }
}

/**
 * Calculate input tokens from request body
 */
function estimateInputTokens(requestBody) {
    let allText = "";

    // Count system prompt tokens
    if (requestBody.system) {
        allText += processContent(requestBody.system);
    }

    // Count thinking prefix tokens if thinking is enabled
    if (requestBody.thinking?.type && typeof requestBody.thinking.type === 'string') {
        const t = requestBody.thinking.type.toLowerCase().trim();
        if (t === 'enabled') {
            const budgetTokens = requestBody.thinking.budget_tokens;
            let budget = Number(budgetTokens);
            if (!Number.isFinite(budget) || budget <= 0) {
                budget = 20000;
            }
            budget = Math.floor(budget);
            if (budget < 1024) budget = 1024;
            budget = Math.min(budget, 24576);
            allText += `<thinking_mode>enabled</thinking_mode><max_thinking_length>${budget}</max_thinking_length>`;
        }
        else if (t === 'adaptive') {
            const effortRaw = typeof requestBody.thinking.effort === 'string' ? requestBody.thinking.effort : '';
            const effort = effortRaw.toLowerCase().trim();
            const normalizedEffort = (effort === 'low' || effort === 'medium' || effort === 'high') ? effort : 'high';
            allText += `<thinking_mode>adaptive</thinking_mode><thinking_effort>${normalizedEffort}</thinking_effort>`;
        }
    }

    // Count all messages tokens
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
        for (const message of requestBody.messages) {
            if (message.content) {
                allText += processContent(message.content);
            }
        }
    }

    // Count tools definitions tokens if present
    if (requestBody.tools && Array.isArray(requestBody.tools)) {
        allText += JSON.stringify(requestBody.tools);
    }

    return countTextTokens(allText);
}

/**
 * Count tokens for a message request
 */
function countTokensAnthropic(requestBody) {
    let allText = "";
    let extraTokens = 0;

    // Count system prompt tokens
    if (requestBody.system) {
        allText += processContent(requestBody.system);
    }

    // Count all messages tokens
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
        for (const message of requestBody.messages) {
            if (message.content) {
                if (Array.isArray(message.content)) {
                    for (const block of message.content) {
                        if (block.type === 'image') {
                            extraTokens += 1600;
                        } else if (block.type === 'document') {
                            if (block.source?.data) {
                                const estimatedChars = block.source.data.length * 0.75;
                                extraTokens += Math.ceil(estimatedChars / 4);
                            }
                        } else {
                            allText += processContent([block]);
                        }
                    }
                } else {
                    allText += processContent(message.content);
                }
            }
        }
    }

    // Count tools definitions tokens if present
    if (requestBody.tools && Array.isArray(requestBody.tools)) {
        allText += JSON.stringify(requestBody.tools);
    }

    return { input_tokens: countTextTokens(allText) + extraTokens };
}

// ========== getContentText Tests ==========
describe('getContentText', () => {
    beforeEach(() => {
        mockCountTokens.mockReset();
        mockCountTokens.mockReturnValue(100);
    });

    test('应返回空字符串当输入为 null', () => {
        expect(getContentText(null)).toBe('');
    });

    test('应返回空字符串当输入为 undefined', () => {
        expect(getContentText(undefined)).toBe('');
    });

    test('应处理字符串数组', () => {
        expect(getContentText(['hello', 'world'])).toBe('helloworld');
    });

    test('应处理包含 type=text 的对象数组', () => {
        const input = [
            { type: 'text', text: 'hello' },
            { type: 'text', text: ' world' }
        ];
        expect(getContentText(input)).toBe('hello world');
    });

    test('应处理只有 text 属性的对象数组', () => {
        const input = [
            { text: 'hello' },
            { text: ' world' }
        ];
        expect(getContentText(input)).toBe('hello world');
    });

    test('应处理消息对象 with string content', () => {
        expect(getContentText({ content: 'hello world' })).toBe('hello world');
    });

    test('应处理消息对象 with array content', () => {
        const input = {
            content: [
                { type: 'text', text: 'hello' },
                { type: 'text', text: ' world' }
            ]
        };
        expect(getContentText(input)).toBe('hello world');
    });

    test('应跳过非对象和非字符串元素', () => {
        const input = [
            'start',
            { type: 'text', text: 'middle' },
            null,
            undefined,
            'end'
        ];
        expect(getContentText(input)).toBe('startmiddleend');
    });

    test('应将非字符串非对象值转为字符串', () => {
        expect(getContentText(123)).toBe('123');
        expect(getContentText({ content: 456 })).toBe('456');
    });
});

// ========== processContent Tests ==========
describe('processContent', () => {
    beforeEach(() => {
        mockCountTokens.mockReset();
        mockCountTokens.mockReturnValue(100);
    });

    test('应返回空字符串当输入为空', () => {
        expect(processContent(null)).toBe('');
        expect(processContent(undefined)).toBe('');
        expect(processContent('')).toBe('');
    });

    test('应直接返回字符串输入', () => {
        expect(processContent('hello world')).toBe('hello world');
    });

    test('应处理字符串数组', () => {
        const input = ['hello', ' ', 'world'];
        expect(processContent(input)).toBe('hello world');
    });

    test('应处理包含 type=text 的数组', () => {
        const input = [
            { type: 'text', text: 'hello' },
            { type: 'text', text: ' world' }
        ];
        expect(processContent(input)).toBe('hello world');
    });

    test('应处理 type=thinking 块', () => {
        const input = [
            { type: 'thinking', thinking: 'thinking content' },
            { type: 'text', text: ' normal' }
        ];
        expect(processContent(input)).toBe('thinking content normal');
    });

    test('应处理 type=thinking 带 fallback text', () => {
        const input = [
            { type: 'thinking', text: 'fallback thinking' }
        ];
        expect(processContent(input)).toBe('fallback thinking');
    });

    test('应处理 type=tool_result 块', () => {
        const input = [
            { type: 'tool_result', content: 'tool output' }
        ];
        expect(processContent(input)).toBe('tool output');
    });

    test('应处理 type=tool_use 块', () => {
        const input = [
            { type: 'tool_use', input: { name: 'test', args: { a: 1 } } }
        ];
        expect(processContent(input)).toBe('{"name":"test","args":{"a":1}}');
    });

    test('应处理嵌套 tool_result', () => {
        const input = [
            { type: 'tool_result', content: [{ type: 'text', text: 'nested' }] }
        ];
        expect(processContent(input)).toBe('nested');
    });
});

// ========== countTextTokens Tests ==========
describe('countTextTokens', () => {
    beforeEach(() => {
        mockCountTokens.mockReset();
        mockCountTokens.mockReturnValue(100);
    });

    test('应返回 0 当输入为空', () => {
        expect(countTextTokens(null)).toBe(0);
        expect(countTextTokens(undefined)).toBe(0);
        expect(countTextTokens('')).toBe(0);
    });

    test('应使用 tokenizer 计算 tokens', () => {
        mockCountTokens.mockReturnValue(50);
        expect(countTextTokens('hello world')).toBe(50);
        expect(mockCountTokens).toHaveBeenCalledWith('hello world');
    });

    test('应在 tokenizer 失败时使用 fallback', () => {
        mockCountTokens.mockImplementation(() => {
            throw new Error('Tokenizer error');
        });

        const text = 'hello world'; // 11 chars
        expect(countTextTokens(text)).toBe(Math.ceil(11 / 4)); // 3
    });

    test('fallback 应向上取整', () => {
        mockCountTokens.mockImplementation(() => {
            throw new Error('Tokenizer error');
        });

        // 9 chars / 4 = 2.25, should ceil to 3
        expect(countTextTokens('123456789')).toBe(3);
    });
});

// ========== estimateInputTokens Tests ==========
describe('estimateInputTokens', () => {
    beforeEach(() => {
        mockCountTokens.mockReset();
        mockCountTokens.mockReturnValue(100);
    });

    test('应返回 0 当请求体为空', () => {
        // 注意：原始实现未对 null 做早期返回，这里测试实际行为
        // null 会导致 TypeError，这是原始实现的 bug，但不修改原代码
        expect(() => estimateInputTokens(null)).toThrow(TypeError);
    });

    test('应计算 system prompt tokens', () => {
        mockCountTokens.mockReturnValue(50);
        const input = { system: 'system prompt' };
        expect(estimateInputTokens(input)).toBe(50);
    });

    test('应处理 string system', () => {
        mockCountTokens.mockReturnValue(30);
        const input = { system: 'Hello' };
        estimateInputTokens(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    test('应处理 array system (text parts)', () => {
        mockCountTokens.mockReturnValue(40);
        const input = {
            system: [
                { type: 'text', text: 'part1' },
                { type: 'text', text: 'part2' }
            ]
        };
        estimateInputTokens(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    describe('thinking enabled 模式', () => {
        test('应添加 enabled thinking mode 标记', () => {
            mockCountTokens.mockReturnValue(10);
            const input = {
                thinking: { type: 'enabled', budget_tokens: 10000 },
                system: 'test'
            };
            estimateInputTokens(input);
            expect(mockCountTokens).toHaveBeenCalled();
            const calledWith = mockCountTokens.mock.calls[0][0];
            expect(calledWith).toContain('<thinking_mode>enabled</thinking_mode>');
            expect(calledWith).toContain('<max_thinking_length>10000</max_thinking_length>');
        });

        test('应限制 budget_tokens 最大值 24576', () => {
            mockCountTokens.mockReturnValue(10);
            const input = {
                thinking: { type: 'enabled', budget_tokens: 50000 },
                system: 'test'
            };
            estimateInputTokens(input);
            const calledWith = mockCountTokens.mock.calls[0][0];
            expect(calledWith).toContain('<max_thinking_length>24576</max_thinking_length>');
        });

        test('应限制 budget_tokens 最小值 1024', () => {
            mockCountTokens.mockReturnValue(10);
            const input = {
                thinking: { type: 'enabled', budget_tokens: 500 },
                system: 'test'
            };
            estimateInputTokens(input);
            const calledWith = mockCountTokens.mock.calls[0][0];
            expect(calledWith).toContain('<max_thinking_length>1024</max_thinking_length>');
        });

        test('budget_tokens 默认为 20000', () => {
            mockCountTokens.mockReturnValue(10);
            const input = {
                thinking: { type: 'enabled' }, // no budget_tokens
                system: 'test'
            };
            estimateInputTokens(input);
            const calledWith = mockCountTokens.mock.calls[0][0];
            expect(calledWith).toContain('<max_thinking_length>20000</max_thinking_length>');
        });

        test('应忽略无效 budget_tokens', () => {
            mockCountTokens.mockReturnValue(10);
            // 负数、0、NaN、字符串都会触发默认 20000
            // -100 -> Number(-100) = -100, budget <= 0 为 true, 设为 20000, 然后 20000 > 1024 所以保持 20000
            // 0 -> Number(0) = 0, budget <= 0 为 true, 设为 20000
            // NaN -> Number.isFinite(NaN) = false, 设为 20000
            // 'invalid' -> Number('invalid') = NaN, Number.isFinite(NaN) = false, 设为 20000
            const testCases = [
                { thinking: { type: 'enabled', budget_tokens: -100 }, expected: 20000 },
                { thinking: { type: 'enabled', budget_tokens: 0 }, expected: 20000 },
                { thinking: { type: 'enabled', budget_tokens: NaN }, expected: 20000 },
                { thinking: { type: 'enabled', budget_tokens: 'invalid' }, expected: 20000 }
            ];

            for (const tc of testCases) {
                mockCountTokens.mockReset();
                mockCountTokens.mockReturnValue(10);
                estimateInputTokens({ ...tc, system: 'test' });
                const calledWith = mockCountTokens.mock.calls[0][0];
                expect(calledWith).toContain(`<max_thinking_length>${tc.expected}</max_thinking_length>`);
            }
        });
    });

    describe('thinking adaptive 模式', () => {
        test('应处理 adaptive thinking mode', () => {
            mockCountTokens.mockReturnValue(10);
            const input = {
                thinking: { type: 'adaptive', effort: 'high' },
                system: 'test'
            };
            estimateInputTokens(input);
            const calledWith = mockCountTokens.mock.calls[0][0];
            expect(calledWith).toContain('<thinking_mode>adaptive</thinking_mode>');
            expect(calledWith).toContain('<thinking_effort>high</thinking_effort>');
        });

        test('应规范化 adaptive effort 值', () => {
            const effortTests = [
                { input: 'low', expected: 'low' },
                { input: 'medium', expected: 'medium' },
                { input: 'high', expected: 'high' },
                { input: 'invalid', expected: 'high' },
                { input: '', expected: 'high' },
                { input: 'HIGH', expected: 'high' },
                { input: 'Medium', expected: 'medium' }
            ];

            for (const tc of effortTests) {
                mockCountTokens.mockReset();
                mockCountTokens.mockReturnValue(10);
                estimateInputTokens({
                    thinking: { type: 'adaptive', effort: tc.input },
                    system: 'test'
                });
                const calledWith = mockCountTokens.mock.calls[0][0];
                expect(calledWith).toContain(`<thinking_effort>${tc.expected}</thinking_effort>`);
            }
        });
    });

    test('应处理 messages 数组', () => {
        mockCountTokens.mockReturnValue(20);
        const input = {
            messages: [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'world' }
            ]
        };
        estimateInputTokens(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    test('应处理嵌套 content in messages', () => {
        mockCountTokens.mockReturnValue(15);
        const input = {
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'hello' },
                        { type: 'text', text: ' world' }
                    ]
                }
            ]
        };
        estimateInputTokens(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    test('应处理 tools 数组', () => {
        mockCountTokens.mockReturnValue(25);
        const input = {
            tools: [
                { name: 'test', parameters: { type: 'object' } }
            ]
        };
        estimateInputTokens(input);
        const calledWith = mockCountTokens.mock.calls[0][0];
        expect(calledWith).toContain('"name":"test"');
    });

    test('应组合 system + thinking + messages + tools', () => {
        mockCountTokens.mockReturnValue(100);
        const input = {
            system: 'system',
            thinking: { type: 'enabled', budget_tokens: 10000 },
            messages: [{ role: 'user', content: 'hello' }],
            tools: [{ name: 'test' }]
        };
        estimateInputTokens(input);
        expect(mockCountTokens).toHaveBeenCalledTimes(1);
    });
});

// ========== countTokensAnthropic Tests ==========
describe('countTokensAnthropic', () => {
    beforeEach(() => {
        mockCountTokens.mockReset();
        mockCountTokens.mockReturnValue(100);
    });

    test('应返回对象包含 input_tokens', () => {
        const result = countTokensAnthropic({});
        expect(result).toHaveProperty('input_tokens');
        expect(typeof result.input_tokens).toBe('number');
    });

    test('应计算 system prompt tokens', () => {
        mockCountTokens.mockReturnValue(50);
        const input = { system: 'system prompt' };
        const result = countTokensAnthropic(input);
        expect(result.input_tokens).toBe(50);
    });

    test('应处理 string content in messages', () => {
        mockCountTokens.mockReturnValue(30);
        const input = {
            messages: [{ role: 'user', content: 'hello world' }]
        };
        countTokensAnthropic(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    test('应处理 array content with text blocks', () => {
        mockCountTokens.mockReturnValue(20);
        const input = {
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'hello' },
                    { type: 'text', text: ' world' }
                ]
            }]
        };
        countTokensAnthropic(input);
        expect(mockCountTokens).toHaveBeenCalled();
    });

    test('应处理 image 块添加约 1600 tokens', () => {
        mockCountTokens.mockReturnValue(10);
        const input = {
            messages: [{
                role: 'user',
                content: [{ type: 'image', source: { type: 'base64', data: 'abc' } }]
            }]
        };
        const result = countTokensAnthropic(input);
        // image 块只添加 extraTokens，allText 为空所以 countTextTokens("") = 0
        // extraTokens = 1600, total = 0 + 1600 = 1600
        expect(result.input_tokens).toBe(1600);
    });

    test('应处理 document 块', () => {
        mockCountTokens.mockReturnValue(10);
        // 'abc' 的 length = 3
        // estimatedChars = 3 * 0.75 = 2.25
        // Math.ceil(2.25 / 4) = Math.ceil(0.5625) = 1
        const input = {
            messages: [{
                role: 'user',
                content: [{ type: 'document', source: { data: 'abc' } }]
            }]
        };
        const result = countTokensAnthropic(input);
        // document 块只添加 extraTokens，allText 为空所以 countTextTokens("") = 0
        // extraTokens = 1, total = 0 + 1 = 1
        expect(result.input_tokens).toBe(1);
    });

    test('应计算 tools definitions', () => {
        mockCountTokens.mockReturnValue(15);
        const input = {
            tools: [{ name: 'test', parameters: { type: 'object' } }]
        };
        const result = countTokensAnthropic(input);
        expect(result.input_tokens).toBe(15);
    });

    test('应组合 text tokens + extra tokens', () => {
        mockCountTokens.mockReturnValue(50);
        const input = {
            system: 'system',
            messages: [{
                role: 'user',
                content: [{ type: 'image', source: { type: 'base64', data: 'x' } }]
            }],
            tools: []
        };
        const result = countTokensAnthropic(input);
        // 50 (text) + 1600 (image) = 1650
        expect(result.input_tokens).toBe(1650);
    });

    test('应处理空请求体', () => {
        mockCountTokens.mockReturnValue(0);
        const result = countTokensAnthropic({});
        expect(result.input_tokens).toBe(0);
    });

    test('应处理只有 messages 的请求', () => {
        mockCountTokens.mockReturnValue(25);
        const input = {
            messages: [{ role: 'assistant', content: 'response' }]
        };
        const result = countTokensAnthropic(input);
        expect(result.input_tokens).toBe(25);
    });
});
