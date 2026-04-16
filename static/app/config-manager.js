// 配置管理模块

import { showToast, formatUptime, copyToClipboard } from './utils.js';
import { handleProviderChange, handleGeminiCredsTypeChange, handleKiroCredsTypeChange } from './event-handlers.js';
import { loadProviders } from './provider-manager.js';
import { t } from './i18n.js';

// 提供商配置缓存
let currentProviderConfigs = null;

// 自定义间隔内存存储
let inMemoryCustomIntervals = {};
let inMemoryHealthyCustomIntervals = {};
let currentEditingProviderType = null;
let quickBtnsInitialized = false;

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
    
    // 如果是预加载模型提供商选择，添加置顶图标
    const isModelProviderSelect = container.id === 'modelProvider';
    
    container.innerHTML = visibleConfigs.map(c => `
        <button type="button" class="provider-tag" data-value="${escHtml(c.id)}">
            <i class="fas ${escHtml(c.icon || 'fa-server')}"></i>
            <span>${escHtml(c.name)}</span>
            ${isModelProviderSelect ? `<span class="tag-pin-icon" title="${t('config.pin') || '设为默认 (置顶)'}"><i class="fas fa-thumbtack"></i></span>` : ''}
        </button>
    `).join('');
    
    // 为新生成的标签添加点击事件
    const tags = container.querySelectorAll('.provider-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            // 如果点击的是置顶图标
            if (e.target.closest('.tag-pin-icon')) {
                e.preventDefault();
                e.stopPropagation();
                
                // 置顶逻辑：将其移动到容器最前面并设为选中
                tag.classList.add('selected');
                container.prepend(tag);
                
                // 更新视觉样式
                updatePinnedStatus(container);
                return;
            }

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
            
            // 如果取消选中了当前置顶的，重新计算置顶状态
            if (!tag.classList.contains('selected') && isModelProviderSelect) {
                updatePinnedStatus(container);
            }
        });
    });
}

/**
 * 更新置顶状态的视觉表现
 * @param {HTMLElement} container
 */
function updatePinnedStatus(container) {
    const tags = container.querySelectorAll('.provider-tag');
    tags.forEach((tag, index) => {
        // 第一个被选中的即为”置顶”的默认提供商
        const isFirstSelected = tag.classList.contains('selected') &&
            index === Array.from(tags).findIndex(t => t.classList.contains('selected'));

        if (isFirstSelected) {
            tag.classList.add('pinned');
        } else {
            tag.classList.remove('pinned');
        }
    });
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
                showToast(t('config.healthCheck.selectProviderFirst') || '请先选中该供应商', 'warning');
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
                    showToast(t('config.healthCheck.selectProviderFirst') || '请先选中该供应商', 'warning');
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

/**
 * 初始化快捷按钮事件
 */
function initQuickButtons() {
    if (quickBtnsInitialized) return;
    quickBtnsInitialized = true;

    const popup = document.getElementById('customIntervalPopup');
    if (!popup) return;

    popup.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-select-btns button');
        if (!btn) return;
        const ms = parseInt(btn.getAttribute('data-ms'));
        if (isNaN(ms)) return;

        // 判断是哪个section的快捷按钮
        const section = btn.closest('.popup-section');
        if (section) {
            // 检查是哪个section
            const labelText = section.querySelector('label')?.textContent || '';
            if (labelText.includes('异常')) {
                // 异常检查间隔
                const { hours: h, minutes: m, seconds: s } = msToHms(ms);
                document.getElementById('popupHours').value = h;
                document.getElementById('popupMinutes').value = m;
                document.getElementById('popupSeconds').value = s;
            } else if (labelText.includes('健康')) {
                // 健康检查间隔
                const { hours: h, minutes: m, seconds: s } = msToHms(ms);
                document.getElementById('popupHealthyHours').value = h;
                document.getElementById('popupHealthyMinutes').value = m;
                document.getElementById('popupHealthySeconds').value = s;
            }
        }
    });
}

/**
 * 初始化系统提示词替换规则 UI
 */
function initReplacementsUI() {
    const addBtn = document.getElementById('addReplacementBtn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => {
            addReplacementRow('', '');
        });
        addBtn.dataset.listenerAttached = 'true';
    }
}

/**
 * 添加一条替换规则行
 * @param {string} oldVal - 查找内容
 * @param {string} newVal - 替换内容
 */
