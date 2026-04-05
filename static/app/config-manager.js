// 配置管理模块

import { showToast, formatUptime } from './utils.js';
import { handleProviderChange, handleGeminiCredsTypeChange, handleKiroCredsTypeChange } from './event-handlers.js';
import { loadProviders } from './provider-manager.js';
import { t } from './i18n.js';

// 提供商配置缓存
let currentProviderConfigs = null;

// ==================== 时间转换辅助函数 ====================

/**
 * 将毫秒转换为 小时/分钟/秒
 * @param {number} ms - 毫秒
 * @returns {{hours: number, minutes: number, seconds: number}}
 */
function msToHms(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
}

/**
 * 将 小时/分钟/秒 转换为毫秒
 * @param {number} hours
 * @param {number} minutes
 * @param {number} seconds
 * @returns {number} 毫秒
 */
function hmsToMs(hours, minutes, seconds) {
    return ((hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0)) * 1000;
}

/**
 * 更新提供商配置并重新渲染配置页面的提供商选择标签
 * @param {Array} configs - 提供商配置列表
 */
function updateConfigProviderConfigs(configs) {
    currentProviderConfigs = configs;
    
    // 渲染基础设置中的模型提供商选择
    const modelProviderEl = document.getElementById('modelProvider');
    if (modelProviderEl) {
        renderProviderTags(modelProviderEl, configs, true);
    }
    
    // 渲染代理设置中的提供商选择
    const proxyProvidersEl = document.getElementById('proxyProviders');
    if (proxyProvidersEl) {
        renderProviderTags(proxyProvidersEl, configs, false);
    }

    // 渲染 TLS Sidecar 设置中的提供商选择
    const tlsSidecarProvidersEl = document.getElementById('tlsSidecarProviders');
    if (tlsSidecarProvidersEl) {
        renderProviderTags(tlsSidecarProvidersEl, configs, false);
    }

    // 渲染定时健康检查的提供商选择
    const scheduledHealthCheckProvidersEl = document.getElementById('scheduledHealthCheckProviders');
    if (scheduledHealthCheckProvidersEl) {
        renderProviderTags(scheduledHealthCheckProvidersEl, configs, false);
    }
    
    // 重新加载当前配置以恢复选中状态
    loadConfiguration();
}

/**
 * 渲染提供商标签按钮
 * @param {HTMLElement} container - 容器元素
 * @param {Array} configs - 提供商配置列表
 * @param {boolean} isRequired - 是否至少需要选择一个（用于点击事件逻辑）
 */
function renderProviderTags(container, configs, isRequired) {
    // 过滤掉不可见的提供商
    const visibleConfigs = configs.filter(c => c.visible !== false);
    
    const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    container.innerHTML = visibleConfigs.map(c => `
        <button type="button" class="provider-tag" data-value="${escHtml(c.id)}">
            <i class="fas ${escHtml(c.icon || 'fa-server')}"></i>
            <span>${escHtml(c.name)}</span>
        </button>
    `).join('');
    
    // 为新生成的标签添加点击事件
    const tags = container.querySelectorAll('.provider-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.preventDefault();
            const isSelected = tag.classList.contains('selected');
            
            if (isRequired) {
                const selectedCount = container.querySelectorAll('.provider-tag.selected').length;
                // 如果当前是选中状态且只剩一个选中的，不允许取消
                if (isSelected && selectedCount === 1) {
                    showToast(t('common.warning'), t('config.modelProviderRequired'), 'warning');
                    return;
                }
            }
            
            // 切换选中状态
            tag.classList.toggle('selected');
        });
    });
}

/**
 * 加载配置
 */
