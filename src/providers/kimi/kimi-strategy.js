/**
 * Kimi Provider 策略实现
 * 处理 Kimi API 的请求转换和响应处理
 */

import logger from '../../utils/logger.js';
import { ProviderStrategy } from '../../utils/provider-strategy.js';
import { KimiApiService } from './kimi-core.js';

/**
 * Kimi Provider 策略类
 */
export class KimiStrategy extends ProviderStrategy {
    constructor(config) {
        super();
        this.config = config;
        this.apiService = new KimiApiService(config);
        this.providerName = 'kimi';
    }

    /**
     * 设置认证信息
     */
    setAuth(tokenStorage) {
        this.apiService.setTokenStorage(tokenStorage);
    }

    /**
     * 提取模型和流信息
     */
    extractModelAndStreamInfo(req, requestBody) {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        const urlMatch = requestUrl.pathname.match(/\/v1\/chat\/completions/);
        const isStream = requestBody.stream === true;
        const model = requestBody.model || '';
        return { model, isStream };
    }

    /**
     * 提取响应文本
     */
    extractResponseText(response) {
        if (response.choices && response.choices.length > 0) {
            return response.choices[0].message?.content || '';
        }
        return '';
    }

    /**
     * 提取提示文本
     */
    extractPromptText(requestBody) {
        if (requestBody.messages && requestBody.messages.length > 0) {
            const lastMessage = requestBody.messages[requestBody.messages.length - 1];
            return lastMessage.content || '';
        }
        return '';
    }

    /**
     * 处理聊天补全请求（非流式）
     */
    async handleChatCompletion(requestBody, sourceFormat = 'openai') {
        try {
            logger.info(`[Kimi Strategy] Processing chat completion request (format: ${sourceFormat})`);

            let openaiBody = requestBody;

            // 如果是 Claude 格式，转换为 OpenAI 格式
            if (sourceFormat === 'claude') {
                logger.debug('[Kimi Strategy] Converting Claude format to OpenAI format');
                openaiBody = this.convertClaudeToOpenAI(requestBody);
            }

            // 调用 Kimi API
            const response = await this.apiService.chatCompletion(openaiBody);

            // 如果需要返回 Claude 格式，进行转换
            if (sourceFormat === 'claude') {
                logger.debug('[Kimi Strategy] Converting OpenAI response to Claude format');
                return this.convertOpenAIResponseToClaude(response);
            }

            return response;
        } catch (error) {
            logger.error('[Kimi Strategy] Chat completion failed:', error.message);
            throw error;
        }
    }

    /**
     * 处理聊天补全请求（流式）
     */
    async *handleChatCompletionStream(requestBody, sourceFormat = 'openai') {
        try {
            logger.info(`[Kimi Strategy] Processing streaming chat completion (format: ${sourceFormat})`);

            let openaiBody = requestBody;

            // 如果是 Claude 格式，转换为 OpenAI 格式
            if (sourceFormat === 'claude') {
                logger.debug('[Kimi Strategy] Converting Claude format to OpenAI format for streaming');
                openaiBody = this.convertClaudeToOpenAI(requestBody);
            }

            // 调用 Kimi API 流式接口
            for await (const chunk of this.apiService.chatCompletionStream(openaiBody)) {
                // 如果需要返回 Claude 格式，进行转换
                if (sourceFormat === 'claude') {
                    // 流式 Claude 格式转换
                    const claudeChunk = this.convertStreamChunkToClaude(chunk);
                    if (claudeChunk) {
                        yield claudeChunk;
                    }
                } else {
                    yield chunk;
                }
            }
        } catch (error) {
            logger.error('[Kimi Strategy] Streaming chat completion failed:', error.message);
            throw error;
        }
    }

    /**
     * 将 Claude 格式请求转换为 OpenAI 格式
     */
    convertClaudeToOpenAI(claudeRequest) {
        const openaiRequest = {
            model: claudeRequest.model,
            messages: claudeRequest.messages,
            system: claudeRequest.system || claudeRequest.system_instruction,
            max_tokens: claudeRequest.max_tokens,
            temperature: claudeRequest.temperature,
            top_p: claudeRequest.top_p,
            stream: claudeRequest.stream,
        };

        // 移除 undefined 值
        Object.keys(openaiRequest).forEach(key => {
            if (openaiRequest[key] === undefined) {
                delete openaiRequest[key];
            }
        });

        return openaiRequest;
    }

    /**
     * 将 OpenAI 格式响应转换为 Claude 格式
     */
    convertOpenAIResponseToClaude(data, model) {
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
     * 转换流式响应块为 Claude 格式
     */
    convertStreamChunkToClaude(openaiChunk) {
        try {
            // OpenAI 流式格式
            const choice = openaiChunk.choices?.[0];
            if (!choice) return null;

            const delta = choice.delta;
            if (!delta) return null;

            // 构建 Claude 流式响应
            const claudeChunk = {
                type: 'content_block_delta',
                index: 0,
                delta: {}
            };

            // 处理内容
            if (delta.content) {
                claudeChunk.delta.type = 'text_delta';
                claudeChunk.delta.text = delta.content;
            }

            // 处理工具调用
            if (delta.tool_calls) {
                claudeChunk.type = 'content_block_delta';
                claudeChunk.delta.type = 'input_json_delta';
                claudeChunk.delta.partial_json = JSON.stringify(delta.tool_calls);
            }

            // 处理结束
            if (choice.finish_reason) {
                return {
                    type: 'message_delta',
                    delta: {
                        stop_reason: this.mapFinishReason(choice.finish_reason)
                    },
                    usage: openaiChunk.usage
                };
            }

            return claudeChunk;
        } catch (error) {
            logger.warn('[Kimi Strategy] Failed to convert stream chunk:', error.message);
            return null;
        }
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

    /**
     * 获取模型列表
     */
    async listModels() {
        try {
            logger.info('[Kimi Strategy] Fetching model list');
            const response = await this.apiService.listModels();
            return response;
        } catch (error) {
            logger.error('[Kimi Strategy] Failed to list models:', error.message);
            throw error;
        }
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            await this.apiService.getAccessToken();
            return { status: 'healthy', provider: this.providerName };
        } catch (error) {
            logger.error('[Kimi Strategy] Health check failed:', error.message);
            return { status: 'unhealthy', provider: this.providerName, error: error.message };
        }
    }

    /**
     * 应用系统提示词文件
     */
    async applySystemPromptFromFile(config, requestBody) {
        if (!config.SYSTEM_PROMPT_FILE_PATH) {
            return requestBody;
        }

        const filePromptContent = config.SYSTEM_PROMPT_CONTENT;
        if (filePromptContent === null) {
            return requestBody;
        }

        const existingSystemText = this.extractSystemPromptFromRequestBody(requestBody);

        const newSystemText = config.SYSTEM_PROMPT_MODE === 'append' && existingSystemText
            ? `${existingSystemText}\n${filePromptContent}`
            : filePromptContent;

        requestBody.system = newSystemText;

        logger.info(`[System Prompt] Applied system prompt from ${config.SYSTEM_PROMPT_FILE_PATH} in '${config.SYSTEM_PROMPT_MODE}' mode for provider 'kimi'.`);

        return requestBody;
    }

    /**
     * 从请求体提取系统提示
     */
    extractSystemPromptFromRequestBody(requestBody) {
        if (!requestBody) return '';
        return requestBody.system || requestBody.system_instruction || '';
    }

    /**
     * 管理系统提示
     */
    async manageSystemPrompt(requestBody) {
        return requestBody;
    }
}

export default KimiStrategy;