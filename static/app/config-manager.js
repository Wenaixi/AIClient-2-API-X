// 配置管理模块

import { showToast, formatUptime } from './utils.js';
import { handleProviderChange, handleGeminiCredsTypeChange, handleKiroCredsTypeChange } from './event-handlers.js';
import { loadProviders } from './provider-manager.js';
import { t } from './i18n.js';

// 提供商配置缓存
let currentProviderConfigs = null;

/**
 * 将毫秒转换为时:分:秒
 * @param {number} ms - 毫秒
 * @returns {{hours: number, minutes: number, seconds: number}}
 */
function msToHms(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
}

/**
 * 将时:分:秒转换为毫秒
 * @param {number} hours - 小时
 * @param {number} minutes - 分钟
 * @param {number} seconds - 秒
 * @returns {number} 毫秒
 */
function hmsToMs(hours, minutes, seconds) {
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
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

    // 初始化自定义间隔添加功能
    initCustomIntervalManager();

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

            // 如果是在定时健康检查的 provider-tags 容器中，重新渲染 provider 列表
            if (container.id === 'scheduledHealthCheckProviders') {
                window.apiClient.get('/config').then(data => {
                    renderCustomIntervalsTable(data);
        populateCustomIntervalProviderSelect(data);
                });
            }
        });
    });
}

/**
 * 渲染已添加的自定义间隔列表
 * @param {Object} data - 配置数据
 */


/**
 * 格式化间隔显示文本
 */
function formatIntervalDisplay(hms) {
    let parts = [];
    if (hms.hours > 0) parts.push(hms.hours + '时');
    if (hms.minutes > 0) parts.push(hms.minutes + '分');
    if (hms.seconds > 0 || parts.length === 0) parts.push(hms.seconds + '秒');
    return parts.join('');
}

// 当前编辑的 provider
let editingProvider = null;

/**
 * 渲染自定义间隔表格
 * @param {Object} data - 配置数据
 */
