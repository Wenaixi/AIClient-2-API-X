/**
 * Kimi OAuth 处理器
 * 处理 Kimi OAuth 设备流认证和 token 管理
 */

import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { startKimiDeviceFlow, refreshKimiToken, KimiTokenStorage, KimiOAuthClient } from './kimi-oauth.js';

// 获取项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * 完成 Kimi OAuth 授权（轮询等待用户授权并保存凭证）
 * 注意：此方法会阻塞直到授权完成或超时，不适合直接通过 HTTP 请求调用
 * @param {Object} config - 全局配置
 * @param {Object} authInfo - 授权信息（包含 deviceCode 等）
 * @returns {Promise<Object>} 认证结果（包含保存的文件路径）
 */
export async function completeKimiOAuth(config = {}, authInfo = {}) {
    try {
        const { deviceCode } = authInfo;
        if (!deviceCode) {
            throw new Error('Missing deviceCode parameter');
        }

        logger.info('[Kimi OAuth] Completing authorization for device code...');

        // 创建客户端
        const client = new KimiOAuthClient(config);

        // 轮询等待用户授权
        logger.info('[Kimi OAuth] Polling for authorization...');
        const tokenData = await client.pollForToken(
            {
                device_code: deviceCode,
                interval: authInfo.interval || 5,
                expires_in: authInfo.expiresIn || 0
            }
        );

        logger.info('[Kimi OAuth] Authorization successful!');

        // 创建 Token 存储
        const tokenStorage = new KimiTokenStorage({
            ...tokenData,
            last_refresh: new Date().toISOString()
        });

        // 保存到文件（使用项目根目录确保 Docker 容器内路径正确）
        const outputDir = path.join(projectRoot, 'configs', 'kimi');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = `kimi-${Date.now()}.json`;
        const filepath = path.join(outputDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(tokenStorage.toJSON(), null, 2), 'utf-8');

        logger.info(`[Kimi OAuth] Token saved to: ${filepath}`);

        return {
            success: true,
            filepath: filename,
            fullPath: filepath,
            tokenInfo: {
                type: tokenStorage.type,
                device_id: tokenStorage.device_id,
                expired: tokenStorage.expired,
                scope: tokenStorage.scope
            }
        };
    } catch (error) {
        logger.error('[Kimi OAuth] Authorization completion failed:', error.message);
        throw error;
    }
}

/**
 * 检查 Kimi 设备码授权状态（非阻塞，单次检查）
 * 用于前端轮询场景，每次只检查一次授权状态
 * @param {Object} config - 全局配置
 * @param {string} deviceCode - 设备码
 * @returns {Promise<Object>} 授权状态：{ authorized: boolean, tokenInfo?: Object, error?: string }
 */