function addReplacementRow(oldVal = '', newVal = '') {
    const container = document.getElementById('systemPromptReplacementsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'replacement-row';
    row.innerHTML = `
        <input type="text" class="form-control replacement-old" placeholder="${t('config.advanced.replacement.old')}" value="${oldVal}">
        <input type="text" class="form-control replacement-new" placeholder="${t('config.advanced.replacement.new')}" value="${newVal}">
        <button type="button" class="remove-replacement-btn" title="${t('config.advanced.replacement.remove')}">
            <i class="fas fa-trash-alt"></i>
        </button>
    `;

    // 绑定删除按钮事件
    const removeBtn = row.querySelector('.remove-replacement-btn');
    removeBtn.addEventListener('click', () => {
        row.remove();
    });

    container.appendChild(row);
}

/**
 * 加载配置
 */
async function loadConfiguration() {
    try {
        const data = await window.apiClient.get('/config');

        // 初始化替换规则 UI
        initReplacementsUI();
        const replacementsContainer = document.getElementById('systemPromptReplacementsContainer');
        if (replacementsContainer) {
            replacementsContainer.innerHTML = '';
            if (data.SYSTEM_PROMPT_REPLACEMENTS && Array.isArray(data.SYSTEM_PROMPT_REPLACEMENTS)) {
                data.SYSTEM_PROMPT_REPLACEMENTS.forEach(r => {
                    addReplacementRow(r.old || '', r.new || '');
                });
            }
        }

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
            
            const tags = Array.from(modelProviderEl.querySelectorAll('.provider-tag'));
            
            // 按照 providers 数组的顺序重新排列 DOM 中的标签
            providers.forEach(id => {
                const tag = tags.find(t => t.getAttribute('data-value') === id);
                if (tag) {
                    tag.classList.add('selected');
                    modelProviderEl.appendChild(tag); // 依次移到末尾实现重排
                }
            });
            
            // 处理未选中的标签
            tags.forEach(tag => {
                const value = tag.getAttribute('data-value');
                if (!providers.includes(value)) {
                    tag.classList.remove('selected');
                    modelProviderEl.appendChild(tag); // 移到最后
                }
            });
            
            // 如果没有任何选中的，默认选中第一个（保持兼容性）
            const anySelected = Array.from(modelProviderEl.querySelectorAll('.provider-tag.selected')).length > 0;
            if (!anySelected && tags.length > 0) {
                tags[0].classList.add('selected');
            }
            
            // 更新置顶视觉样式
            updatePinnedStatus(modelProviderEl);
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
        if (requestBaseDelayEl) requestBaseDelayEl.value = data.REQUEST_BASE_DELAY || 1000;
        
        // 坏凭证切换最大重试次数
        const credentialSwitchMaxRetriesEl = document.getElementById('credentialSwitchMaxRetries');
        if (credentialSwitchMaxRetriesEl) credentialSwitchMaxRetriesEl.value = data.CREDENTIAL_SWITCH_MAX_RETRIES || 5;
        
        if (cronNearMinutesEl) cronNearMinutesEl.value = data.CRON_NEAR_MINUTES || 1;
        if (cronRefreshTokenEl) cronRefreshTokenEl.checked = data.CRON_REFRESH_TOKEN || false;
        if (loginExpiryEl) loginExpiryEl.value = data.LOGIN_EXPIRY || 3600;
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
        const healthyCheckHoursEl = document.getElementById('healthyCheckHours');
        const healthyCheckMinutesEl = document.getElementById('healthyCheckMinutes');
        const healthyCheckSecondsEl = document.getElementById('healthyCheckSeconds');

        if (data.SCHEDULED_HEALTH_CHECK) {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = data.SCHEDULED_HEALTH_CHECK.enabled === true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = data.SCHEDULED_HEALTH_CHECK.startupRun !== false;
            // 将毫秒 interval 转换为 h/m/s 分量填充表单
            const hms = msToHms(data.SCHEDULED_HEALTH_CHECK.interval || 600000);
            if (healthCheckHoursEl) healthCheckHoursEl.value = hms.hours;
            if (healthCheckMinutesEl) healthCheckMinutesEl.value = hms.minutes;
            if (healthCheckSecondsEl) healthCheckSecondsEl.value = hms.seconds;
            // 加载健康检查间隔
            const healthyHms = msToHms(data.SCHEDULED_HEALTH_CHECK.healthyCheckInterval || 3600000);
            if (healthyCheckHoursEl) healthyCheckHoursEl.value = healthyHms.hours;
            if (healthyCheckMinutesEl) healthyCheckMinutesEl.value = healthyHms.minutes;
            if (healthyCheckSecondsEl) healthyCheckSecondsEl.value = healthyHms.seconds;
        } else {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = true;
            if (healthCheckHoursEl) healthCheckHoursEl.value = 0;
            if (healthCheckMinutesEl) healthCheckMinutesEl.value = 10;
            if (healthCheckSecondsEl) healthCheckSecondsEl.value = 0;
            if (healthyCheckHoursEl) healthyCheckHoursEl.value = 1;
            if (healthyCheckMinutesEl) healthyCheckMinutesEl.value = 0;
            if (healthyCheckSecondsEl) healthyCheckSecondsEl.value = 0;
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
        inMemoryHealthyCustomIntervals = JSON.parse(JSON.stringify(data.SCHEDULED_HEALTH_CHECK?.healthyCustomIntervals || {}));
        renderCustomIntervalsList();
        initQuickButtons();

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
                const hms = msToHms(ms);
                if (healthCheckHoursEl) healthCheckHoursEl.value = hms.hours;
                if (healthCheckMinutesEl) healthCheckMinutesEl.value = hms.minutes;
                if (healthCheckSecondsEl) healthCheckSecondsEl.value = hms.seconds;
            });
        });

        // 健康检查间隔快捷按钮（防止重复绑定）
        const healthyIntervalQuickBtns = document.querySelectorAll('#healthyCheckIntervalGroup .quick-select-btns button');
        healthyIntervalQuickBtns.forEach(btn => {
            if (btn.dataset.listenerAttached) return; // 防止重复绑定
            btn.dataset.listenerAttached = 'true';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const ms = parseInt(btn.getAttribute('data-ms'));
                const hms = msToHms(ms);
                if (healthyCheckHoursEl) healthyCheckHoursEl.value = hms.hours;
                if (healthyCheckMinutesEl) healthyCheckMinutesEl.value = hms.minutes;
                if (healthyCheckSecondsEl) healthyCheckSecondsEl.value = hms.seconds;
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
    
    // 收集系统提示词内容替换规则
    const replacements = [];
    const replacementRows = document.querySelectorAll('.replacement-row');
    replacementRows.forEach(row => {
        const oldVal = row.querySelector('.replacement-old')?.value || '';
        const newVal = row.querySelector('.replacement-new')?.value || '';
        if (oldVal) {
            replacements.push({ old: oldVal, new: newVal });
        }
    });
    config.SYSTEM_PROMPT_REPLACEMENTS = replacements;

    config.PROMPT_LOG_BASE_NAME = document.getElementById('promptLogBaseName')?.value || '';
    config.PROMPT_LOG_MODE = document.getElementById('promptLogMode')?.value || '';
    config.REQUEST_MAX_RETRIES = parseInt(document.getElementById('requestMaxRetries')?.value || 3);
    config.REQUEST_BASE_DELAY = parseInt(document.getElementById('requestBaseDelay')?.value || 1000);
    config.CREDENTIAL_SWITCH_MAX_RETRIES = parseInt(document.getElementById('credentialSwitchMaxRetries')?.value || 5);
    config.CRON_NEAR_MINUTES = parseInt(document.getElementById('cronNearMinutes')?.value || 1);
    config.CRON_REFRESH_TOKEN = document.getElementById('cronRefreshToken')?.checked || false;
    config.LOGIN_EXPIRY = parseInt(document.getElementById('loginExpiry')?.value || 3600);
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
    
    // 验证并规范化 interval 值（从时分秒输入框合并）
    const healthCheckHours = parseInt(document.getElementById('healthCheckHours')?.value) || 0;
    const healthCheckMinutes = parseInt(document.getElementById('healthCheckMinutes')?.value) || 0;
    const healthCheckSeconds = parseInt(document.getElementById('healthCheckSeconds')?.value) || 0;
    const rawInterval = (healthCheckHours * 3600 + healthCheckMinutes * 60 + healthCheckSeconds) * 1000;
    const validatedInterval = rawInterval > 0 ? Math.max(60000, Math.min(3600000, rawInterval)) : 600000;

    // 健康检查间隔
    const healthyHours = parseInt(document.getElementById('healthyCheckHours')?.value) || 0;
    const healthyMinutes = parseInt(document.getElementById('healthyCheckMinutes')?.value) || 0;
    const healthySeconds = parseInt(document.getElementById('healthyCheckSeconds')?.value) || 0;
    const healthyRawInterval = (healthyHours * 3600 + healthyMinutes * 60 + healthySeconds) * 1000;

    config.SCHEDULED_HEALTH_CHECK = {
        enabled: document.getElementById('scheduledHealthCheckEnabled')?.checked !== false,
        startupRun: document.getElementById('scheduledHealthCheckStartupRun')?.checked !== false,
        interval: validatedInterval,
        providerTypes: scheduledHealthCheckProviderTypes,
        healthyCheckInterval: healthyRawInterval > 0 ? healthyRawInterval : 0,
        customIntervals: JSON.parse(JSON.stringify(inMemoryCustomIntervals || {})),
        healthyCustomIntervals: JSON.parse(JSON.stringify(inMemoryHealthyCustomIntervals || {})),
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
    
    // 使用带回退机制的复制函数
    copyToClipboard(randomKey).then(success => {
        if (success) {
            showToast(t('common.success'), t('config.apiKey.generatedAndCopied') || '已生成并自动复制新的 API 密钥', 'success');
        } else {
            showToast(t('common.success'), t('config.apiKey.generated') || '已生成新的 API 密钥', 'success');
        }
    });
    
    // 触发输入框的 change 事件
    apiKeyEl.dispatchEvent(new Event('input', { bubbles: true }));
    apiKeyEl.dispatchEvent(new Event('change', { bubbles: true }));
}

// 分区保存配置
async function saveSectionConfig(section) {
    // 收集各区块的配置数据
    const sectionConfigs = {
        basic: () => ({
            REQUIRED_API_KEY: document.getElementById('apiKey')?.value || '',
            HOST: document.getElementById('host')?.value || '127.0.0.1',
            SERVER_PORT: parseInt(document.getElementById('port')?.value || 3000),
            MODEL_PROVIDER: (() => {
                const el = document.getElementById('modelProvider');
                if (!el) return 'gemini-cli-oauth';
                const selected = Array.from(el.querySelectorAll('.provider-tag.selected'))
                    .map(tag => tag.getAttribute('data-value'));
                return selected.length > 0 ? selected.join(',') : 'gemini-cli-oauth';
            })(),
            systemPrompt: document.getElementById('systemPrompt')?.value || '',
        }),
        proxy: () => ({
            PROXY_URL: document.getElementById('proxyUrl')?.value?.trim() || null,
            PROXY_ENABLED_PROVIDERS: (() => {
                const el = document.getElementById('proxyProviders');
                return el ? Array.from(el.querySelectorAll('.provider-tag.selected'))
                    .map(tag => tag.getAttribute('data-value')) : [];
            })(),
            TLS_SIDECAR_ENABLED: document.getElementById('tlsSidecarEnabled')?.checked || false,
            TLS_SIDECAR_PORT: parseInt(document.getElementById('tlsSidecarPort')?.value || 9090),
            TLS_SIDECAR_PROXY_URL: document.getElementById('tlsSidecarProxyUrl')?.value?.trim() || null,
            TLS_SIDECAR_ENABLED_PROVIDERS: (() => {
                const el = document.getElementById('tlsSidecarProviders');
                return el ? Array.from(el.querySelectorAll('.provider-tag.selected'))
                    .map(tag => tag.getAttribute('data-value')) : [];
            })(),
        }),
        governance: () => ({
            REQUEST_MAX_RETRIES: parseInt(document.getElementById('requestMaxRetries')?.value || 3),
            REQUEST_BASE_DELAY: (() => {
                const hours = parseInt(document.getElementById('requestBaseDelayHours')?.value) || 0;
                const minutes = parseInt(document.getElementById('requestBaseDelayMinutes')?.value) || 0;
                const seconds = parseInt(document.getElementById('requestBaseDelaySeconds')?.value) || 0;
                return (hours * 3600 + minutes * 60 + seconds) * 1000;
            })(),
            CREDENTIAL_SWITCH_MAX_RETRIES: parseInt(document.getElementById('credentialSwitchMaxRetries')?.value || 5),
            MAX_ERROR_COUNT: parseInt(document.getElementById('maxErrorCount')?.value || 10),
            WARMUP_TARGET: parseInt(document.getElementById('warmupTarget')?.value || 0),
            REFRESH_CONCURRENCY_PER_PROVIDER: parseInt(document.getElementById('refreshConcurrencyPerProvider')?.value || 1),
            providerFallbackChain: (() => {
                const val = document.getElementById('providerFallbackChain')?.value?.trim() || '';
                if (val) {
                    try { return JSON.parse(val); } catch { return {}; }
                }
                return {};
            })(),
            modelFallbackMapping: (() => {
                const val = document.getElementById('modelFallbackMapping')?.value?.trim() || '';
                if (val) {
                    try { return JSON.parse(val); } catch { return {}; }
                }
                return {};
            })(),
        }),
        oauth: () => ({
            CRON_NEAR_MINUTES: parseInt(document.getElementById('cronNearMinutes')?.value || 1),
            CRON_REFRESH_TOKEN: document.getElementById('cronRefreshToken')?.checked || false,
            LOGIN_EXPIRY: (() => {
                const hours = parseInt(document.getElementById('loginExpiryHours')?.value) || 0;
                const minutes = parseInt(document.getElementById('loginExpiryMinutes')?.value) || 0;
                const seconds = parseInt(document.getElementById('loginExpirySeconds')?.value) || 0;
                return hours * 3600 + minutes * 60 + seconds;
            })(),
        }),
        healthcheck: () => {
            const healthCheckHours = parseInt(document.getElementById('healthCheckHours')?.value) || 0;
            const healthCheckMinutes = parseInt(document.getElementById('healthCheckMinutes')?.value) || 0;
            const healthCheckSeconds = parseInt(document.getElementById('healthCheckSeconds')?.value) || 0;
            const rawInterval = (healthCheckHours * 3600 + healthCheckMinutes * 60 + healthCheckSeconds) * 1000;
            const validatedInterval = rawInterval > 0 ? Math.max(60000, Math.min(3600000, rawInterval)) : 300000;

            const healthyHours = parseInt(document.getElementById('healthyCheckHours')?.value) || 0;
            const healthyMinutes = parseInt(document.getElementById('healthyCheckMinutes')?.value) || 0;
            const healthySeconds = parseInt(document.getElementById('healthyCheckSeconds')?.value) || 0;
            const healthyRawInterval = (healthyHours * 3600 + healthyMinutes * 60 + healthySeconds) * 1000;

            return {
                SCHEDULED_HEALTH_CHECK: {
                    enabled: document.getElementById('scheduledHealthCheckEnabled')?.checked !== false,
                    startupRun: document.getElementById('scheduledHealthCheckStartupRun')?.checked !== false,
                    interval: validatedInterval,
                    providerTypes: (() => {
                        const el = document.getElementById('scheduledHealthCheckProviders');
                        return el ? Array.from(el.querySelectorAll('.provider-tag.selected'))
                            .map(tag => tag.getAttribute('data-value')) : [];
                    })(),
                    healthyCheckInterval: healthyRawInterval > 0 ? healthyRawInterval : 0,
                    customIntervals: JSON.parse(JSON.stringify(inMemoryCustomIntervals || {})),
                    healthyCustomIntervals: JSON.parse(JSON.stringify(inMemoryHealthyCustomIntervals || {})),
                }
            };
        },
        log: () => ({
            LOG_ENABLED: document.getElementById('logEnabled')?.checked !== false,
            LOG_OUTPUT_MODE: document.getElementById('logOutputMode')?.value || 'all',
            LOG_LEVEL: document.getElementById('logLevel')?.value || 'info',
            LOG_DIR: document.getElementById('logDir')?.value || 'logs',
            LOG_INCLUDE_REQUEST_ID: document.getElementById('logIncludeRequestId')?.checked !== false,
            LOG_INCLUDE_TIMESTAMP: document.getElementById('logIncludeTimestamp')?.checked !== false,
            LOG_MAX_FILE_SIZE: parseInt(document.getElementById('logMaxFileSize')?.value || 10485760),
            LOG_MAX_FILES: parseInt(document.getElementById('logMaxFiles')?.value || 10),
        }),
        advanced: () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: document.getElementById('systemPromptFilePath')?.value || 'configs/input_system_prompt.txt',
                SYSTEM_PROMPT_MODE: document.getElementById('systemPromptMode')?.value || 'append',
                PROMPT_LOG_BASE_NAME: document.getElementById('promptLogBaseName')?.value || '',
                PROMPT_LOG_MODE: document.getElementById('promptLogMode')?.value || '',
                REQUEST_MAX_RETRIES: parseInt(document.getElementById('requestMaxRetries')?.value || 3),
                REQUEST_BASE_DELAY: parseInt(document.getElementById('requestBaseDelay')?.value || 1000),
                CREDENTIAL_SWITCH_MAX_RETRIES: parseInt(document.getElementById('credentialSwitchMaxRetries')?.value || 5),
                CRON_NEAR_MINUTES: parseInt(document.getElementById('cronNearMinutes')?.value || 1),
                CRON_REFRESH_TOKEN: document.getElementById('cronRefreshToken')?.checked || false,
                LOGIN_EXPIRY: parseInt(document.getElementById('loginExpiry')?.value || 3600),
                PROVIDER_POOLS_FILE_PATH: document.getElementById('providerPoolsFilePath')?.value || '',
                MAX_ERROR_COUNT: parseInt(document.getElementById('maxErrorCount')?.value || 10),
                WARMUP_TARGET: parseInt(document.getElementById('warmupTarget')?.value || 0),
                REFRESH_CONCURRENCY_PER_PROVIDER: parseInt(document.getElementById('refreshConcurrencyPerProvider')?.value || 1),
                TLS_SIDECAR_ENABLED: document.getElementById('tlsSidecarEnabled')?.checked || false,
                TLS_SIDECAR_PORT: parseInt(document.getElementById('tlsSidecarPort')?.value || 9090),
                TLS_SIDECAR_PROXY_URL: document.getElementById('tlsSidecarProxyUrl')?.value?.trim() || null,
                TLS_SIDECAR_ENABLED_PROVIDERS: (() => {
                    const el = document.getElementById('tlsSidecarProviders');
                    return el ? Array.from(el.querySelectorAll('.provider-tag.selected'))
                        .map(tag => tag.getAttribute('data-value')) : [];
                })(),
            };

            // Fallback 链配置
            const fallbackChainValue = document.getElementById('providerFallbackChain')?.value?.trim() || '';
            if (fallbackChainValue) {
                try {
                    config.providerFallbackChain = JSON.parse(fallbackChainValue);
                } catch (e) {
                    showToast(t('common.error'), t('config.advanced.fallbackChainInvalid') || 'Fallback 链配置格式无效', 'error');
                    return null;
                }
            } else {
                config.providerFallbackChain = {};
            }

            // Model Fallback 映射配置
            const modelFallbackMappingValue = document.getElementById('modelFallbackMapping')?.value?.trim() || '';
            if (modelFallbackMappingValue) {
                try {
                    config.modelFallbackMapping = JSON.parse(modelFallbackMappingValue);
                } catch (e) {
                    showToast(t('common.error'), t('config.advanced.modelFallbackMappingInvalid') || 'Model Fallback 映射配置格式无效', 'error');
                    return null;
                }
            } else {
                config.modelFallbackMapping = {};
            }

            return config;
        }
    };

    const collector = sectionConfigs[section];
    if (!collector) {
        showToast(t('common.error'), `未知分区: ${section}`, 'error');
        return;
    }

    const configData = collector();
    if (configData === null) return; // 验证失败

    try {
        await window.apiClient.post('/config', configData);
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), `${section} 配置已保存`, 'success');
    } catch (error) {
        console.error(`Failed to save ${section} configuration:`, error);
        showToast(t('common.error'), `保存失败: ${error.message}`, 'error');
    }
}