async function loadConfiguration() {
    try {
        const data = await window.apiClient.get('/config');

        // 基础配置
        const apiKeyEl = document.getElementById('apiKey');
        const hostEl = document.getElementById('host');
        const portEl = document.getElementById('port');
        const modelProviderEl = document.getElementById('modelProvider');
        const systemPromptEl = document.getElementById('systemPrompt');

        if (apiKeyEl) apiKeyEl.value = data.REQUIRED_API_KEY || '';
        if (hostEl) hostEl.value = data.HOST || '127.0.0.1';
        if (portEl) portEl.value = data.SERVER_PORT || 3000;
        
        if (modelProviderEl) {
            // 处理多选 MODEL_PROVIDER
            const providers = Array.isArray(data.DEFAULT_MODEL_PROVIDERS)
                ? data.DEFAULT_MODEL_PROVIDERS
                : (typeof data.MODEL_PROVIDER === 'string' ? data.MODEL_PROVIDER.split(',') : []);
            
            const tags = modelProviderEl.querySelectorAll('.provider-tag');
            tags.forEach(tag => {
                const value = tag.getAttribute('data-value');
                if (providers.includes(value)) {
                    tag.classList.add('selected');
                } else {
                    tag.classList.remove('selected');
                }
            });
            
            // 如果没有任何选中的，默认选中第一个（保持兼容性）
            const anySelected = Array.from(tags).some(tag => tag.classList.contains('selected'));
            if (!anySelected && tags.length > 0) {
                tags[0].classList.add('selected');
            }
        }
        
        if (systemPromptEl) systemPromptEl.value = data.systemPrompt || '';

        // 高级配置参数
        const systemPromptFilePathEl = document.getElementById('systemPromptFilePath');
        const systemPromptModeEl = document.getElementById('systemPromptMode');
        const promptLogBaseNameEl = document.getElementById('promptLogBaseName');
        const promptLogModeEl = document.getElementById('promptLogMode');
        const requestMaxRetriesEl = document.getElementById('requestMaxRetries');
        const requestBaseDelayEl = document.getElementById('requestBaseDelay');
        const cronNearMinutesEl = document.getElementById('cronNearMinutes');
        const cronRefreshTokenEl = document.getElementById('cronRefreshToken');
        const loginExpiryEl = document.getElementById('loginExpiry');
        const providerPoolsFilePathEl = document.getElementById('providerPoolsFilePath');

        const maxErrorCountEl = document.getElementById('maxErrorCount');
        const warmupTargetEl = document.getElementById('warmupTarget');
        const refreshConcurrencyPerProviderEl = document.getElementById('refreshConcurrencyPerProvider');
        const providerFallbackChainEl = document.getElementById('providerFallbackChain');
        const modelFallbackMappingEl = document.getElementById('modelFallbackMapping');

        if (systemPromptFilePathEl) systemPromptFilePathEl.value = data.SYSTEM_PROMPT_FILE_PATH || 'configs/input_system_prompt.txt';
        if (systemPromptModeEl) systemPromptModeEl.value = data.SYSTEM_PROMPT_MODE || 'append';
        if (promptLogBaseNameEl) promptLogBaseNameEl.value = data.PROMPT_LOG_BASE_NAME || 'prompt_log';
        if (promptLogModeEl) promptLogModeEl.value = data.PROMPT_LOG_MODE || 'none';
        if (requestMaxRetriesEl) requestMaxRetriesEl.value = data.REQUEST_MAX_RETRIES || 3;

        // 加载重试基础延迟（毫秒转换为时/分/秒）
        const requestBaseDelayMs = data.REQUEST_BASE_DELAY || 1000;
        const requestBaseDelay = msToHms(requestBaseDelayMs);
        const requestBaseDelayHoursEl = document.getElementById('requestBaseDelayHours');
        const requestBaseDelayMinutesEl = document.getElementById('requestBaseDelayMinutes');
        const requestBaseDelaySecondsEl = document.getElementById('requestBaseDelaySeconds');
        if (requestBaseDelayHoursEl) requestBaseDelayHoursEl.value = requestBaseDelay.hours;
        if (requestBaseDelayMinutesEl) requestBaseDelayMinutesEl.value = requestBaseDelay.minutes;
        if (requestBaseDelaySecondsEl) requestBaseDelaySecondsEl.value = requestBaseDelay.seconds;

        // 坏凭证切换最大重试次数
        const credentialSwitchMaxRetriesEl = document.getElementById('credentialSwitchMaxRetries');
        if (credentialSwitchMaxRetriesEl) credentialSwitchMaxRetriesEl.value = data.CREDENTIAL_SWITCH_MAX_RETRIES || 5;
        
        if (cronNearMinutesEl) cronNearMinutesEl.value = data.CRON_NEAR_MINUTES || 1;
        if (cronRefreshTokenEl) cronRefreshTokenEl.checked = data.CRON_REFRESH_TOKEN || false;

        // 加载登录过期时间（秒转换为时/分/秒）
        const loginExpirySeconds = data.LOGIN_EXPIRY || 3600;
        const loginExpiryHms = {
            hours: Math.floor(loginExpirySeconds / 3600),
            minutes: Math.floor((loginExpirySeconds % 3600) / 60),
            seconds: loginExpirySeconds % 60
        };
        const loginExpiryHoursEl = document.getElementById('loginExpiryHours');
        const loginExpiryMinutesEl = document.getElementById('loginExpiryMinutes');
        const loginExpirySecondsEl = document.getElementById('loginExpirySeconds');
        if (loginExpiryHoursEl) loginExpiryHoursEl.value = loginExpiryHms.hours;
        if (loginExpiryMinutesEl) loginExpiryMinutesEl.value = loginExpiryHms.minutes;
        if (loginExpirySecondsEl) loginExpirySecondsEl.value = loginExpiryHms.seconds;

        if (providerPoolsFilePathEl) providerPoolsFilePathEl.value = data.PROVIDER_POOLS_FILE_PATH || '';
        if (maxErrorCountEl) maxErrorCountEl.value = data.MAX_ERROR_COUNT || 10;
        if (warmupTargetEl) warmupTargetEl.value = data.WARMUP_TARGET || 0;
        if (refreshConcurrencyPerProviderEl) refreshConcurrencyPerProviderEl.value = data.REFRESH_CONCURRENCY_PER_PROVIDER || 1;
        
        // 加载 Fallback 链配置
        if (providerFallbackChainEl) {
            if (data.providerFallbackChain && typeof data.providerFallbackChain === 'object') {
                providerFallbackChainEl.value = JSON.stringify(data.providerFallbackChain, null, 2);
            } else {
                providerFallbackChainEl.value = '';
            }
        }

        // 加载 Model Fallback 映射配置
        if (modelFallbackMappingEl) {
            if (data.modelFallbackMapping && typeof data.modelFallbackMapping === 'object') {
                modelFallbackMappingEl.value = JSON.stringify(data.modelFallbackMapping, null, 2);
            } else {
                modelFallbackMappingEl.value = '';
            }
        }
        
        // 加载代理配置
        const proxyUrlEl = document.getElementById('proxyUrl');
        if (proxyUrlEl) proxyUrlEl.value = data.PROXY_URL || '';
        
        // 加载启用代理的提供商 (标签按钮)
        const proxyProvidersEl = document.getElementById('proxyProviders');
        if (proxyProvidersEl) {
            const enabledProviders = data.PROXY_ENABLED_PROVIDERS || [];
            const proxyTags = proxyProvidersEl.querySelectorAll('.provider-tag');
            
            proxyTags.forEach(tag => {
                const value = tag.getAttribute('data-value');
                if (enabledProviders.includes(value)) {
                    tag.classList.add('selected');
                } else {
                    tag.classList.remove('selected');
                }
            });
        }
        
        // 加载日志配置
        const logEnabledEl = document.getElementById('logEnabled');
        const logOutputModeEl = document.getElementById('logOutputMode');
        const logLevelEl = document.getElementById('logLevel');
        const logDirEl = document.getElementById('logDir');
        const logIncludeRequestIdEl = document.getElementById('logIncludeRequestId');
        const logIncludeTimestampEl = document.getElementById('logIncludeTimestamp');
        const logMaxFileSizeEl = document.getElementById('logMaxFileSize');
        const logMaxFilesEl = document.getElementById('logMaxFiles');
        
        if (logEnabledEl) logEnabledEl.checked = data.LOG_ENABLED !== false;
        if (logOutputModeEl) logOutputModeEl.value = data.LOG_OUTPUT_MODE || 'all';
        if (logLevelEl) logLevelEl.value = data.LOG_LEVEL || 'info';
        if (logDirEl) logDirEl.value = data.LOG_DIR || 'logs';
        if (logIncludeRequestIdEl) logIncludeRequestIdEl.checked = data.LOG_INCLUDE_REQUEST_ID !== false;
        if (logIncludeTimestampEl) logIncludeTimestampEl.checked = data.LOG_INCLUDE_TIMESTAMP !== false;
        if (logMaxFileSizeEl) logMaxFileSizeEl.value = data.LOG_MAX_FILE_SIZE || 10485760;
        if (logMaxFilesEl) logMaxFilesEl.value = data.LOG_MAX_FILES || 10;
        
        // TLS Sidecar 配置
        const tlsSidecarEnabledEl = document.getElementById('tlsSidecarEnabled');
        const tlsSidecarPortEl = document.getElementById('tlsSidecarPort');
        const tlsSidecarProxyUrlEl = document.getElementById('tlsSidecarProxyUrl');
        const tlsSidecarProvidersEl = document.getElementById('tlsSidecarProviders');

        if (tlsSidecarEnabledEl) tlsSidecarEnabledEl.checked = data.TLS_SIDECAR_ENABLED || false;
        if (tlsSidecarPortEl) tlsSidecarPortEl.value = data.TLS_SIDECAR_PORT || 9090;
        if (tlsSidecarProxyUrlEl) tlsSidecarProxyUrlEl.value = data.TLS_SIDECAR_PROXY_URL || '';
        
        if (tlsSidecarProvidersEl) {
            const enabledProviders = data.TLS_SIDECAR_ENABLED_PROVIDERS || [];
            const tags = tlsSidecarProvidersEl.querySelectorAll('.provider-tag');
            tags.forEach(tag => {
                const value = tag.getAttribute('data-value');
                if (enabledProviders.includes(value)) {
                    tag.classList.add('selected');
                } else {
                    tag.classList.remove('selected');
                }
            });
        }
        
        // 定时健康检查配置
        const scheduledHealthCheckEnabledEl = document.getElementById('scheduledHealthCheckEnabled');
        const scheduledHealthCheckStartupRunEl = document.getElementById('scheduledHealthCheckStartupRun');
        const healthCheckHoursEl = document.getElementById('healthCheckHours');
        const healthCheckMinutesEl = document.getElementById('healthCheckMinutes');
        const healthCheckSecondsEl = document.getElementById('healthCheckSeconds');

        if (data.SCHEDULED_HEALTH_CHECK) {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = data.SCHEDULED_HEALTH_CHECK.enabled === true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = data.SCHEDULED_HEALTH_CHECK.startupRun !== false;
            // 将毫秒 interval 转换为 h/m/s 分量填充表单
            const { hours, minutes, seconds } = msToHms(data.SCHEDULED_HEALTH_CHECK.interval || 600000);
            if (healthCheckHoursEl) healthCheckHoursEl.value = hours;
            if (healthCheckMinutesEl) healthCheckMinutesEl.value = minutes;
            if (healthCheckSecondsEl) healthCheckSecondsEl.value = seconds;
        } else {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = true;
            if (healthCheckHoursEl) healthCheckHoursEl.value = 0;
            if (healthCheckMinutesEl) healthCheckMinutesEl.value = 10;
            if (healthCheckSecondsEl) healthCheckSecondsEl.value = 0;
        }
        
        // 加载定时健康检查的供应商选择
        const scheduledHealthCheckProvidersEl = document.getElementById('scheduledHealthCheckProviders');
        if (scheduledHealthCheckProvidersEl) {
            const enabledProviders = data.SCHEDULED_HEALTH_CHECK?.providerTypes || [];
            const tags = scheduledHealthCheckProvidersEl.querySelectorAll('.provider-tag');
            tags.forEach(tag => {
                const value = tag.getAttribute('data-value');
                if (enabledProviders.includes(value)) {
                    tag.classList.add('selected');
                } else {
                    tag.classList.remove('selected');
                }
            });
        }

        // 加载自定义间隔配置
        inMemoryCustomIntervals = JSON.parse(JSON.stringify(data.SCHEDULED_HEALTH_CHECK?.customIntervals || {}));
        renderCustomIntervalsList();

        // 设置供应商标签的长按/右键事件
        setupProviderLongPressHandlers();
        
        // 定时健康检查间隔快捷按钮（防止重复绑定）
        const intervalQuickBtns = document.querySelectorAll('#healthCheckIntervalGroup .quick-select-btns button');
        intervalQuickBtns.forEach(btn => {
            if (btn.dataset.listenerAttached) return; // 防止重复绑定
            btn.dataset.listenerAttached = 'true';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const ms = parseInt(btn.getAttribute('data-ms'));
                const { hours, minutes, seconds } = msToHms(ms);
                if (healthCheckHoursEl) healthCheckHoursEl.value = hours;
                if (healthCheckMinutesEl) healthCheckMinutesEl.value = minutes;
                if (healthCheckSecondsEl) healthCheckSecondsEl.value = seconds;
            });
        });
        
    } catch (error) {
        console.error('Failed to load configuration:', error);
    }
}