function renderCustomIntervalsTable(data) {
    const tbody = document.getElementById('customIntervalsTableBody');
    const table = document.getElementById('customIntervalsTable');
    const noDataMsg = document.getElementById('noCustomIntervalsMsg');

    if (!tbody || !table || !noDataMsg) {
        console.log('renderCustomIntervalsTable: missing elements', { tbody, table, noDataMsg });
        return;
    }

    const overrides = data.SCHEDULED_HEALTH_CHECK?.overrides || {};
    const providerTypes = Object.keys(overrides);

    console.log('renderCustomIntervalsTable:', { overrides, providerTypes });

    // 获取 provider 名称映射（从 providerConfigs 全局变量或页面标签）
    const providerNames = {};
    if (typeof currentProviderConfigs !== 'undefined' && currentProviderConfigs) {
        currentProviderConfigs.forEach(c => {
            providerNames[c.id] = c.name;
        });
    }
    // 备选：从页面标签获取
    document.querySelectorAll('#scheduledHealthCheckProviders .provider-tag').forEach(tag => {
        const value = tag.getAttribute('data-value');
        const name = tag.querySelector('span')?.textContent || value;
        if (!providerNames[value]) {
            providerNames[value] = name;
        }
    });

    console.log('renderCustomIntervalsTable: providerTypes count =', providerTypes.length);

    if (providerTypes.length === 0) {
        console.log('renderCustomIntervalsTable: no data, hiding table');
        table.style.display = 'none';
        noDataMsg.style.display = 'block';
        tbody.innerHTML = '';
        return;
    }

    console.log('renderCustomIntervalsTable: showing table with', providerTypes.length, 'rows');
    table.style.display = 'table';
    noDataMsg.style.display = 'none';

    tbody.innerHTML = providerTypes.map(providerType => {
        const overrideMs = overrides[providerType];
        const hms = msToHms(overrideMs);
        const name = providerNames[providerType] || providerType;

        return `
            <tr data-provider="${providerType}">
                <td>${name}</td>
                <td>${formatIntervalDisplay(hms)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-interval-btn" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-interval-btn" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 初始化自定义间隔管理功能
 */
function initCustomIntervalManager() {
    const saveBtn = document.getElementById('saveCustomIntervalBtn');
    const cancelBtn = document.getElementById('cancelEditIntervalBtn');
    const tbody = document.getElementById('customIntervalsTableBody');

    // 保存按钮
    saveBtn?.addEventListener('click', async () => {
        const providerSelect = document.getElementById('customIntervalProvider');
        const hoursEl = document.getElementById('customIntervalHours');
        const minutesEl = document.getElementById('customIntervalMinutes');
        const secondsEl = document.getElementById('customIntervalSeconds');

        const providerType = providerSelect?.value;

        // 编辑模式下可以不选供应商
        if (!editingProvider && !providerType) {
            showToast(t('common.error'), t('config.healthCheck.selectProviderFirst'));
            return;
        }

        const h = parseInt(hoursEl?.value) || 0;
        const m = parseInt(minutesEl?.value) || 0;
        const s = parseInt(secondsEl?.value) || 0;
        const ms = hmsToMs(h, m, s);

        if (ms < 1000) {
            showToast(t('common.error'), t('config.healthCheck.intervalTooShort'));
            return;
        }

        try {
            const config = await window.apiClient.get('/config');

            if (!config.SCHEDULED_HEALTH_CHECK) {
                config.SCHEDULED_HEALTH_CHECK = {};
            }
            if (!config.SCHEDULED_HEALTH_CHECK.overrides) {
                config.SCHEDULED_HEALTH_CHECK.overrides = {};
            }

            const targetProvider = editingProvider || providerType;
            config.SCHEDULED_HEALTH_CHECK.overrides[targetProvider] = ms;

            await window.apiClient.post('/config', config);
            showToast(t('common.success'), editingProvider ? t('config.healthCheck.intervalUpdated') : t('config.healthCheck.intervalAdded'));

            // 重置表单
            resetCustomIntervalForm();

            // 刷新表格和下拉选项
            const data = await window.apiClient.get('/config');
            console.log('Saved config, received data:', JSON.stringify(data.SCHEDULED_HEALTH_CHECK, null, 2));
            renderCustomIntervalsTable(data);
            populateCustomIntervalProviderSelect(data);

        } catch (error) {
            console.error('Failed to save custom interval:', error);
            showToast(t('common.error'), error.message);
        }
    });

    // 取消按钮
    cancelBtn?.addEventListener('click', () => {
        resetCustomIntervalForm();
    });

    // 表格操作按钮（事件代理）
    tbody?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-interval-btn');
        const deleteBtn = e.target.closest('.delete-interval-btn');

        if (!editBtn && !deleteBtn) return;

        const row = (editBtn || deleteBtn).closest('tr');
        const providerType = row?.getAttribute('data-provider');
        if (!providerType) return;

        if (editBtn) {
            // 进入编辑模式
            enterEditMode(providerType);
        } else if (deleteBtn) {
            // 删除
            if (!confirm(t('config.healthCheck.confirmDelete'))) return;

            try {
                const config = await window.apiClient.get('/config');
                if (config.SCHEDULED_HEALTH_CHECK?.overrides) {
                    delete config.SCHEDULED_HEALTH_CHECK.overrides[providerType];
                }
                await window.apiClient.post('/config', config);
                showToast(t('common.success'), t('config.healthCheck.intervalRemoved'));

                const data = await window.apiClient.get('/config');
                renderCustomIntervalsTable(data);
                populateCustomIntervalProviderSelect(data);

                // 如果正在编辑这个 provider，重置表单
                if (editingProvider === providerType) {
                    resetCustomIntervalForm();
                }
            } catch (error) {
                console.error('Failed to delete custom interval:', error);
                showToast(t('common.error'), error.message);
            }
        }
    });
}

/**
 * 填充供应商下拉选项
 */
function populateCustomIntervalProviderSelect(data) {
    const selectEl = document.getElementById('customIntervalProvider');
    if (!selectEl) return;

    const overrides = data.SCHEDULED_HEALTH_CHECK?.overrides || {};
    const addedProviders = Object.keys(overrides);

    // 获取已选中的 provider（只在定时检查中选择的）
    const providerNames = {};
    const selectedProviders = data.SCHEDULED_HEALTH_CHECK?.providerTypes || [];

    // 从 provider tags 获取名称映射
    document.querySelectorAll('#scheduledHealthCheckProviders .provider-tag').forEach(tag => {
        const value = tag.getAttribute('data-value');
        const name = tag.querySelector('span')?.textContent || value;
        providerNames[value] = name;
    });

    // 保留 placeholder
    const placeholder = selectEl.querySelector('option[value=""]');
    selectEl.innerHTML = '';
    if (placeholder) {
        selectEl.appendChild(placeholder);
    } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- 请选择 --';
        selectEl.appendChild(opt);
    }

    // 只添加已选中且未添加自定义间隔的 provider 选项
    selectedProviders.forEach(value => {
        if (!addedProviders.includes(value) && providerNames[value]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = providerNames[value];
            selectEl.appendChild(opt);
        }
    });
}

/**
 * 进入编辑模式
 */
async function enterEditMode(providerType) {
    editingProvider = providerType;

    const providerSelect = document.getElementById('customIntervalProvider');
    const hoursEl = document.getElementById('customIntervalHours');
    const minutesEl = document.getElementById('customIntervalMinutes');
    const secondsEl = document.getElementById('customIntervalSeconds');
    const cancelBtn = document.getElementById('cancelEditIntervalBtn');
    const saveBtn = document.getElementById('saveCustomIntervalBtn');

    // 获取当前配置
    const data = await window.apiClient.get('/config');
    const overrides = data.SCHEDULED_HEALTH_CHECK?.overrides || {};
    const overrideMs = overrides[providerType];

    if (!overrideMs) return;

    const hms = msToHms(overrideMs);

    // 获取 provider 名称
    const providerNames = {};
    document.querySelectorAll('#scheduledHealthCheckProviders .provider-tag').forEach(tag => {
        const value = tag.getAttribute('data-value');
        const name = tag.querySelector('span')?.textContent || value;
        providerNames[value] = name;
    });

    // 禁用供应商选择，显示当前编辑的 provider
    providerSelect.disabled = true;
    providerSelect.innerHTML = `<option value="${providerType}">${providerNames[providerType] || providerType}</option>`;
    providerSelect.value = providerType;

    // 设置时间值
    hoursEl.value = hms.hours;
    minutesEl.value = hms.minutes;
    secondsEl.value = hms.seconds;

    // 显示取消按钮，修改保存按钮文本
    cancelBtn.style.display = 'inline-block';
    saveBtn.innerHTML = '<i class="fas fa-save"></i> ' + t('common.update');

    // 滚动到表单
    document.getElementById('customIntervalForm')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * 重置表单
 */
function resetCustomIntervalForm() {
    editingProvider = null;

    const providerSelect = document.getElementById('customIntervalProvider');
    const hoursEl = document.getElementById('customIntervalHours');
    const minutesEl = document.getElementById('customIntervalMinutes');
    const secondsEl = document.getElementById('customIntervalSeconds');
    const cancelBtn = document.getElementById('cancelEditIntervalBtn');
    const saveBtn = document.getElementById('saveCustomIntervalBtn');

    providerSelect.disabled = false;
    hoursEl.value = '0';
    minutesEl.value = '10';
    secondsEl.value = '0';
    cancelBtn.style.display = 'none';
    saveBtn.innerHTML = '<i class="fas fa-save"></i> ' + t('common.save');

    // 重新填充下拉选项
    window.apiClient.get('/config').then(data => {
        populateCustomIntervalProviderSelect(data);
    });
}


/**
 * 初始化自定义间隔添加功能
 */

/**
 * 填充添加间隔的下拉选项
 */


/**
 * 更新添加间隔的下拉选项（排除已添加的）
 */


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
        const scheduledHealthCheckHoursEl = document.getElementById('scheduledHealthCheckHours');
        const scheduledHealthCheckMinutesEl = document.getElementById('scheduledHealthCheckMinutes');
        const scheduledHealthCheckSecondsEl = document.getElementById('scheduledHealthCheckSeconds');

        if (data.SCHEDULED_HEALTH_CHECK) {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = data.SCHEDULED_HEALTH_CHECK.enabled === true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = data.SCHEDULED_HEALTH_CHECK.startupRun !== false;
            // 将毫秒转换为时:分:秒
            const hms = msToHms(data.SCHEDULED_HEALTH_CHECK.interval || 600000);
            if (scheduledHealthCheckHoursEl) scheduledHealthCheckHoursEl.value = hms.hours;
            if (scheduledHealthCheckMinutesEl) scheduledHealthCheckMinutesEl.value = hms.minutes;
            if (scheduledHealthCheckSecondsEl) scheduledHealthCheckSecondsEl.value = hms.seconds;
        } else {
            if (scheduledHealthCheckEnabledEl) scheduledHealthCheckEnabledEl.checked = true;
            if (scheduledHealthCheckStartupRunEl) scheduledHealthCheckStartupRunEl.checked = true;
            if (scheduledHealthCheckHoursEl) scheduledHealthCheckHoursEl.value = 0;
            if (scheduledHealthCheckMinutesEl) scheduledHealthCheckMinutesEl.value = 10;
            if (scheduledHealthCheckSecondsEl) scheduledHealthCheckSecondsEl.value = 0;
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

        // 渲染 per-provider 间隔标签列表
        renderCustomIntervalsTable(data);
        populateCustomIntervalProviderSelect(data);

        // 定时健康检查间隔快捷按钮（防止重复绑定）
        const intervalQuickBtns = document.querySelectorAll('.time-input-group + .quick-select-btns button');
        intervalQuickBtns.forEach(btn => {
            if (btn.dataset.listenerAttached) return; // 防止重复绑定
            btn.dataset.listenerAttached = 'true';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const hours = parseInt(btn.getAttribute('data-hours')) || 0;
                const minutes = parseInt(btn.getAttribute('data-minutes')) || 0;
                const seconds = parseInt(btn.getAttribute('data-seconds')) || 0;
                if (scheduledHealthCheckHoursEl) scheduledHealthCheckHoursEl.value = hours;
                if (scheduledHealthCheckMinutesEl) scheduledHealthCheckMinutesEl.value = minutes;
                if (scheduledHealthCheckSecondsEl) scheduledHealthCheckSecondsEl.value = seconds;
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

    // 将时:分:秒转换为毫秒并验证范围（最小1秒，最大24小时）
    const hours = parseInt(document.getElementById('scheduledHealthCheckHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('scheduledHealthCheckMinutes')?.value) || 0;
    const seconds = parseInt(document.getElementById('scheduledHealthCheckSeconds')?.value) || 0;
    const rawMs = hmsToMs(hours, minutes, seconds);
    const validatedInterval = Math.max(1000, Math.min(86400000, rawMs));

    // 收集 per-provider interval overrides
    const overrides = {};
    const intervalListEl = document.getElementById('scheduledHealthCheckIntervalList');
    if (intervalListEl) {
        intervalListEl.querySelectorAll('.provider-interval-item').forEach(item => {
            const providerType = item.getAttribute('data-provider');
            const hoursEl = item.querySelector('.interval-hours');
            const minutesEl = item.querySelector('.interval-minutes');
            const secondsEl = item.querySelector('.interval-seconds');

            // 检查输入是否有有效值（>= 1000ms）
            const h = parseInt(hoursEl?.value) || 0;
            const m = parseInt(minutesEl?.value) || 0;
            const s = parseInt(secondsEl?.value) || 0;
            const ms = hmsToMs(h, m, s);
            if (ms >= 1000) {
                overrides[providerType] = ms;
            }
        });
    }

    config.SCHEDULED_HEALTH_CHECK = {
        enabled: document.getElementById('scheduledHealthCheckEnabled')?.checked !== false,
        startupRun: document.getElementById('scheduledHealthCheckStartupRun')?.checked !== false,
        interval: validatedInterval,
        providerTypes: scheduledHealthCheckProviderTypes,
        overrides: Object.keys(overrides).length > 0 ? overrides : {}
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

export {
    loadConfiguration,
    saveConfiguration,
    updateConfigProviderConfigs,
    generateApiKey
};
