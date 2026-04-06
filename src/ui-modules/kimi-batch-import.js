/**
 * 批量导入 Kimi Refresh Tokens（带实时进度 SSE）
 */
import { getRequestBody } from '../utils/common.js';
import logger from '../utils/logger.js';
import { batchImportKimiRefreshTokensStream } from '../auth/oauth-handlers.js';

export async function handleBatchImportKimiTokens(req, res) {
    try {
        const body = await getRequestBody(req);
        const { refreshTokens } = body;

        if (!refreshTokens || !Array.isArray(refreshTokens) || refreshTokens.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'refreshTokens array is required and must not be empty'
            }));
            return true;
        }

        logger.info(`[Kimi Batch Import] Starting batch import of ${refreshTokens.length} tokens with SSE...`);

        // 设置 SSE 响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // 发送 SSE 事件的辅助函数（带错误处理）
        const sendSSE = (event, data) => {
            if (!res.writableEnded && !res.destroyed) {
                try {
                    res.write(`event: ${event}\n`);
                    res.write(`data: ${JSON.stringify(data)}\n\n`);
                } catch (err) {
                    logger.error('[Kimi Batch Import] Failed to write SSE:', err.message);
                    return false;
                }
            }
            return true;
        };

        // 发送开始事件
        sendSSE('start', { total: refreshTokens.length });

        // 执行流式批量导入
        const result = await batchImportKimiRefreshTokensStream(
            refreshTokens,
            (progress) => {
                // 每处理完一个 token 发送进度更新
                sendSSE('progress', progress);
            }
        );

        logger.info(`[Kimi Batch Import] Completed: ${result.success} success, ${result.failed} failed`);

        // 发送完成事件
        sendSSE('complete', {
            success: true,
            total: result.total,
            successCount: result.success,
            failedCount: result.failed,
            details: result.details
        });

        res.end();
        return true;

    } catch (error) {
        logger.error('[Kimi Batch Import] Error:', error);
        if (res.headersSent && !res.writableEnded && !res.destroyed) {
            try {
                res.write(`event: error\n`);
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            } catch (writeErr) {
                logger.error('[Kimi Batch Import] Failed to write error:', writeErr.message);
            }
        } else if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
        return true;
    }
}