export async function checkKimiAuthStatus(config = {}, deviceCode) {
    console.log('[Kimi OAuth DEBUG] checkKimiAuthStatus() called');
    console.log('[Kimi OAuth DEBUG] deviceCode:', deviceCode);
    console.log('[Kimi OAuth DEBUG] config keys:', Object.keys(config || {}));

    try {
        const client = new KimiOAuthClient(config);
        console.log('[Kimi OAuth DEBUG] KimiOAuthClient created, deviceId:', client.getDeviceId());

        console.log('[Kimi OAuth DEBUG] Calling exchangeDeviceCode...');
        const { token, error, shouldContinue } = await client.exchangeDeviceCode(deviceCode);
        console.log('[Kimi OAuth DEBUG] exchangeDeviceCode result:', { hasToken: !!token, error: error?.message, shouldContinue });

        if (shouldContinue) {
            // 还在等待授权（authorization_pending 或 slow_down）
            console.log('[Kimi OAuth DEBUG] Authorization still pending...');
            return { authorized: false, waiting: true };
        }

        if (error) {
            // 终端错误（expired_token, access_denied 等）
            console.error(`[Kimi OAuth DEBUG] Terminal error:`, error.message);
            return { authorized: false, error: error.message };
        }

        // 授权成功，保存 token
        console.log(`[Kimi OAuth DEBUG] Authorization successful, saving token...`);

        const tokenStorage = new KimiTokenStorage({
            ...token,
            last_refresh: new Date().toISOString()
        });

        console.log('[Kimi OAuth DEBUG] TokenStorage created:', JSON.stringify(tokenStorage.toJSON(), null, 2));

        const outputDir = path.join(projectRoot, 'configs', 'kimi');
        console.log('[Kimi OAuth DEBUG] Output directory:', outputDir);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log('[Kimi OAuth DEBUG] Created output directory');
        }

        const filename = `kimi-${Date.now()}.json`;
        const filepath = path.join(outputDir, filename);
        console.log('[Kimi OAuth DEBUG] Writing token to:', filepath);
        fs.writeFileSync(filepath, JSON.stringify(tokenStorage.toJSON(), null, 2), 'utf-8');
        console.log('[Kimi OAuth DEBUG] Token saved successfully');

        // 广播授权成功事件
        const relativePath = path.relative(projectRoot, filepath);
        console.log('[Kimi OAuth DEBUG] Relative path:', relativePath);

        try {
            const { broadcastEvent } = await import('../services/ui-manager.js');
            const { autoLinkProviderConfigs } = await import('../services/service-manager.js');
            const { CONFIG } = await import('../core/config-manager.js');

            console.log('[Kimi OAuth DEBUG] Calling autoLinkProviderConfigs...');
            await autoLinkProviderConfigs(CONFIG, {
                onlyCurrentCred: true,
                credPath: relativePath
            });
            console.log('[Kimi OAuth DEBUG] autoLinkProviderConfigs completed');

            console.log('[Kimi OAuth DEBUG] Broadcasting oauth_success event...');
            broadcastEvent('oauth_success', {
                provider: 'kimi-oauth',
                credPath: filepath,
                relativePath: relativePath,
                timestamp: new Date().toISOString()
            });
            console.log('[Kimi OAuth DEBUG] oauth_success event broadcasted');
        } catch (err) {
            console.error('[Kimi OAuth DEBUG] Failed to broadcast success event:', err.message);
            logger.warn('[Kimi OAuth] Failed to broadcast success event:', err.message);
        }

        return {
            authorized: true,
            filepath: filename,
            fullPath: filepath,
            relativePath: relativePath,
            tokenInfo: {
                type: tokenStorage.type,
                device_id: tokenStorage.device_id,
                expired: tokenStorage.expired,
                scope: tokenStorage.scope
            }
        };
    } catch (error) {
        console.error('[Kimi OAuth DEBUG] checkKimiAuthStatus() exception:', error.message);
        console.error('[Kimi OAuth DEBUG] Error stack:', error.stack);

        // 区分网络错误和其他错误
        const isNetworkError = error.message?.includes('network') ||
                               error.message?.includes('timeout') ||
                               error.message?.includes('ECONNREFUSED') ||
                               error.message?.includes('ENOTFOUND') ||
                               error.message?.includes('ECONNRESET');

        if (isNetworkError) {
            console.warn(`[Kimi OAuth DEBUG] Network error detected, continuing to wait...`);
            // 网络错误，继续等待
            return { authorized: false, waiting: true };
        }

        // 其他错误（如文件系统错误等）应该报告给前端
        console.error(`[Kimi OAuth DEBUG] Non-network error, reporting to frontend:`, error.message);
        return { authorized: false, error: `Server error: ${error.message}` };
    }
}

/**
 * 处理 Kimi OAuth 认证流程
 * @param {Object} config - 全局配置
 * @param {Object} options - 认证选项
 * @returns {Promise<Object>} 认证结果
 */
export async function handleKimiOAuth(config = {}, options = {}) {
    console.log('[Kimi OAuth DEBUG] handleKimiOAuth() called');
    console.log('[Kimi OAuth DEBUG] config keys:', Object.keys(config || {}));
    console.log('[Kimi OAuth DEBUG] options:', JSON.stringify(options));

    try {
        logger.info('[Kimi OAuth] Starting Kimi authentication...');
        console.log('[Kimi OAuth DEBUG] Creating KimiOAuthClient...');

        // 启动设备流认证
        const client = new KimiOAuthClient(config);
        console.log('[Kimi OAuth DEBUG] KimiOAuthClient created');

        // 请求设备码
        console.log('[Kimi OAuth DEBUG] Requesting device code...');
        const deviceCodeResponse = await client.requestDeviceCode();
        console.log('[Kimi OAuth DEBUG] Device code response:', JSON.stringify(deviceCodeResponse));

        logger.info('[Kimi OAuth] Device code received');
        logger.info('[Kimi OAuth] Verification URL:', deviceCodeResponse.verification_uri_complete || deviceCodeResponse.verification_uri);
        logger.info('[Kimi OAuth] User code:', deviceCodeResponse.user_code);
        logger.info('[Kimi OAuth] Device code expires in:', deviceCodeResponse.expires_in, 'seconds');
        logger.info('[Kimi OAuth] Poll interval:', deviceCodeResponse.interval || 5, 'seconds');

        // 计算过期时间（秒）
        const expiresIn = deviceCodeResponse.expires_in || 300;
        console.log('[Kimi OAuth DEBUG] expiresIn set to:', expiresIn);

        // 返回授权信息，让前端处理用户授权
        const result = {
            authUrl: deviceCodeResponse.verification_uri_complete || deviceCodeResponse.verification_uri,
            authInfo: {
                provider: 'kimi-oauth',
                userCode: deviceCodeResponse.user_code,
                deviceCode: deviceCodeResponse.device_code,
                verificationUri: deviceCodeResponse.verification_uri,
                verificationUriComplete: deviceCodeResponse.verification_uri_complete,
                expiresIn: expiresIn,
                interval: deviceCodeResponse.interval || 5
            }
        };
        console.log('[Kimi OAuth DEBUG] Returning result:', JSON.stringify(result));
        return result;
    } catch (error) {
        console.error('[Kimi OAuth DEBUG] handleKimiOAuth() error:', error.message);
        console.error('[Kimi OAuth DEBUG] Error stack:', error.stack);
        logger.error('[Kimi OAuth] Authentication failed:', error.message);
        logger.error('[Kimi OAuth] Error stack:', error.stack);
        throw error;
    }
}

