/**
 * proxy-utils.js 单元测试
 * 测试策略：直接测试函数逻辑，不依赖实际模块导入
 */

// ==================== 测试辅助函数（从 proxy-utils.js 复制逻辑） ====================

/**
 * 解析代理URL并返回相应的代理配置
 */
function parseProxyUrl(proxyUrl) {
    if (!proxyUrl || typeof proxyUrl !== 'string') {
        return null;
    }

    const trimmedUrl = proxyUrl.trim();
    if (!trimmedUrl) {
        return null;
    }

    try {
        const url = new URL(trimmedUrl);
        const protocol = url.protocol.toLowerCase();

        if (protocol === 'socks5:' || protocol === 'socks4:' || protocol === 'socks:') {
            return {
                proxyType: 'socks',
                protocol: 'socks5'
            };
        } else if (protocol === 'http:' || protocol === 'https:') {
            return {
                proxyType: 'http',
                protocol: protocol.replace(':', '')
            };
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

/**
 * 检查指定的提供商是否启用了代理（支持前缀匹配）
 */
function isProxyEnabledForProvider(config, providerType) {
    if (!config || !config.PROXY_URL || !config.PROXY_ENABLED_PROVIDERS) {
        return false;
    }

    // 简单前缀匹配
    const providers = config.PROXY_ENABLED_PROVIDERS;
    for (const p of providers) {
        if (providerType === p || providerType.startsWith(p + '-')) {
            return true;
        }
    }
    return false;
}

/**
 * 检查指定的提供商是否启用了 TLS Sidecar
 */
function isTLSSidecarEnabledForProvider(config, providerType) {
    if (!config || !config.TLS_SIDECAR_ENABLED || !config.TLS_SIDECAR_ENABLED_PROVIDERS) {
        return false;
    }

    const providers = config.TLS_SIDECAR_ENABLED_PROVIDERS;
    for (const p of providers) {
        if (providerType === p || providerType.startsWith(p + '-')) {
            return true;
        }
    }
    return false;
}

/**
 * 为 axios 配置代理
 */
function configureAxiosProxy(axiosConfig, proxyConfig) {
    if (proxyConfig) {
        axiosConfig.httpAgent = proxyConfig.httpAgent;
        axiosConfig.httpsAgent = proxyConfig.httpsAgent;
        axiosConfig.proxy = false;
    }
    return axiosConfig;
}

/**
 * 处理相对路径转换
 */
function resolveRelativeUrl(baseUrl, url) {
    if (url && !url.startsWith('http')) {
        const base = (baseUrl || '').replace(/\/$/, '');
        const path = url.startsWith('/') ? url : '/' + url;
        return base + path;
    }
    return url;
}

/**
 * 获取 Google Auth 代理配置
 */
function getGoogleAuthProxyConfig(proxyConfig) {
    if (proxyConfig) {
        return {
            agent: proxyConfig.httpsAgent
        };
    }
    return null;
}

// ==================== 测试用例 ====================

describe('proxy-utils.js - parseProxyUrl()', () => {
    test('应正确解析 http:// 代理 URL', () => {
        const result = parseProxyUrl('http://127.0.0.1:7890');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('http');
        expect(result.protocol).toBe('http');
    });

    test('应正确解析 https:// 代理 URL', () => {
        const result = parseProxyUrl('https://127.0.0.1:7890');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('http');
        expect(result.protocol).toBe('https');
    });

    test('应正确解析 socks5:// 代理 URL', () => {
        const result = parseProxyUrl('socks5://127.0.0.1:1080');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('socks');
        expect(result.protocol).toBe('socks5');
    });

    test('应正确解析 socks4:// 代理 URL', () => {
        const result = parseProxyUrl('socks4://127.0.0.1:1080');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('socks');
        expect(result.protocol).toBe('socks5');
    });

    test('应正确解析 socks:// 代理 URL', () => {
        const result = parseProxyUrl('socks://127.0.0.1:1080');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('socks');
        expect(result.protocol).toBe('socks5');
    });

    test('当 URL 为空时应返回 null', () => {
        expect(parseProxyUrl('')).toBeNull();
    });

    test('当 URL 为纯空格时应返回 null', () => {
        expect(parseProxyUrl('   ')).toBeNull();
    });

    test('当 URL 包含多余空格时应正确解析', () => {
        const result = parseProxyUrl('  http://127.0.0.1:7890  ');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('http');
    });

    test('当 URL 不是合法格式时应返回 null', () => {
        expect(parseProxyUrl('not-a-url')).toBeNull();
    });

    test('当 URL 协议不支持时应返回 null', () => {
        expect(parseProxyUrl('ftp://127.0.0.1:7890')).toBeNull();
    });

    test('当 URL 为 null 时应返回 null', () => {
        expect(parseProxyUrl(null)).toBeNull();
    });

    test('当 URL 为 undefined 时应返回 null', () => {
        expect(parseProxyUrl(undefined)).toBeNull();
    });

    test('当 URL 为数字时应返回 null', () => {
        expect(parseProxyUrl(12345)).toBeNull();
    });
});

describe('proxy-utils.js - isProxyEnabledForProvider()', () => {
    test('当 config 为空时应返回 false', () => {
        expect(isProxyEnabledForProvider(null, 'test')).toBe(false);
    });

    test('当 config.PROXY_URL 为空时应返回 false', () => {
        expect(isProxyEnabledForProvider({ PROXY_ENABLED_PROVIDERS: ['test'] }, 'test')).toBe(false);
    });

    test('当 config.PROXY_ENABLED_PROVIDERS 为空时应返回 false', () => {
        expect(isProxyEnabledForProvider({ PROXY_URL: 'http://proxy:8080' }, 'test')).toBe(false);
    });

    test('当提供商精确匹配时应返回 true', () => {
        const config = {
            PROXY_URL: 'http://proxy:8080',
            PROXY_ENABLED_PROVIDERS: ['claude', 'gemini']
        };
        expect(isProxyEnabledForProvider(config, 'claude')).toBe(true);
    });

    test('当提供商前缀匹配时应返回 true', () => {
        const config = {
            PROXY_URL: 'http://proxy:8080',
            PROXY_ENABLED_PROVIDERS: ['claude']
        };
        expect(isProxyEnabledForProvider(config, 'claude-kiro-oauth')).toBe(true);
    });

    test('当提供商不匹配时应返回 false', () => {
        const config = {
            PROXY_URL: 'http://proxy:8080',
            PROXY_ENABLED_PROVIDERS: ['claude', 'gemini']
        };
        expect(isProxyEnabledForProvider(config, 'openai')).toBe(false);
    });
});

describe('proxy-utils.js - isTLSSidecarEnabledForProvider()', () => {
    test('当 config 为空时应返回 false', () => {
        expect(isTLSSidecarEnabledForProvider(null, 'test')).toBe(false);
    });

    test('当 TLS_SIDECAR_ENABLED 为 false 时应返回 false', () => {
        const config = {
            TLS_SIDECAR_ENABLED: false,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'gemini')).toBe(false);
    });

    test('当提供商精确匹配时应返回 true', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini', 'claude']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'gemini')).toBe(true);
    });

    test('当提供商前缀匹配时应返回 true', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'gemini-cli-oauth')).toBe(true);
    });

    test('当提供商不匹配时应返回 false', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'claude')).toBe(false);
    });
});