/**
 * 保存配置
 */
async function saveConfiguration() {
    const modelProviderEl = document.getElementById('modelProvider');
    let selectedProviders = [];
    if (modelProviderEl) {
        // 从标签按钮中获取选中的提供商
        selectedProviders = Array.from(modelProviderEl.querySelectorAll('.provider-tag.selected'))
            .map(tag => tag.getAttribute('data-value'));
    }

    // 校验：必须至少勾选一个
    if (selectedProviders.length === 0) {
        showToast(t('common.error'), t('config.modelProviderRequired'), 'error');
        return;
    }

    const config = {
        REQUIRED_API_KEY: document.getElementById('apiKey')?.value || '',
        HOST: document.getElementById('host')?.value || '127.0.0.1',
        SERVER_PORT: parseInt(document.getElementById('port')?.value || 3000),
        MODEL_PROVIDER: selectedProviders.length > 0 ? selectedProviders.join(',') : 'gemini-cli-oauth',
        systemPrompt: document.getElementById('systemPrompt')?.value || '',
    };

    // 获取后台登录密码（如果有输入）
    const adminPassword = document.getElementById('adminPassword')?.value || '';

    // 保存高级配置参数
    config.SYSTEM_PROMPT_FILE_PATH = document.getElementById('systemPromptFilePath')?.value || 'configs/input_system_prompt.txt';
    config.SYSTEM_PROMPT_MODE = document.getElementById('systemPromptMode')?.value || 'append';
    config.PROMPT_LOG_BASE_NAME = document.getElementById('promptLogBaseName')?.value || '';
    config.PROMPT_LOG_MODE = document.getElementById('promptLogMode')?.value || '';
    config.REQUEST_MAX_RETRIES = parseInt(document.getElementById('requestMaxRetries')?.value || 3);

    // 保存重试基础延迟（时/分/秒转换为毫秒）
    const requestBaseDelayHours = parseInt(document.getElementById('requestBaseDelayHours')?.value) || 0;
    const requestBaseDelayMinutes = parseInt(document.getElementById('requestBaseDelayMinutes')?.value) || 0;
    const requestBaseDelaySeconds = parseInt(document.getElementById('requestBaseDelaySeconds')?.value) || 0;
    config.REQUEST_BASE_DELAY = hmsToMs(requestBaseDelayHours, requestBaseDelayMinutes, requestBaseDelaySeconds);

    config.CREDENTIAL_SWITCH_MAX_RETRIES = parseInt(document.getElementById('credentialSwitchMaxRetries')?.value || 5);
    config.CRON_NEAR_MINUTES = parseInt(document.getElementById('cronNearMinutes')?.value || 1);
    config.CRON_REFRESH_TOKEN = document.getElementById('cronRefreshToken')?.checked || false;

    // 保存登录过期时间（时/分/秒转换为秒）
    const loginExpiryHours = parseInt(document.getElementById('loginExpiryHours')?.value) || 0;
    const loginExpiryMinutes = parseInt(document.getElementById('loginExpiryMinutes')?.value) || 0;
    const loginExpirySeconds = parseInt(document.getElementById('loginExpirySeconds')?.value) || 0;
    config.LOGIN_EXPIRY = (loginExpiryHours * 3600) + (loginExpiryMinutes * 60) + loginExpirySeconds;

    config.PROVIDER_POOLS_FILE_PATH = document.getElementById('providerPoolsFilePath')?.value || '';
    config.MAX_ERROR_COUNT = parseInt(document.getElementById('maxErrorCount')?.value || 10);
    config.WARMUP_TARGET = parseInt(document.getElementById('warmupTarget')?.value || 0);
    config.REFRESH_CONCURRENCY_PER_PROVIDER = parseInt(document.getElementById('refreshConcurrencyPerProvider')?.value || 1);
    
    // 保存 Fallback 链配置
    const fallbackChainValue = document.getElementById('providerFallbackChain')?.value?.trim() || '';
    if (fallbackChainValue) {
        try {
            config.providerFallbackChain = JSON.parse(fallbackChainValue);
        } catch (e) {
            showToast(t('common.error'), t('config.advanced.fallbackChainInvalid') || 'Fallback 链配置格式无效，请输入有效的 JSON', 'error');
            return;
        }
    } else {
        config.providerFallbackChain = {};
    }

    // 保存 Model Fallback 映射配置
    const modelFallbackMappingValue = document.getElementById('modelFallbackMapping')?.value?.trim() || '';
    if (modelFallbackMappingValue) {
        try {
            config.modelFallbackMapping = JSON.parse(modelFallbackMappingValue);
        } catch (e) {
            showToast(t('common.error'), t('config.advanced.modelFallbackMappingInvalid') || 'Model Fallback 映射配置格式无效，请输入有效的 JSON', 'error');
            return;
        }
    } else {
        config.modelFallbackMapping = {};
    }
    
    // 保存代理配置
    config.PROXY_URL = document.getElementById('proxyUrl')?.value?.trim() || null;
    
    // 获取启用代理的提供商列表 (从标签按钮)
    const proxyProvidersEl = document.getElementById('proxyProviders');
    if (proxyProvidersEl) {
        config.PROXY_ENABLED_PROVIDERS = Array.from(proxyProvidersEl.querySelectorAll('.provider-tag.selected'))
            .map(tag => tag.getAttribute('data-value'));
    } else {
        config.PROXY_ENABLED_PROVIDERS = [];
    }
    
    // 保存日志配置
    config.LOG_ENABLED = document.getElementById('logEnabled')?.checked !== false;
    config.LOG_OUTPUT_MODE = document.getElementById('logOutputMode')?.value || 'all';
    config.LOG_LEVEL = document.getElementById('logLevel')?.value || 'info';
    config.LOG_DIR = document.getElementById('logDir')?.value || 'logs';
    config.LOG_INCLUDE_REQUEST_ID = document.getElementById('logIncludeRequestId')?.checked !== false;
    config.LOG_INCLUDE_TIMESTAMP = document.getElementById('logIncludeTimestamp')?.checked !== false;
    config.LOG_MAX_FILE_SIZE = parseInt(document.getElementById('logMaxFileSize')?.value || 10485760);
    config.LOG_MAX_FILES = parseInt(document.getElementById('logMaxFiles')?.value || 10);
    
    // TLS Sidecar 配置
    config.TLS_SIDECAR_ENABLED = document.getElementById('tlsSidecarEnabled')?.checked || false;
    config.TLS_SIDECAR_PORT = parseInt(document.getElementById('tlsSidecarPort')?.value || 9090);
    config.TLS_SIDECAR_PROXY_URL = document.getElementById('tlsSidecarProxyUrl')?.value?.trim() || null;
    
    const tlsSidecarProvidersEl = document.getElementById('tlsSidecarProviders');
    if (tlsSidecarProvidersEl) {
        config.TLS_SIDECAR_ENABLED_PROVIDERS = Array.from(tlsSidecarProvidersEl.querySelectorAll('.provider-tag.selected'))
            .map(tag => tag.getAttribute('data-value'));
    } else {
        config.TLS_SIDECAR_ENABLED_PROVIDERS = [];
    }
    
    // 定时健康检查配置
    const scheduledHealthCheckProvidersEl = document.getElementById('scheduledHealthCheckProviders');
    const scheduledHealthCheckProviderTypes = scheduledHealthCheckProvidersEl
        ? Array.from(scheduledHealthCheckProvidersEl.querySelectorAll('.provider-tag.selected'))
            .map(tag => tag.getAttribute('data-value'))
        : [];

    // 将 h/m/s 分量合并为毫秒并验证范围
    const healthCheckHours = parseInt(document.getElementById('healthCheckHours')?.value) || 0;
    const healthCheckMinutes = parseInt(document.getElementById('healthCheckMinutes')?.value) || 0;
    const healthCheckSeconds = parseInt(document.getElementById('healthCheckSeconds')?.value) || 0;
    const rawInterval = hmsToMs(healthCheckHours, healthCheckMinutes, healthCheckSeconds);
    // 验证范围：最小 60000ms (60秒)，最大 172800000ms (48小时)
    const validatedInterval = Math.max(60000, Math.min(172800000, rawInterval));

    config.SCHEDULED_HEALTH_CHECK = {
        enabled: document.getElementById('scheduledHealthCheckEnabled')?.checked !== false,
        startupRun: document.getElementById('scheduledHealthCheckStartupRun')?.checked !== false,
        interval: validatedInterval,
        providerTypes: scheduledHealthCheckProviderTypes,
        customIntervals: JSON.parse(JSON.stringify(inMemoryCustomIntervals || {}))
    };

    try {
        await window.apiClient.post('/config', config);
        
        // 如果输入了新密码，单独保存密码
        if (adminPassword) {
            try {
                await window.apiClient.post('/admin-password', { password: adminPassword });
                // 清空密码输入框
                const adminPasswordEl = document.getElementById('adminPassword');
                if (adminPasswordEl) adminPasswordEl.value = '';
                showToast(t('common.success'), t('common.passwordUpdated'), 'success');
            } catch (pwdError) {
                console.error('Failed to save admin password:', pwdError);
                showToast(t('common.error'), t('common.error') + ': ' + pwdError.message, 'error');
            }
        }
        
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), t('common.configSaved'), 'success');
        
        // 检查当前是否在提供商池管理页面，如果是则刷新数据
        const providersSection = document.getElementById('providers');
        if (providersSection && providersSection.classList.contains('active')) {
            // 当前在提供商池页面，刷新数据
            await loadProviders();
            showToast(t('common.success'), t('common.providerPoolRefreshed'), 'success');
        }
    } catch (error) {
        console.error('Failed to save configuration:', error);
        showToast(t('common.error'), t('common.error') + ': ' + error.message, 'error');
    }
}