/**
 * 批量导入 Kimi refresh tokens
 * @param {Array<string>} refreshTokens - Refresh token 列表
 * @param {string} outputDir - 输出目录
 * @param {Object} config - 全局配置
 * @returns {Promise<Object>} 导入结果
 */
export async function batchImportKimiRefreshTokens(refreshTokens, outputDir, config = {}) {
    if (!Array.isArray(refreshTokens) || refreshTokens.length === 0) {
        throw new Error('No refresh tokens provided');
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = {
        total: refreshTokens.length,
        success: 0,
        failed: 0,
        errors: []
    };

    logger.info(`[Kimi OAuth] Importing ${refreshTokens.length} refresh tokens...`);

    for (let i = 0; i < refreshTokens.length; i++) {
        const refreshToken = refreshTokens[i].trim();
        if (!refreshToken) continue;

        try {
            logger.info(`[Kimi OAuth] Processing token ${i + 1}/${refreshTokens.length}...`);

            // 创建临时 token storage
            const tempStorage = new KimiTokenStorage({
                access_token: '',
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_at: 0
            });

            // 刷新获取完整 token
            const newTokenStorage = await refreshKimiToken(tempStorage, config);

            // 保存到文件
            const filename = `kimi-token-${Date.now()}-${i}.json`;
            const filepath = path.join(outputDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(newTokenStorage.toJSON(), null, 2), 'utf-8');

            logger.info(`[Kimi OAuth] Token ${i + 1} saved to: ${filepath}`);
            results.success++;

            // 添加延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            logger.error(`[Kimi OAuth] Failed to import token ${i + 1}:`, error.message);
            results.failed++;
            results.errors.push({ index: i + 1, error: error.message });
        }
    }

    logger.info('[Kimi OAuth] ========== Import Summary ==========');
    logger.info(`[Kimi OAuth] Total: ${results.total}`);
    logger.info(`[Kimi OAuth] Success: ${results.success}`);
    logger.info(`[Kimi OAuth] Failed: ${results.failed}`);
    logger.info('[Kimi OAuth] =====================================');

    return results;
}

/**
 * 批量导入 Kimi refresh tokens（流式处理）
 * @param {Array<string>} refreshTokens - Refresh token 列表
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Object>} 导入结果
 */
export async function batchImportKimiRefreshTokensStream(refreshTokens, progressCallback) {
    const outputDir = path.join(process.cwd(), 'configs', 'kimi');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = {
        total: refreshTokens.length,
        success: 0,
        failed: 0,
        details: []
    };

    logger.info(`[Kimi OAuth] Importing ${refreshTokens.length} refresh tokens...`);

    for (let i = 0; i < refreshTokens.length; i++) {
        const refreshToken = refreshTokens[i].trim();
        if (!refreshToken) continue;

        try {
            logger.info(`[Kimi OAuth] Processing token ${i + 1}/${refreshTokens.length}...`);

            // 创建临时 token storage
            const tempStorage = new KimiTokenStorage({
                access_token: '',
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_at: 0
            });

            // 刷新获取完整 token
            const newTokenStorage = await refreshKimiToken(tempStorage);

            // 保存到文件
            const filename = `kimi-token-${Date.now()}-${i}.json`;
            const filepath = path.join(outputDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(newTokenStorage.toJSON(), null, 2), 'utf-8');

            logger.info(`[Kimi OAuth] Token ${i + 1} saved to: ${filepath}`);
            results.success++;
            results.details.push({
                index: i + 1,
                success: true,
                filepath
            });

            // 调用进度回调
            if (progressCallback) {
                progressCallback({
                    index: i + 1,
                    total: refreshTokens.length,
                    success: true,
                    filepath
                });
            }

            // 添加延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            logger.error(`[Kimi OAuth] Failed to import token ${i + 1}:`, error.message);
            results.failed++;
            results.details.push({
                index: i + 1,
                success: false,
                error: error.message
            });

            // 调用进度回调
            if (progressCallback) {
                progressCallback({
                    index: i + 1,
                    total: refreshTokens.length,
                    success: false,
                    error: error.message
                });
            }
        }
    }

    logger.info('[Kimi OAuth] ========== Import Summary ==========');
    logger.info(`[Kimi OAuth] Total: ${results.total}`);
    logger.info(`[Kimi OAuth] Success: ${results.success}`);
    logger.info(`[Kimi OAuth] Failed: ${results.failed}`);
    logger.info('[Kimi OAuth] =====================================');

    return results;
}

/**
 * 检查 Kimi 凭据是否重复
 * @param {string} tokenPath - Token 文件路径
 * @param {string} compareDir - 比较目录
 * @returns {Promise<Object>} 检查结果
 */
export async function checkKimiCredentialsDuplicate(tokenPath, compareDir) {
    try {
        const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));

        if (tokenData.type !== 'kimi') {
            return { isDuplicate: false, reason: 'not_kimi_token' };
        }

        const deviceId = tokenData.device_id;
        if (!deviceId) {
            return { isDuplicate: false, reason: 'no_device_id' };
        }

        const files = fs.readdirSync(compareDir);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== path.basename(tokenPath));

        for (const file of jsonFiles) {
            const filepath = path.join(compareDir, file);
            try {
                const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                if (data.type === 'kimi' && data.device_id === deviceId) {
                    return {
                        isDuplicate: true,
                        duplicateFile: filepath,
                        deviceId
                    };
                }
            } catch (error) {
                // 忽略无法读取的文件
                continue;
            }
        }

        return { isDuplicate: false };
    } catch (error) {
        logger.error('[Kimi OAuth] Failed to check duplicate:', error.message);
        throw error;
    }
}

