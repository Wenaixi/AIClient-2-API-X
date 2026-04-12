/**
 * iFlow OAuth 处理器
 */

import logger from '../utils/logger.js';

export async function handleIFlowOAuth(config, options = {}) {
    // iFlow 使用简单的 API Key 认证，不需要 OAuth 流程
    // 返回一个占位符授权 URL
    const authUrl = '/admin#iflow-config';
    const authInfo = {
        type: 'apikey',
        message: '请在配置文件中设置 IFLOW_API_KEY'
    };
    
    return { authUrl, authInfo };
}