/**
 * 自动生成 API 密钥
 */
function generateApiKey() {
    const apiKeyEl = document.getElementById('apiKey');
    if (!apiKeyEl) return;
    
    // 生成 32 位 16 进制随机字符串
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const randomKey = 'sk-' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    
    apiKeyEl.value = randomKey;
    
    showToast(t('common.success'), t('config.apiKey.generated') || '已生成新的 API 密钥', 'success');
    
    // 触发输入框的 change 事件
    apiKeyEl.dispatchEvent(new Event('input', { bubbles: true }));
    apiKeyEl.dispatchEvent(new Event('change', { bubbles: true }));
}

// ==================== 自定义间隔相关变量 ====================

// 当前正在编辑自定义间隔的供应商
let currentEditingProviderType = null;

// 内存中的自定义间隔配置（用于编辑，保存时合并到 config）
let inMemoryCustomIntervals = {};

// ==================== 自定义间隔辅助函数 ====================

/**
 * 从配置中获取当前的自定义间隔对象
 * @returns {Object} 自定义间隔Map {providerType: ms}
 */
function getCustomIntervalsFromConfig() {
    return inMemoryCustomIntervals || {};
}

/**
 * 更新内存中的自定义间隔
 * @param {string} providerType - 供应商类型
 * @param {number|null} intervalMs - 间隔毫秒数，null表示删除
 */
