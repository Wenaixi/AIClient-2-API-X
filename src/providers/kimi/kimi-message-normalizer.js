/**
 * Kimi 消息标准化工具
 * 参考 CLIProxyAPI kimi_executor.go 的 normalizeKimiToolMessageLinks 实现
 */

import logger from '../../utils/logger.js';

/**
 * 标准化 Kimi 工具消息链接
 * 处理 assistant 消息的 reasoning_content 和 tool 消息的 tool_call_id
 */
export function normalizeKimiToolMessageLinks(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return body;
    }

    const pending = new Set();
    let patched = 0;
    let patchedReasoning = 0;
    let ambiguous = 0;

    const removePending = (id) => {
        pending.delete(id);
    };

    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
        const msg = messages[msgIdx];
        const role = msg.role?.trim();

        if (role === 'assistant') {
            // 处理 reasoning_content
            const reasoning = msg.reasoning_content;

            // 处理 tool_calls
            const toolCalls = msg.tool_calls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                // 如果没有 reasoning_content，使用占位符（向前看逻辑：不让后续的 reasoning 填充前面的消息）
                if (!reasoning || !reasoning.trim()) {
                    msg.reasoning_content = '[reasoning unavailable]';
                    patchedReasoning++;
                }

                // 记录待处理的 tool_call_id
                for (const tc of toolCalls) {
                    const id = tc.id?.trim();
                    if (id) {
                        pending.add(id);
                    }
                }
            }
        } else if (role === 'tool') {
            // 处理 tool_call_id
            let toolCallId = msg.tool_call_id?.trim();

            // 尝试从 call_id 获取
            if (!toolCallId) {
                const callId = msg.call_id?.trim();
                if (callId) {
                    msg.tool_call_id = callId;
                    toolCallId = callId;
                    patched++;
                }
            }

            // 如果还是没有，尝试推断
            if (!toolCallId) {
                if (pending.size === 1) {
                    // 只有一个待处理的 tool_call，直接使用
                    const soleId = [...pending][0];
                    toolCallId = soleId;
                    msg.tool_call_id = toolCallId;
                    patched++;
                } else if (pending.size > 1) {
                    // 多个待处理的 tool_call，无法确定，添加占位符
                    toolCallId = `[ambiguous_tool_call_id_${msgIdx}]`;
                    msg.tool_call_id = toolCallId;
                    ambiguous++;
                    // 清除所有待处理的 pending ID，因为无法确定对应关系
                    pending.clear();
                    logger.warn(`[Kimi] Multiple pending tool_calls for message ${msgIdx}, using placeholder: ${toolCallId}`);
                }
            }

            // 从待处理列表中移除
            if (toolCallId) {
                removePending(toolCallId);
            }
        }
    }

    if (patched > 0 || patchedReasoning > 0) {
        logger.debug(`[Kimi] Normalized tool message fields: patched_tool=${patched}, patched_reasoning=${patchedReasoning}`);
    }

    if (ambiguous > 0) {
        logger.warn(`[Kimi] Tool messages missing tool_call_id with ambiguous candidates: ambiguous=${ambiguous}, pending=${pending.size}`);
    }

    return body;
}

/**
 * 回退的 assistant reasoning 生成逻辑
 */
function fallbackAssistantReasoning(msg, hasLatest, latest) {
    // 优先使用最近的 reasoning
    if (hasLatest && latest?.trim()) {
        return latest;
    }

    // 尝试从 content 提取
    const content = msg.content;

    if (typeof content === 'string') {
        const text = content.trim();
        if (text) {
            return text;
        }
    }

    if (Array.isArray(content)) {
        const parts = [];
        for (const item of content) {
            const text = item.text?.trim();
            if (text) {
                parts.push(text);
            }
        }
        if (parts.length > 0) {
            return parts.join('\n');
        }
    }

    return '[reasoning unavailable]';
}

export default {
    normalizeKimiToolMessageLinks,
    fallbackAssistantReasoning
};
