/**
 * UI Module 单元测试
 * 测试 provider-api.js 中的数据处理函数
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ==================== 被测试的函数（复制以隔离测试） ====================

/**
 * 安全净化函数 - 从 provider-api.js 复制
 * 移除用户输入字段中的危险内容
 */
function sanitizeProviderData(provider) {
    if (!provider || typeof provider !== 'object') return provider;
    const sanitized = { ...provider };
    if (typeof sanitized.customName === 'string') {
        let name = sanitized.customName;

        // 拒绝包含危险协议
        if (/(?:data|javascript|vbscript)\s*:/i.test(name)) {
            sanitized.customName = '';
            return sanitized;
        }

        // 移除所有 HTML 标签
        name = name.replace(/<[^>]*>/g, '');

        // 移除 HTML 事件处理器属性
        name = name.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

        // 移除潜在的 HTML 实体编码攻击
        name = name.replace(/&[#\w]+;/g, '');

        sanitized.customName = name.trim();
    }
    return sanitized;
}

function sanitizeProviderPools(pools) {
    if (!pools || typeof pools !== 'object') return pools;
    const sanitized = {};
    for (const [type, providers] of Object.entries(pools)) {
        sanitized[type] = Array.isArray(providers)
            ? providers.map(sanitizeProviderData)
            : providers;
    }
    return sanitized;
}

/**
 * HTML 转义函数
 */
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== 测试用例 ====================

describe('Provider Data Sanitization', () => {
    describe('sanitizeProviderData - XSS 防护', () => {
        test('should remove script tags', () => {
            const input = { customName: '<script>alert("XSS")</script>TestProvider' };
            const result = sanitizeProviderData(input);
            expect(result.customName).not.toContain('<script>');
            expect(result.customName).not.toContain('</script>');
            expect(result.customName).toContain('TestProvider');
        });

        test('should reject javascript: protocol', () => {
            const input = { customName: 'javascript:alert("XSS")' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('');
        });

        test('should reject data: protocol', () => {
            const input = { customName: 'data:text/html,<script>alert(1)</script>' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('');
        });

        test('should reject vbscript: protocol', () => {
            const input = { customName: 'vbscript:msgbox("XSS")' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('');
        });

        test('should remove img tag with onerror', () => {
            const input = { customName: '<img src=x onerror=alert(1)>' };
            const result = sanitizeProviderData(input);
            expect(result.customName).not.toContain('<img');
            expect(result.customName).not.toContain('onerror');
        });

        test('should remove div tag with onclick', () => {
            const input = { customName: '<div onclick="evil()">Click</div>' };
            const result = sanitizeProviderData(input);
            expect(result.customName).not.toContain('<div');
            expect(result.customName).not.toContain('onclick');
        });

        test('should remove all HTML tags', () => {
            const input = { customName: '<div><img src=x><span>Test</span></div>' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('Test');
        });

        test('should remove event handlers', () => {
            const input = { customName: 'Test onclick="alert(1)" Provider' };
            const result = sanitizeProviderData(input);
            expect(result.customName).not.toContain('onclick');
            expect(result.customName).toContain('Test');
            expect(result.customName).toContain('Provider');
        });

        test('should remove HTML entity encoding attacks', () => {
            const input = { customName: '&lt;script&gt;alert(1)&lt;/script&gt;' };
            const result = sanitizeProviderData(input);
            expect(result.customName).not.toContain('&lt;');
            expect(result.customName).not.toContain('&gt;');
        });

        test('should preserve normal text', () => {
            const input = { customName: 'Normal Provider Name 123' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('Normal Provider Name 123');
        });

        test('should handle empty string', () => {
            const input = { customName: '' };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('');
        });

        test('should handle null/undefined', () => {
            expect(sanitizeProviderData(null)).toBeNull();
            expect(sanitizeProviderData(undefined)).toBeUndefined();
        });

        test('should handle object without customName', () => {
            const input = { uuid: 'test-uuid', otherField: 'value' };
            const result = sanitizeProviderData(input);
            expect(result.uuid).toBe('test-uuid');
            expect(result.otherField).toBe('value');
        });

        test('should handle complex XSS vectors', () => {
            const vectors = [
                '<svg onload=alert(1)>',
                '<body onload=alert(1)>',
                '<iframe src="javascript:alert(1)">',
                '<embed src="javascript:alert(1)">',
                '<object data="javascript:alert(1)">',
                '<a href="javascript:alert(1)">click</a>',
            ];

            vectors.forEach(vector => {
                const input = { customName: vector };
                const result = sanitizeProviderData(input);
                expect(result.customName).toBe('');
            });
        });
    });

    describe('sanitizeProviderData - 非 customName 字段', () => {
        test('should preserve other fields', () => {
            const input = {
                customName: 'Test Provider',
                uuid: 'test-uuid-123',
                credPath: 'configs/test.json',
                isHealthy: true,
            };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe('Test Provider');
            expect(result.uuid).toBe('test-uuid-123');
            expect(result.credPath).toBe('configs/test.json');
            expect(result.isHealthy).toBe(true);
        });

        test('should not modify non-string customName', () => {
            const input = { customName: 123 };
            const result = sanitizeProviderData(input);
            expect(result.customName).toBe(123);
        });
    });
});

describe('Provider Pools Sanitization', () => {
    test('should sanitize all providers in pool', () => {
        const pools = {
            'gemini': [
                { customName: '<script>alert(1)</script>Provider1' },
                { customName: 'Normal Provider' },
            ],
            'openai': [
                { customName: 'javascript:alert(1)' },
            ]
        };
        const result = sanitizeProviderPools(pools);

        expect(result.gemini[0].customName).not.toContain('<script>');
        expect(result.gemini[1].customName).toBe('Normal Provider');
        expect(result.openai[0].customName).toBe('');
    });

    test('should handle empty pools', () => {
        expect(sanitizeProviderPools({})).toEqual({});
        expect(sanitizeProviderPools(null)).toBeNull();
        expect(sanitizeProviderPools(undefined)).toBeUndefined();
    });

    test('should preserve non-array provider types', () => {
        const pools = {
            'gemini': 'not-an-array',
            'openai': [{ customName: 'Test' }]
        };
        const result = sanitizeProviderPools(pools);
        expect(result.gemini).toBe('not-an-array');
        expect(result.openai[0].customName).toBe('Test');
    });
});

describe('HTML Escape Function', () => {
    test('should escape ampersand', () => {
        expect(escHtml('A & B')).toBe('A &amp; B');
    });

    test('should escape less than', () => {
        expect(escHtml('a < b')).toBe('a &lt; b');
    });

    test('should escape greater than', () => {
        expect(escHtml('a > b')).toBe('a &gt; b');
    });

    test('should escape double quotes', () => {
        expect(escHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('should escape single quotes', () => {
        expect(escHtml("say 'hello'")).toBe('say &#39;hello&#39;');
    });

    test('should escape all special chars', () => {
        expect(escHtml('<script>&"\'">')).toBe('&lt;script&gt;&amp;&quot;&#39;&quot;&gt;');
    });

    test('should handle empty string', () => {
        expect(escHtml('')).toBe('');
    });

    test('should handle numbers', () => {
        expect(escHtml(123)).toBe('123');
        expect(escHtml(0)).toBe('0');
    });

    test('should handle null/undefined', () => {
        expect(escHtml(null)).toBe('null');
        expect(escHtml(undefined)).toBe('undefined');
    });
});

describe('Security Edge Cases', () => {
    test('should handle unicode characters', () => {
        const input = { customName: '中文提供商 🎉 emoji' };
        const result = sanitizeProviderData(input);
        expect(result.customName).toBe('中文提供商 🎉 emoji');
    });

    test('should handle very long strings', () => {
        const longName = 'a'.repeat(10000);
        const input = { customName: longName };
        const result = sanitizeProviderData(input);
        expect(result.customName).toBe(longName);
    });

    test('should handle whitespace only', () => {
        const input = { customName: '   \t\n   ' };
        const result = sanitizeProviderData(input);
        expect(result.customName).toBe('');
    });

    test('should handle mixed case protocols', () => {
        const input = { customName: 'JAVASCRIPT:alert(1)' };
        const result = sanitizeProviderData(input);
        expect(result.customName).toBe('');
    });

    test('should handle protocols with spaces - not matching exact protocol', () => {
        // "java script:" 带空格，不是 "javascript:"，所以不匹配危险协议
        // 但会被后续的 HTML 标签移除清理
        const input = { customName: 'java script:alert(1)' };
        const result = sanitizeProviderData(input);
        // 只有精确匹配 javascript:/data:/vbscript: 才会被拒绝
        // 带空格的 "java script:" 不会被协议检测捕获，但内容会被处理
        expect(result.customName).toBe('java script:alert(1)');
    });

    test('should strip all HTML tags including simple ones', () => {
        const input = { customName: '<b>Bold</b> and <i>Italic</i>' };
        const result = sanitizeProviderData(input);
        // 函数移除所有 HTML 标签
        expect(result.customName).toBe('Bold and Italic');
    });
});

describe('Integration: Sanitization + Escape', () => {
    test('should sanitize then escape for safe storage and display', () => {
        // 使用不包含内容的纯标签
        const userInput = '<b>My Provider</b>';
        const provider = { customName: userInput };

        // 存储前净化
        const sanitized = sanitizeProviderData(provider);
        expect(sanitized.customName).toBe('My Provider');

        // 显示前转义
        const escaped = escHtml(sanitized.customName);
        expect(escaped).toBe('My Provider');
    });

    test('should sanitize and escape img with onerror', () => {
        const maliciousInput = '<img src=x onerror=alert(1)>Safe Name';
        const provider = { customName: maliciousInput };

        const sanitized = sanitizeProviderData(provider);
        expect(sanitized.customName).toBe('Safe Name');

        const escaped = escHtml(sanitized.customName);
        expect(escaped).toBe('Safe Name');
    });

    test('should handle malicious input - javascript protocol blocks entire input', () => {
        const maliciousInput = 'javascript:alert(1)';
        const provider = { customName: maliciousInput };

        // javascript: 协议会直接清空
        const sanitized = sanitizeProviderData(provider);
        expect(sanitized.customName).toBe('');
    });

    test('should safely handle pure HTML tags without scripts', () => {
        const input = '<b>Bold</b> <i>Italic</i> <u>Underline</u>';
        const provider = { customName: input };

        const sanitized = sanitizeProviderData(provider);
        expect(sanitized.customName).toBe('Bold Italic Underline');
    });
});
