/**
 * Kimi OAuth Token 刷新脚本
 * 用于批量刷新 Kimi OAuth tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { refreshKimiToken, KimiTokenStorage } from '../auth/kimi-oauth.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 刷新单个 Kimi token 文件
 */
async function refreshTokenFile(filePath) {
    try {
        logger.info(`[Kimi Refresh] Processing: ${filePath}`);

        // 读取 token 文件
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const tokenData = JSON.parse(fileContent);

        // 验证是否为 Kimi token
        if (tokenData.type !== 'kimi') {
            logger.warn(`[Kimi Refresh] Skipping non-Kimi token: ${filePath}`);
            return { success: false, reason: 'not_kimi_token' };
        }

        // 检查是否有 refresh_token
        if (!tokenData.refresh_token) {
            logger.warn(`[Kimi Refresh] No refresh token found: ${filePath}`);
            return { success: false, reason: 'no_refresh_token' };
        }

        // 创建 TokenStorage 实例
        const tokenStorage = KimiTokenStorage.fromJSON(tokenData);

        // 刷新 token
        logger.info(`[Kimi Refresh] Refreshing token: ${filePath}`);
        const newTokenStorage = await refreshKimiToken(tokenStorage);

        // 保存新 token
        const newTokenData = newTokenStorage.toJSON();
        fs.writeFileSync(filePath, JSON.stringify(newTokenData, null, 2), 'utf-8');

        logger.info(`[Kimi Refresh] Successfully refreshed: ${filePath}`);
        return { success: true };
    } catch (error) {
        logger.error(`[Kimi Refresh] Failed to refresh ${filePath}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * 批量刷新目录下的所有 Kimi token 文件
 */
async function refreshTokensInDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        logger.error(`[Kimi Refresh] Directory not found: ${dirPath}`);
        return;
    }

    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    logger.info(`[Kimi Refresh] Found ${jsonFiles.length} JSON files in ${dirPath}`);

    const results = {
        total: jsonFiles.length,
        success: 0,
        failed: 0,
        skipped: 0,
        errors: []
    };

    for (const file of jsonFiles) {
        const filePath = path.join(dirPath, file);
        const result = await refreshTokenFile(filePath);

        if (result.success) {
            results.success++;
        } else if (result.reason === 'not_kimi_token') {
            results.skipped++;
        } else {
            results.failed++;
            results.errors.push({ file, reason: result.reason });
        }

        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 输出统计信息
    logger.info('[Kimi Refresh] ========== Summary ==========');
    logger.info(`[Kimi Refresh] Total files: ${results.total}`);
    logger.info(`[Kimi Refresh] Successfully refreshed: ${results.success}`);
    logger.info(`[Kimi Refresh] Failed: ${results.failed}`);
    logger.info(`[Kimi Refresh] Skipped (non-Kimi): ${results.skipped}`);

    if (results.errors.length > 0) {
        logger.info('[Kimi Refresh] Failed files:');
        results.errors.forEach(err => {
            logger.info(`  - ${err.file}: ${err.reason}`);
        });
    }

    logger.info('[Kimi Refresh] ============================');
}

/**
 * 主函数
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node kimi-token-refresh.js <directory>  # Refresh all tokens in directory');
        console.log('  node kimi-token-refresh.js <file.json>  # Refresh single token file');
        console.log('');
        console.log('Examples:');
        console.log('  node kimi-token-refresh.js ./configs/kimi-tokens');
        console.log('  node kimi-token-refresh.js ./configs/kimi-tokens/token1.json');
        process.exit(0);
    }

    const targetPath = path.resolve(args[0]);

    if (!fs.existsSync(targetPath)) {
        logger.error(`[Kimi Refresh] Path not found: ${targetPath}`);
        process.exit(1);
    }

    const stat = fs.statSync(targetPath);

    if (stat.isDirectory()) {
        logger.info(`[Kimi Refresh] Refreshing all tokens in directory: ${targetPath}`);
        await refreshTokensInDirectory(targetPath);
    } else if (stat.isFile()) {
        logger.info(`[Kimi Refresh] Refreshing single token file: ${targetPath}`);
        const result = await refreshTokenFile(targetPath);
        if (!result.success) {
            logger.error(`[Kimi Refresh] Failed: ${result.reason}`);
            process.exit(1);
        }
    } else {
        logger.error(`[Kimi Refresh] Invalid path type: ${targetPath}`);
        process.exit(1);
    }

    logger.info('[Kimi Refresh] Done!');
}

// 运行主函数
main().catch(error => {
    logger.error('[Kimi Refresh] Fatal error:', error);
    process.exit(1);
});
