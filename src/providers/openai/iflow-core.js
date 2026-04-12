/**
 * iFlow API 服务
 * OpenAI 兼容的 API 格式
 */

import axios from 'axios';
import logger from '../../utils/logger.js';

export class IFlowApiService {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.IFLOW_API_BASE_URL || 'https://api.iflow.io/v1';
        this.apiKey = config.IFLOW_API_KEY;
    }

    async chatCompletion(messages, options = {}) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: options.model || 'gpt-3.5-turbo',
                    messages,
                    ...options
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            logger.error('[iFlow] API error:', error.message);
            throw error;
        }
    }
}