function updateCustomIntervalInMemory(providerType, intervalMs) {
    if (intervalMs === null || intervalMs === undefined) {
        delete inMemoryCustomIntervals[providerType];
    } else {
        inMemoryCustomIntervals[providerType] = intervalMs;
    }
}

/**
 * 格式化间隔毫秒为可读字符串
 * @param {number} ms
 * @returns {string}
 */
function formatInterval(ms) {
    if (!ms || ms <= 0) return '-';
    const { hours, minutes, seconds } = msToHms(ms);
    const parts = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);
    if (seconds > 0) parts.push(`${seconds}秒`);
    return parts.length > 0 ? parts.join(' ') : '<1秒';
}

// ==================== 自定义间隔列表渲染 ====================

/**
 * 渲染自定义间隔列表
 */
function renderCustomIntervalsList() {
    const listEl = document.getElementById('customIntervalsList');
    const sectionEl = document.getElementById('customIntervalsSection');
    if (!listEl || !sectionEl) return;

    const customIntervals = getCustomIntervalsFromConfig();
    const keys = Object.keys(customIntervals).filter(k => customIntervals[k] > 0);

    if (keys.length === 0) {
        sectionEl.style.display = 'none';
        return;
    }

    sectionEl.style.display = 'block';

    // 获取供应商友好名称（从渲染好的 provider-tag 中查找）
    const providerTagMap = {};
    document.querySelectorAll('#scheduledHealthCheckProviders .provider-tag').forEach(tag => {
        const type = tag.getAttribute('data-value');
        const name = tag.querySelector('span')?.textContent || type;
        const icon = tag.querySelector('i')?.className || 'fas fa-server';
        providerTagMap[type] = { name, icon };
    });

    listEl.innerHTML = keys.map(providerType => {
        const interval = customIntervals[providerType];
        const info = providerTagMap[providerType] || { name: providerType, icon: 'fas fa-server' };
        const intervalStr = formatInterval(interval);
        const safeId = providerType.replace(/[^a-zA-Z0-9]/g, '_');

        return `
            <div class="custom-interval-item" data-provider-type="${providerType}">
                <div class="provider-info">
                    <i class="${info.icon}"></i>
                    <span class="provider-name">${info.name}</span>
                </div>
                <div class="interval-badge">${intervalStr}</div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.editCustomInterval('${providerType.replace(/'/g, "\\'")}')" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteCustomInterval('${providerType.replace(/'/g, "\\'")}')" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 供应商标签长按/右键处理 ====================

/**
 * 设置供应商标签的长按和右键事件
 */
function setupProviderLongPressHandlers() {
    const container = document.getElementById('scheduledHealthCheckProviders');
    if (!container) return;

    // 防止重复绑定
    if (container.dataset.longPressSetup) return;
    container.dataset.longPressSetup = 'true';

    container.querySelectorAll('.provider-tag').forEach(tag => {
        let pressTimer = null;

        // 右键菜单
        tag.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const providerType = tag.getAttribute('data-value');
            if (!tag.classList.contains('selected')) {
                showToast('请先选中该供应商', 'warning');
                return;
            }
            showCustomIntervalPopup(providerType);
        });

        // 长按（触摸设备）
        tag.addEventListener('touchstart', (e) => {
            tag.dataset.isLongPress = 'false';
            pressTimer = setTimeout(() => {
                tag.dataset.isLongPress = 'true';
                const providerType = tag.getAttribute('data-value');
                if (!tag.classList.contains('selected')) {
                    showToast('请先选中该供应商', 'warning');
                    return;
                }
                showCustomIntervalPopup(providerType);
                e.preventDefault();
            }, 500);
        }, { passive: false });

        tag.addEventListener('touchend', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });

        tag.addEventListener('touchmove', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
    });
}

// ==================== 弹出框操作 ====================

/**
 * 显示自定义间隔弹出框
 * @param {string} providerType - 供应商类型
 */
function showCustomIntervalPopup(providerType) {
    currentEditingProviderType = providerType;
    const popup = document.getElementById('customIntervalPopup');
    const nameSpan = document.getElementById('popupProviderName');

    // 获取供应商友好名称
    const tag = document.querySelector(`#scheduledHealthCheckProviders .provider-tag[data-value="${providerType}"]`);
    const providerName = tag?.querySelector('span')?.textContent || providerType;

    // 获取当前自定义间隔值
    const customIntervals = getCustomIntervalsFromConfig();
    const currentInterval = customIntervals[providerType] || 0;
    const { hours, minutes, seconds } = msToHms(currentInterval);

    document.getElementById('popupHours').value = hours;
    document.getElementById('popupMinutes').value = minutes;
    document.getElementById('popupSeconds').value = seconds;

    nameSpan.textContent = providerName;

    // 绑定快捷按钮事件（每次都重新绑定，防止覆盖）
    const quickBtns = popup.querySelectorAll('.quick-select-btns button');
    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const ms = parseInt(btn.getAttribute('data-ms'));
            const { hours: h, minutes: m, seconds: s } = msToHms(ms);
            document.getElementById('popupHours').value = h;
            document.getElementById('popupMinutes').value = m;
            document.getElementById('popupSeconds').value = s;
        });
    });

    popup.style.display = 'block';
}