/**
 * 刷新 Kimi tokens（批量）
 * @param {string} directory - Token 目录
 * @param {Object} config - 全局配置
 * @returns {Promise<Object>} 刷新结果
 */
export async function refreshKimiTokens(directory, config = {}) {
    if (!fs.existsSync(directory)) {
        throw new Error(`Directory not found: ${directory}`);
    }

    const files = fs.readdirSync(directory);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const results = {
        total: jsonFiles.length,
        success: 0,
        failed: 0,
        skipped: 0,
        errors: []
    };

    logger.info(`[Kimi OAuth] Refreshing ${jsonFiles.length} token files...`);

    for (const file of jsonFiles) {
        const filepath = path.join(directory, file);

        try {
            const tokenData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

            if (tokenData.type !== 'kimi') {
                results.skipped++;
                continue;
            }

            if (!tokenData.refresh_token) {
                logger.warn(`[Kimi OAuth] No refresh token in ${file}, skipping`);
                results.skipped++;
                continue;
            }

            const tokenStorage = KimiTokenStorage.fromJSON(tokenData);
            const newTokenStorage = await refreshKimiToken(tokenStorage, config);

            fs.writeFileSync(filepath, JSON.stringify(newTokenStorage.toJSON(), null, 2), 'utf-8');
            logger.info(`[Kimi OAuth] Refreshed: ${file}`);
            results.success++;

            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            logger.error(`[Kimi OAuth] Failed to refresh ${file}:`, error.message);
            results.failed++;
            results.errors.push({ file, error: error.message });
        }
    }

    logger.info('[Kimi OAuth] ========== Refresh Summary ==========');
    logger.info(`[Kimi OAuth] Total: ${results.total}`);
    logger.info(`[Kimi OAuth] Success: ${results.success}`);
    logger.info(`[Kimi OAuth] Failed: ${results.failed}`);
    logger.info(`[Kimi OAuth] Skipped: ${results.skipped}`);
    logger.info('[Kimi OAuth] ======================================');

    return results;
}

export default {
    handleKimiOAuth,
    batchImportKimiRefreshTokens,
    batchImportKimiRefreshTokensStream,
    checkKimiCredentialsDuplicate,
    refreshKimiTokens
};
