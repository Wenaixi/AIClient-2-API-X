/**
 * 默认认证插件 - 内置插件
 *
 * 提供基于 API Key 的默认认证机制
 * 支持多种认证方式：
 * 1. Authorization: Bearer <key>
 * 2. x-api-key: <key>
 * 3. x-goog-api-key: <key>
 * 4. URL query: ?key=<key>
 */

import logger from '../../utils/logger.js';
import * as crypto from 'crypto';

/**
 * 检查请求是否已授权
 * @param {http.IncomingMessage} req - HTTP 请求
 * @param {URL} requestUrl - 解析后的 URL
 * @param {string} requiredApiKey - 所需的 API Key
 * @returns {boolean}
 */
function isAuthorized(req, requestUrl, requiredApiKey) {
    const authHeader = req.headers['authorization'];
    const queryKey = requestUrl.searchParams.get('key');
    const googApiKey = req.headers['x-goog-api-key'];
    const claudeApiKey = req.headers['x-api-key'];

    // Check for Bearer token in Authorization header (OpenAI style)
    // 注意：timingSafeEqual 在长度不匹配时会抛出异常，因此需要先检查长度
    // 但这不会造成时序攻击，因为长度检查在常数时间内
    if (requiredApiKey && authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            if (token && token.length === requiredApiKey.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(requiredApiKey))) {
                return true;
            }
        } catch (e) {
            // timingSafeEqual 在长度不匹配时抛出，这是正常的，直接继续检查下一个
        }
    }

    // Check for API key in URL query parameter (Gemini style)
    try {
        if (requiredApiKey && queryKey && queryKey.length === requiredApiKey.length && crypto.timingSafeEqual(Buffer.from(queryKey), Buffer.from(requiredApiKey))) {
            return true;
        }
    } catch (e) {
        // 长度不匹配
    }

    // Check for API key in x-goog-api-key header (Gemini style)
    try {
        if (requiredApiKey && googApiKey && googApiKey.length === requiredApiKey.length && crypto.timingSafeEqual(Buffer.from(googApiKey), Buffer.from(requiredApiKey))) {
            return true;
        }
    } catch (e) {
        // 长度不匹配
    }

    // Check for API key in x-api-key header (Claude style)
    try {
        if (requiredApiKey && claudeApiKey && claudeApiKey.length === requiredApiKey.length && crypto.timingSafeEqual(Buffer.from(claudeApiKey), Buffer.from(requiredApiKey))) {
            return true;
        }
    } catch (e) {
        // 长度不匹配
    }

    return false;
}

/**
 * 默认认证插件定义
 */
const defaultAuthPlugin = {
    name: 'default-auth',
    version: '1.0.0',
    description: '默认 API Key 认证插件',
    
    // 插件类型：认证插件
    type: 'auth',
    
    // 标记为内置插件，优先级最低（最后执行）
    _builtin: true,
    _priority: 9999,

    /**
     * 认证方法 - 默认 API Key 认证
     * @param {http.IncomingMessage} req - HTTP 请求
     * @param {http.ServerResponse} res - HTTP 响应
     * @param {URL} requestUrl - 解析后的 URL
     * @param {Object} config - 服务器配置
     * @returns {Promise<{handled: boolean, authorized: boolean|null}>}
     */
    async authenticate(req, res, requestUrl, config) {
        // 执行默认认证
        if (isAuthorized(req, requestUrl, config.REQUIRED_API_KEY)) {
            // 认证成功
            return { handled: false, authorized: true };
        }

        // 认证失败，记录日志但不发送响应（由 request-handler 统一处理）
        // 注意：不要记录实际的 key 值，防止敏感信息泄露
        const maskKey = (key) => key ? `${key.slice(0, 3)}***${key.slice(-3)}` : 'N/A';
        logger.info(`[Default Auth] Unauthorized request. Headers: Authorization=${req.headers['authorization'] ? 'present' : 'N/A'}, x-api-key=${maskKey(req.headers['x-api-key'])}, x-goog-api-key=${maskKey(req.headers['x-goog-api-key'])}`);
        
        // 返回 null 表示此插件不授权，让其他插件或默认逻辑处理
        return { handled: false, authorized: null };
    }
};

export default defaultAuthPlugin;


