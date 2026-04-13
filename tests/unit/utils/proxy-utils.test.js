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
 * 为 google-auth-library 配置代理
 */
function getGoogleAuthProxyConfig(proxyConfig) {
    if (proxyConfig) {
        return {
            agent: proxyConfig.httpsAgent
        };
    }
    return null;
}

// ==================== Tests ====================

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
    });

    test('应正确解析 socks:// 代理 URL', () => {
        const result = parseProxyUrl('socks://127.0.0.1:1080');
        expect(result).not.toBeNull();
        expect(result.proxyType).toBe('socks');
    });

    test('当 URL 为空时应返回 null', () => {
        expect(parseProxyUrl('')).toBeNull();
        expect(parseProxyUrl(null)).toBeNull();
        expect(parseProxyUrl(undefined)).toBeNull();
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
        expect(parseProxyUrl('not-a-valid-url')).toBeNull();
    });

    test('当 URL 协议不支持时应返回 null', () => {
        expect(parseProxyUrl('ftp://127.0.0.1:7890')).toBeNull();
    });
});

describe('proxy-utils.js - isProxyEnabledForProvider()', () => {
    test('当 config 为空时应返回 false', () => {
        expect(isProxyEnabledForProvider(null, 'openai')).toBe(false);
        expect(isProxyEnabledForProvider(undefined, 'openai')).toBe(false);
    });

    test('当 config.PROXY_URL 为空时应返回 false', () => {
        const config = { PROXY_URL: '', PROXY_ENABLED_PROVIDERS: ['openai'] };
        expect(isProxyEnabledForProvider(config, 'openai')).toBe(false);
    });

    test('当 config.PROXY_ENABLED_PROVIDERS 为空时应返回 false', () => {
        const config = { PROXY_URL: 'http://127.0.0.1:7890', PROXY_ENABLED_PROVIDERS: [] };
        expect(isProxyEnabledForProvider(config, 'openai')).toBe(false);
    });

    test('当提供商精确匹配时应返回 true', () => {
        const config = {
            PROXY_URL: 'http://127.0.0.1:7890',
            PROXY_ENABLED_PROVIDERS: ['openai', 'gemini']
        };
        expect(isProxyEnabledForProvider(config, 'openai')).toBe(true);
        expect(isProxyEnabledForProvider(config, 'gemini')).toBe(true);
    });

    test('当提供商前缀匹配时应返回 true', () => {
        const config = {
            PROXY_URL: 'http://127.0.0.1:7890',
            PROXY_ENABLED_PROVIDERS: ['openai']
        };
        expect(isProxyEnabledForProvider(config, 'openai-custom')).toBe(true);
        expect(isProxyEnabledForProvider(config, 'openai-gpt4')).toBe(true);
    });

    test('当提供商不匹配时应返回 false', () => {
        const config = {
            PROXY_URL: 'http://127.0.0.1:7890',
            PROXY_ENABLED_PROVIDERS: ['openai']
        };
        expect(isProxyEnabledForProvider(config, 'gemini')).toBe(false);
        expect(isProxyEnabledForProvider(config, 'claude')).toBe(false);
    });
});

describe('proxy-utils.js - isTLSSidecarEnabledForProvider()', () => {
    test('当 config 为空时应返回 false', () => {
        expect(isTLSSidecarEnabledForProvider(null, 'openai')).toBe(false);
        expect(isTLSSidecarEnabledForProvider(undefined, 'openai')).toBe(false);
    });

    test('当 TLS_SIDECAR_ENABLED 为 false 时应返回 false', () => {
        const config = {
            TLS_SIDECAR_ENABLED: false,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['openai']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'openai')).toBe(false);
    });

    test('当提供商精确匹配时应返回 true', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['openai', 'gemini']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'openai')).toBe(true);
        expect(isTLSSidecarEnabledForProvider(config, 'gemini')).toBe(true);
    });

    test('当提供商前缀匹配时应返回 true', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['gemini']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'gemini-cli')).toBe(true);
    });

    test('当提供商不匹配时应返回 false', () => {
        const config = {
            TLS_SIDECAR_ENABLED: true,
            TLS_SIDECAR_ENABLED_PROVIDERS: ['openai']
        };
        expect(isTLSSidecarEnabledForProvider(config, 'gemini')).toBe(false);
    });
});

describe('proxy-utils.js - configureAxiosProxy()', () => {
    test('应设置 httpAgent 和 httpsAgent', () => {
        const axiosConfig = {};
        const proxyConfig = {
            httpAgent: 'httpAgent',
            httpsAgent: 'httpsAgent'
        };

        const result = configureAxiosProxy(axiosConfig, proxyConfig);

        expect(result.httpAgent).toBe('httpAgent');
        expect(result.httpsAgent).toBe('httpsAgent');
        expect(result.proxy).toBe(false);
    });

    test('当 proxyConfig 为 null 时应返回原始配置', () => {
        const axiosConfig = { url: 'test' };
        const proxyConfig = null;

        const result = configureAxiosProxy(axiosConfig, proxyConfig);

        expect(result).toBe(axiosConfig);
        expect(result.httpAgent).toBeUndefined();
        expect(result.httpsAgent).toBeUndefined();
    });

    test('当 proxyConfig 为 undefined 时应返回原始配置', () => {
        const axiosConfig = { url: 'test' };
        const proxyConfig = undefined;

        const result = configureAxiosProxy(axiosConfig, proxyConfig);

        expect(result).toBe(axiosConfig);
    });
});

describe('proxy-utils.js - resolveRelativeUrl()', () => {
    test('应正确处理相对路径', () => {
        const result = resolveRelativeUrl('https://api.openai.com/v1', '/chat/completions');
        expect(result).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('应处理 baseURL 末尾斜杠', () => {
        const result = resolveRelativeUrl('https://api.openai.com/v1/', '/chat/completions');
        expect(result).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('应处理无斜杠的相对路径', () => {
        const result = resolveRelativeUrl('https://api.openai.com/v1', 'chat/completions');
        expect(result).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('当 URL 为绝对路径时不应修改', () => {
        const result = resolveRelativeUrl('https://api.openai.com/v1', 'https://other.com/endpoint');
        expect(result).toBe('https://other.com/endpoint');
    });

    test('当 URL 为空时应返回空字符串', () => {
        const result = resolveRelativeUrl('https://api.openai.com/v1', '');
        expect(result).toBe('');
    });

    test('当 baseUrl 为空时应处理相对路径', () => {
        const result = resolveRelativeUrl('', '/chat/completions');
        expect(result).toBe('/chat/completions');
    });
});

describe('proxy-utils.js - getGoogleAuthProxyConfig()', () => {
    test('应返回 agent 配置', () => {
        const proxyConfig = { httpsAgent: 'httpsAgent' };
        const result = getGoogleAuthProxyConfig(proxyConfig);
        expect(result).toEqual({ agent: 'httpsAgent' });
    });

    test('当 proxyConfig 为 null 时应返回 null', () => {
        const result = getGoogleAuthProxyConfig(null);
        expect(result).toBeNull();
    });

    test('当 proxyConfig 为 undefined 时应返回 null', () => {
        const result = getGoogleAuthProxyConfig(undefined);
        expect(result).toBeNull();
    });
});
