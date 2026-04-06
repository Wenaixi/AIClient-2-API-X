/**
 * Kimi转换器
 * 处理Kimi协议与其他协议之间的转换
 */

import { BaseConverter } from '../BaseConverter.js';
import { MODEL_PROTOCOL_PREFIX } from '../../utils/common.js';

/**
 * Kimi转换器类
 * 实现Kimi协议到其他协议的转换
 */
export class KimiConverter extends BaseConverter {
    constructor() {
        super('kimi');
    }

    /**
     * 转换请求
     */
    convertRequest(data, targetProtocol) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return this.toOpenAIRequest(data);
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeRequest(data);
            default:
                // OpenAI is the native format for Kimi, return as-is
                return data;
        }
    }

    /**
     * 转换响应
     */
    convertResponse(data, targetProtocol, model) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return data; // Already in OpenAI format
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeResponse(data, model);
            default:
                return data;
        }
    }

    /**
     * 转换流式响应块
     */
    convertStreamChunk(chunk, targetProtocol, model, requestId) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return chunk; // Already in OpenAI format
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeStreamChunk(chunk, model);
            default:
                return chunk;
        }
    }

    /**
     * 转换模型列表
     * Kimi 模型列表已经是 OpenAI 格式，直接返回
     */
    convertModelList(data, targetProtocol) {
        return data;
    }

    /**
     * 转换为OpenAI请求格式（Kimi 使用 OpenAI 格式）
     */
    toOpenAIRequest(data) {
        // Kimi API 使用 OpenAI 格式，直接返回
        return data;
    }

    /**
     * 转换为Claude请求格式
     */
    toClaudeRequest(data) {
        // 转换 OpenAI 格式到 Claude 格式
        const claudeRequest = {
            model: data.model,
            messages: data.messages,
            system: data.system || data.system_instruction,
            max_tokens: data.max_tokens,
            temperature: data.temperature,
            top_p: data.top_p,
            stream: data.stream,
        };

        // 移除 undefined 值
        Object.keys(claudeRequest).forEach(key => {
            if (claudeRequest[key] === undefined) {
                delete claudeRequest[key];
            }
        });

        return claudeRequest;
    }

    /**
     * 转换为Claude响应格式
     */
    toClaudeResponse(data, model) {
        // 将 OpenAI 格式转换为 Claude 格式
        return {
            id: data.id || `kimi-${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: data.choices?.[0]?.message?.content || '',
            model: model,
            stop_reason: this.mapFinishReason(data.choices?.[0]?.finish_reason),
            usage: data.usage || { input_tokens: 0, output_tokens: 0 },
        };
    }

    /**
     * 转换流式响应块为Claude格式
     */
    toClaudeStreamChunk(chunk, model) {
        const choice = chunk.choices?.[0];
        if (!choice) return null;

        const delta = choice.delta;
        if (!delta) return null;

        const claudeChunk = {
            type: 'content_block_delta',
            index: choice.index || 0,
            delta: {}
        };

        // 处理内容
        if (delta.content) {
            claudeChunk.delta.type = 'text_delta';
            claudeChunk.delta.text = delta.content;
        }

        // 处理工具调用
        if (delta.tool_calls && delta.tool_calls.length > 0) {
            claudeChunk.type = 'content_block_delta';
            claudeChunk.delta.type = 'input_json_delta';
            // partial_json 应为工具调用参数的 JSON 片段
            const toolCall = delta.tool_calls[0];
            if (toolCall?.function?.arguments) {
                claudeChunk.delta.partial_json = typeof toolCall.function.arguments === 'string'
                    ? toolCall.function.arguments
                    : JSON.stringify(toolCall.function.arguments);
            }
        }

        // 处理结束
        if (choice.finish_reason) {
            return {
                type: 'message_delta',
                delta: {
                    stop_reason: this.mapFinishReason(choice.finish_reason)
                },
                usage: chunk.usage
            };
        }

        return claudeChunk;
    }

    /**
     * 映射结束原因
     */
    mapFinishReason(openaiReason) {
        const reasonMap = {
            'stop': 'end_turn',
            'length': 'max_tokens',
            'tool_calls': 'tool_use',
            'content_filter': 'stop_sequence'
        };
        return reasonMap[openaiReason] || 'end_turn';
    }
}

export default KimiConverter;