// 分区重置配置
async function resetSectionConfig(section) {
    try {
        const data = await window.apiClient.get('/config');
        const sectionResetters = {
            basic: () => {
                const el = document.getElementById('modelProvider');
                if (el) {
                    const providers = Array.isArray(data.DEFAULT_MODEL_PROVIDERS)
                        ? data.DEFAULT_MODEL_PROVIDERS
                        : (typeof data.MODEL_PROVIDER === 'string' ? data.MODEL_PROVIDER.split(',') : []);
                    const tags = Array.from(el.querySelectorAll('.provider-tag'));
                    tags.forEach(tag => {
                        const value = tag.getAttribute('data-value');
                        if (providers.includes(value)) {
                            tag.classList.add('selected');
                        } else {
                            tag.classList.remove('selected');
                        }
                    });
                }
                document.getElementById('apiKey').value = data.REQUIRED_API_KEY || '';
                document.getElementById('host').value = data.HOST || '127.0.0.1';
                document.getElementById('port').value = data.SERVER_PORT || 3000;
                document.getElementById('systemPrompt').value = data.systemPrompt || '';
            },
            proxy: () => {
                document.getElementById('proxyUrl').value = data.PROXY_URL || '';
                const el = document.getElementById('proxyProviders');
                if (el) {
                    const enabled = data.PROXY_ENABLED_PROVIDERS || [];
                    el.querySelectorAll('.provider-tag').forEach(tag => {
                        tag.classList.toggle('selected', enabled.includes(tag.getAttribute('data-value')));
                    });
                }
                document.getElementById('tlsSidecarEnabled').checked = data.TLS_SIDECAR_ENABLED || false;
                document.getElementById('tlsSidecarPort').value = data.TLS_SIDECAR_PORT || 9090;
                document.getElementById('tlsSidecarProxyUrl').value = data.TLS_SIDECAR_PROXY_URL || '';
                const tlsEl = document.getElementById('tlsSidecarProviders');
                if (tlsEl) {
                    const enabled = data.TLS_SIDECAR_ENABLED_PROVIDERS || [];
                    tlsEl.querySelectorAll('.provider-tag').forEach(tag => {
                        tag.classList.toggle('selected', enabled.includes(tag.getAttribute('data-value')));
                    });
                }
            },
            governance: () => {
                document.getElementById('requestMaxRetries').value = data.REQUEST_MAX_RETRIES || 3;
                const baseDelay = data.REQUEST_BASE_DELAY || 1000;
                const baseDelaySeconds = Math.round(baseDelay / 1000);
                document.getElementById('requestBaseDelayHours').value = Math.floor(baseDelaySeconds / 3600);
                document.getElementById('requestBaseDelayMinutes').value = Math.floor((baseDelaySeconds % 3600) / 60);
                document.getElementById('requestBaseDelaySeconds').value = baseDelaySeconds % 60;
                document.getElementById('credentialSwitchMaxRetries').value = data.CREDENTIAL_SWITCH_MAX_RETRIES || 5;
                document.getElementById('maxErrorCount').value = data.MAX_ERROR_COUNT || 10;
                document.getElementById('warmupTarget').value = data.WARMUP_TARGET || 0;
                document.getElementById('refreshConcurrencyPerProvider').value = data.REFRESH_CONCURRENCY_PER_PROVIDER || 1;
                document.getElementById('providerFallbackChain').value = data.providerFallbackChain ? JSON.stringify(data.providerFallbackChain, null, 2) : '';
                document.getElementById('modelFallbackMapping').value = data.modelFallbackMapping ? JSON.stringify(data.modelFallbackMapping, null, 2) : '';
            },
            oauth: () => {
                document.getElementById('cronNearMinutes').value = data.CRON_NEAR_MINUTES || 1;
                document.getElementById('cronRefreshToken').checked = data.CRON_REFRESH_TOKEN || false;
                const loginExpiry = data.LOGIN_EXPIRY || 3600;
                document.getElementById('loginExpiryHours').value = Math.floor(loginExpiry / 3600);
                document.getElementById('loginExpiryMinutes').value = Math.floor((loginExpiry % 3600) / 60);
                document.getElementById('loginExpirySeconds').value = loginExpiry % 60;
            },
            healthcheck: () => {
                const interval = data.SCHEDULED_HEALTH_CHECK?.interval || 300000;
                const totalSeconds = Math.round(interval / 1000);
                document.getElementById('healthCheckHours').value = Math.floor(totalSeconds / 3600);
                document.getElementById('healthCheckMinutes').value = Math.floor((totalSeconds % 3600) / 60);
                document.getElementById('healthCheckSeconds').value = totalSeconds % 60;
                document.getElementById('scheduledHealthCheckEnabled').checked = data.SCHEDULED_HEALTH_CHECK?.enabled !== false;
                document.getElementById('scheduledHealthCheckStartupRun').checked = data.SCHEDULED_HEALTH_CHECK?.startupRun !== false;
                const el = document.getElementById('scheduledHealthCheckProviders');
                if (el) {
                    const enabled = data.SCHEDULED_HEALTH_CHECK?.providerTypes || [];
                    el.querySelectorAll('.provider-tag').forEach(tag => {
                        tag.classList.toggle('selected', enabled.includes(tag.getAttribute('data-value')));
                    });
                }
                // 健康检查间隔
                const healthyInterval = data.SCHEDULED_HEALTH_CHECK?.healthyCheckInterval || 0;
                const healthyTotalSeconds = Math.round(healthyInterval / 1000);
                document.getElementById('healthyCheckHours').value = Math.floor(healthyTotalSeconds / 3600);
                document.getElementById('healthyCheckMinutes').value = Math.floor((healthyTotalSeconds % 3600) / 60);
                document.getElementById('healthyCheckSeconds').value = healthyTotalSeconds % 60;
                // 自定义间隔
                inMemoryCustomIntervals = JSON.parse(JSON.stringify(data.SCHEDULED_HEALTH_CHECK?.customIntervals || {}));
                inMemoryHealthyCustomIntervals = JSON.parse(JSON.stringify(data.SCHEDULED_HEALTH_CHECK?.healthyCustomIntervals || {}));
                renderCustomIntervalsList();
            },
            log: () => {
                document.getElementById('logEnabled').checked = data.LOG_ENABLED !== false;
                document.getElementById('logOutputMode').value = data.LOG_OUTPUT_MODE || 'all';
                document.getElementById('logLevel').value = data.LOG_LEVEL || 'info';
                document.getElementById('logDir').value = data.LOG_DIR || 'logs';
                document.getElementById('logIncludeRequestId').checked = data.LOG_INCLUDE_REQUEST_ID !== false;
                document.getElementById('logIncludeTimestamp').checked = data.LOG_INCLUDE_TIMESTAMP !== false;
                document.getElementById('logMaxFileSize').value = data.LOG_MAX_FILE_SIZE || 10485760;
                document.getElementById('logMaxFiles').value = data.LOG_MAX_FILES || 10;
            },
            advanced: () => {
                document.getElementById('systemPromptFilePath').value = data.SYSTEM_PROMPT_FILE_PATH || 'configs/input_system_prompt.txt';
                document.getElementById('systemPromptMode').value = data.SYSTEM_PROMPT_MODE || 'append';
                document.getElementById('promptLogBaseName').value = data.PROMPT_LOG_BASE_NAME || '';
                document.getElementById('promptLogMode').value = data.PROMPT_LOG_MODE || '';
                document.getElementById('requestMaxRetries').value = data.REQUEST_MAX_RETRIES || 3;
                const baseDelay = data.REQUEST_BASE_DELAY || 1000;
                const baseDelaySeconds = Math.round(baseDelay / 1000);
                document.getElementById('requestBaseDelayHours').value = Math.floor(baseDelaySeconds / 3600);
                document.getElementById('requestBaseDelayMinutes').value = Math.floor((baseDelaySeconds % 3600) / 60);
                document.getElementById('requestBaseDelaySeconds').value = baseDelaySeconds % 60;
                document.getElementById('credentialSwitchMaxRetries').value = data.CREDENTIAL_SWITCH_MAX_RETRIES || 5;
                document.getElementById('cronNearMinutes').value = data.CRON_NEAR_MINUTES || 1;
                document.getElementById('cronRefreshToken').checked = data.CRON_REFRESH_TOKEN || false;
                const loginExpiry = data.LOGIN_EXPIRY || 3600;
                document.getElementById('loginExpiryHours').value = Math.floor(loginExpiry / 3600);
                document.getElementById('loginExpiryMinutes').value = Math.floor((loginExpiry % 3600) / 60);
                document.getElementById('loginExpirySeconds').value = loginExpiry % 3600 % 60;
                document.getElementById('providerPoolsFilePath').value = data.PROVIDER_POOLS_FILE_PATH || '';
                document.getElementById('maxErrorCount').value = data.MAX_ERROR_COUNT || 10;
                document.getElementById('warmupTarget').value = data.WARMUP_TARGET || 0;
                document.getElementById('refreshConcurrencyPerProvider').value = data.REFRESH_CONCURRENCY_PER_PROVIDER || 1;
                document.getElementById('tlsSidecarEnabled').checked = data.TLS_SIDECAR_ENABLED || false;
                document.getElementById('tlsSidecarPort').value = data.TLS_SIDECAR_PORT || 9090;
                document.getElementById('tlsSidecarProxyUrl').value = data.TLS_SIDECAR_PROXY_URL || '';
                const tlsEl = document.getElementById('tlsSidecarProviders');
                if (tlsEl) {
                    const enabled = data.TLS_SIDECAR_ENABLED_PROVIDERS || [];
                    tlsEl.querySelectorAll('.provider-tag').forEach(tag => {
                        tag.classList.toggle('selected', enabled.includes(tag.getAttribute('data-value')));
                    });
                }
                document.getElementById('providerFallbackChain').value = data.providerFallbackChain ? JSON.stringify(data.providerFallbackChain, null, 2) : '';
                document.getElementById('modelFallbackMapping').value = data.modelFallbackMapping ? JSON.stringify(data.modelFallbackMapping, null, 2) : '';
            }
        };

        const resetter = sectionResetters[section];
        if (!resetter) {
            showToast(t('common.error'), `未知分区: ${section}`, 'error');
            return;
        }
        resetter();
        showToast(t('common.success'), `${section} 配置已重置`, 'success');
    } catch (error) {
        console.error(`Failed to reset ${section} configuration:`, error);
        showToast(t('common.error'), `重置失败: ${error.message}`, 'error');
    }
}