/**
 * 保存自定义间隔
 */
function saveCustomInterval() {
    const hours = parseInt(document.getElementById('popupHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('popupMinutes')?.value) || 0;
    const seconds = parseInt(document.getElementById('popupSeconds')?.value) || 0;
    const ms = hmsToMs(hours, minutes, seconds);

    if (ms > 0 && ms < 1000) {
        showToast('间隔不能小于1秒', 'error');
        return;
    }

    updateCustomIntervalInMemory(currentEditingProviderType, ms > 0 ? ms : null);
    closeCustomIntervalPopup();
    renderCustomIntervalsList();
    showToast('自定义间隔已保存（需点击"保存配置"生效）', 'success');
}

/**
 * 关闭弹出框
 */
function closeCustomIntervalPopup() {
    const popup = document.getElementById('customIntervalPopup');
    if (popup) popup.style.display = 'none';
    currentEditingProviderType = null;
}

/**
 * 编辑自定义间隔（供列表项按钮调用）
 * @param {string} safeId - providerType 的安全ID
 */
function editCustomInterval(safeId) {
    // 从 custom-interval-item 找到真实的 providerType
    const item = document.querySelector(`.custom-interval-item[data-provider-type="${safeId}"]`);
    if (!item) return;
    const providerType = item.getAttribute('data-provider-type');
    showCustomIntervalPopup(providerType);
}

/**
 * 删除自定义间隔（供列表项按钮调用）
 * @param {string} safeId
 */
function deleteCustomInterval(safeId) {
    const item = document.querySelector(`.custom-interval-item[data-provider-type="${safeId}"]`);
    if (!item) return;
    const providerType = item.getAttribute('data-provider-type');

    if (!confirm(`确定删除 "${providerType}" 的自定义间隔吗？`)) return;

    updateCustomIntervalInMemory(providerType, null);
    renderCustomIntervalsList();
    showToast('已删除自定义间隔', 'success');
}

// ==================== 导出 ====================

export {
    loadConfiguration,
    saveConfiguration,
    updateConfigProviderConfigs,
    generateApiKey,
    closeCustomIntervalPopup,
    saveCustomInterval,
    editCustomInterval,
    deleteCustomInterval
};

// 挂载到 window 供 HTML onclick 调用
window.closeCustomIntervalPopup = closeCustomIntervalPopup;
window.saveCustomInterval = saveCustomInterval;
window.editCustomInterval = editCustomInterval;
window.deleteCustomInterval = deleteCustomInterval;