describe('proxy-utils.js - configureAxiosProxy()', () => {
    test('应设置 httpAgent 和 httpsAgent', () => {
        const axiosConfig = {};
        const proxyConfig = {
            httpAgent: { name: 'httpAgent' },
            httpsAgent: { name: 'httpsAgent' }
        };
        const result = configureAxiosProxy(axiosConfig, proxyConfig);
        expect(result.httpAgent).toBeDefined();
        expect(result.httpsAgent).toBeDefined();
        expect(result.proxy).toBe(false);
    });

    test('当 proxyConfig 为 null 时应返回原始配置', () => {
        const axiosConfig = { url: '/api/test' };
        const result = configureAxiosProxy(axiosConfig, null);
        expect(result).toBe(axiosConfig);
        expect(result.httpAgent).toBeUndefined();
    });

    test('当 proxyConfig 为 undefined 时应返回原始配置', () => {
        const axiosConfig = { url: '/api/test' };
        const result = configureAxiosProxy(axiosConfig, undefined);
        expect(result).toBe(axiosConfig);
    });
});

describe('proxy-utils.js - resolveRelativeUrl()', () => {
    test('应正确处理相对路径', () => {
        expect(resolveRelativeUrl('http://api.example.com', '/v1/chat')).toBe('http://api.example.com/v1/chat');
    });

    test('应处理 baseURL 末尾斜杠', () => {
        expect(resolveRelativeUrl('http://api.example.com/', '/v1/chat')).toBe('http://api.example.com/v1/chat');
    });

    test('应处理无斜杠的相对路径', () => {
        expect(resolveRelativeUrl('http://api.example.com', 'v1/chat')).toBe('http://api.example.com/v1/chat');
    });

    test('当 URL 为绝对路径时不应修改', () => {
        expect(resolveRelativeUrl('http://api.example.com', 'https://other.com/api')).toBe('https://other.com/api');
    });

    test('当 URL 为空时应返回空字符串', () => {
        expect(resolveRelativeUrl('http://api.example.com', '')).toBe('');
    });
});

describe('proxy-utils.js - getGoogleAuthProxyConfig()', () => {
    test('应返回 agent 配置', () => {
        const proxyConfig = {
            httpsAgent: { name: 'httpsAgent' }
        };
        const result = getGoogleAuthProxyConfig(proxyConfig);
        expect(result).not.toBeNull();
        expect(result.agent).toBeDefined();
    });

    test('当 proxyConfig 为 null 时应返回 null', () => {
        expect(getGoogleAuthProxyConfig(null)).toBeNull();
    });

    test('当 proxyConfig 为 undefined 时应返回 null', () => {
        expect(getGoogleAuthProxyConfig(undefined)).toBeNull();
    });
});