export {
    loadConfiguration,
    saveConfiguration,
    updateConfigProviderConfigs,
    generateApiKey,
    saveSectionConfig,
    resetSectionConfig
};

/**
 * 格式化间隔毫秒为可读字符串
 * @param {number} ms
 * @returns {string}
 */
function formatInterval(ms) {
    if (!ms || ms <= 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);
    if (seconds > 0) parts.push(`${seconds}秒`);
    return parts.length > 0 ? parts.join(' ') : '<1秒';
}

// ==================== 自定义间隔列表渲染 ====================

/**
 * 渲染自定义间隔列表（同时显示异常间隔和健康间隔）
 */
function renderCustomIntervalsList() {
    const listEl = document.getElementById('customIntervalsList');
    const sectionEl = document.getElementById('customIntervalsSection');
    if (!listEl || !sectionEl) return;

    const customIntervals = inMemoryCustomIntervals || {};
    const healthyCustomIntervals = inMemoryHealthyCustomIntervals || {};

    // 合并两个配置的所有 providerType
    const allKeys = new Set([
        ...Object.keys(customIntervals).filter(k => customIntervals[k] > 0),
        ...Object.keys(healthyCustomIntervals)
    ]);

    if (allKeys.size === 0) {
        sectionEl.classList.add('hidden');
        return;
    }

    sectionEl.classList.remove('hidden');

    // 获取供应商友好名称（从渲染好的 provider-tag 中查找）
    const providerTagMap = {};
    document.querySelectorAll('#scheduledHealthCheckProviders .provider-tag').forEach(tag => {
        const type = tag.getAttribute('data-value');
        const name = tag.querySelector('span')?.textContent || type;
        const icon = tag.querySelector('i')?.className || 'fas fa-server';
        providerTagMap[type] = { name, icon };
    });

    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    listEl.innerHTML = Array.from(allKeys).map(providerType => {
        const interval = customIntervals[providerType] || 0;
        const healthyInterval = healthyCustomIntervals[providerType] || 0;
        const info = providerTagMap[providerType] || { name: providerType, icon: 'fas fa-server' };
        const intervalStr = formatInterval(interval);
        const healthyIntervalStr = healthyInterval === 0 ? '不检查' : formatInterval(healthyInterval);

        return `
            <div class="custom-interval-item" data-provider-type="${escHtml(providerType)}">
                <div class="provider-info">
                    <i class="${escHtml(info.icon)}"></i>
                    <span class="provider-name">${escHtml(info.name)}</span>
                </div>
                <div class="interval-badges">
                    <span class="interval-badge unhealthy" title="异常状态检查间隔">异常: ${intervalStr}</span>
                    <span class="interval-badge healthy" title="健康状态检查间隔">健康: ${healthyIntervalStr}</span>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-outline-primary edit-interval-btn" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-interval-btn" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // 使用事件委托绑定编辑/删除按钮
    listEl.querySelectorAll('.edit-interval-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.custom-interval-item');
            if (!item) return;
            const providerType = item.getAttribute('data-provider-type');
            showCustomIntervalPopup(providerType);
        });
    });
    listEl.querySelectorAll('.delete-interval-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.custom-interval-item');
            if (!item) return;
            const providerType = item.getAttribute('data-provider-type');
            deleteCustomIntervalConfirm(providerType);
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
    const overlay = document.getElementById('customIntervalOverlay');
    const nameSpan = document.getElementById('popupProviderName');

    // 获取供应商友好名称
    const tag = document.querySelector(`#scheduledHealthCheckProviders .provider-tag[data-value="${providerType}"]`);
    const providerName = tag?.querySelector('span')?.textContent || providerType;

    // 获取当前异常状态自定义间隔值
    const customIntervals = inMemoryCustomIntervals || {};
    const healthyCustomIntervals = inMemoryHealthyCustomIntervals || {};

    const currentInterval = customIntervals[providerType] || 0;
    const { hours, minutes, seconds } = msToHms(currentInterval);

    const currentHealthyInterval = healthyCustomIntervals[providerType] || 0;
    const healthyHms = msToHms(currentHealthyInterval);

    document.getElementById('popupHours').value = hours;
    document.getElementById('popupMinutes').value = minutes;
    document.getElementById('popupSeconds').value = seconds;
    document.getElementById('popupHealthyHours').value = healthyHms.hours;
    document.getElementById('popupHealthyMinutes').value = healthyHms.minutes;
    document.getElementById('popupHealthySeconds').value = healthyHms.seconds;

    nameSpan.textContent = providerName;

    popup.classList.remove('hidden');
    overlay.classList.add('show');
}

/**
 * ms 转时分秒
 */
function msToHms(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    return {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60
    };
}

/**
 * 时分秒转 ms
 */
function hmsToMs(hours, minutes, seconds) {
    return ((hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0)) * 1000;
}

/**
 * 删除自定义间隔确认
 * @param {string} providerType
 */
function deleteCustomIntervalConfirm(providerType) {
    if (!confirm(t('config.healthCheck.confirmDelete') || `确定要删除 ${providerType} 的自定义间隔吗？`)) return;

    delete inMemoryCustomIntervals[providerType];
    delete inMemoryHealthyCustomIntervals[providerType];
    renderCustomIntervalsList();
    showToast('已删除自定义间隔', 'success');
}

/**
 * 关闭弹窗
 */
function closeCustomIntervalPopup() {
    const popup = document.getElementById('customIntervalPopup');
    const overlay = document.getElementById('customIntervalOverlay');
    if (popup) popup.classList.add('hidden');
    if (overlay) overlay.classList.remove('show');
    currentEditingProviderType = null;
}

/**
 * 保存弹窗中的自定义间隔
 */
function saveCustomInterval() {
    if (!currentEditingProviderType) return;

    const hours = parseInt(document.getElementById('popupHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('popupMinutes')?.value) || 0;
    const seconds = parseInt(document.getElementById('popupSeconds')?.value) || 0;
    const interval = hmsToMs(hours, minutes, seconds);

    const healthyHours = parseInt(document.getElementById('popupHealthyHours')?.value) || 0;
    const healthyMinutes = parseInt(document.getElementById('popupHealthyMinutes')?.value) || 0;
    const healthySeconds = parseInt(document.getElementById('popupHealthySeconds')?.value) || 0;
    const healthyInterval = hmsToMs(healthyHours, healthyMinutes, healthySeconds);

    if (interval > 0) {
        inMemoryCustomIntervals[currentEditingProviderType] = interval;
    } else {
        delete inMemoryCustomIntervals[currentEditingProviderType];
    }

    if (healthyInterval > 0) {
        inMemoryHealthyCustomIntervals[currentEditingProviderType] = healthyInterval;
    } else {
        delete inMemoryHealthyCustomIntervals[currentEditingProviderType];
    }

    renderCustomIntervalsList();
    closeCustomIntervalPopup();
    showToast(`已保存 ${currentEditingProviderType} 的自定义间隔`, 'success');
}

// 导出给 window 使用
window.renderCustomIntervals = renderCustomIntervalsList;
window.renderCustomIntervalsSimple = function(customIntervals) {
    inMemoryCustomIntervals = { ...(inMemoryCustomIntervals || {}), ...customIntervals };
    renderCustomIntervalsList();
};
window.saveCustomInterval = saveCustomInterval;
window.closeCustomIntervalPopup = closeCustomIntervalPopup;
