import { t } from './i18n.js';
import { showToast } from './utils.js';
import { getAuthHeaders } from './auth.js';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示 Kimi OAuth 设备流认证对话框
 * @param {string} providerType - 提供商类型
 */
export function showKimiAuthMethodSelector(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-moon"></i> <span data-i18n="oauth.kimi.title">Kimi OAuth 设备流认证</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-method-options" style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="auth-method-btn" data-method="device-flow" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-mobile-alt" style="font-size: 24px; color: #8b5cf6;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kimi.deviceFlow">设备流认证</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kimi.deviceFlowDesc">使用设备码在浏览器中完成授权</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="batch-import" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-file-import" style="font-size: 24px; color: #10b981;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kimi.batchImport">批量导入 Refresh Tokens</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kimi.batchImportDesc">批量导入已有的 Kimi refresh tokens</div>
                        </div>
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 关闭按钮事件
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });

    // 认证方式选择按钮事件
    const methodBtns = modal.querySelectorAll('.auth-method-btn');
    methodBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = '#8b5cf6';
            btn.style.background = '#faf5ff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = '#e0e0e0';
            btn.style.background = 'white';
        });
        btn.addEventListener('click', async () => {
            const method = btn.dataset.method;
            modal.remove();

            if (method === 'batch-import') {
                showKimiBatchImportModal(providerType);
            } else {
                await executeGenerateAuthUrl(providerType, {});
            }
        });
    });
}

/**
 * 显示 Kimi 批量导入模态框
 * @param {string} providerType - 提供商类型
 */
export function showKimiBatchImportModal(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-file-import"></i> <span data-i18n="oauth.kimi.batchImport">批量导入 Kimi Tokens</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="batch-import-instructions" style="margin-bottom: 16px; padding: 12px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #6b21a8;">
                        <i class="fas fa-info-circle"></i>
                        <span data-i18n="oauth.kimi.importInstructions">请输入 Kimi refresh tokens，每行一个</span>
                    </p>
                </div>
                <div class="form-group">
                    <label for="batchKimiTokens" style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        <span data-i18n="oauth.kimi.tokensLabel">Refresh Tokens</span>
                    </label>
                    <textarea
                        id="batchKimiTokens"
                        rows="10"
                        style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; resize: vertical;"
                        placeholder="每行一个 refresh token&#10;eyJhbGciOi...&#10;eyJhbGciOi...&#10;eyJhbGciOi..."
                    ></textarea>
                </div>
                <div class="batch-import-stats" id="kimiBatchStats" style="display: none; margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span data-i18n="oauth.kimi.tokenCount">Token 数量</span>
                        <span id="kimiTokenCountValue" style="font-weight: 600;">0</span>
                    </div>
                </div>
                <div class="batch-import-progress" id="kimiBatchProgress" style="display: none; margin-top: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-spinner fa-spin" style="color: #8b5cf6;"></i>
                        <span data-i18n="oauth.kimi.importing">正在导入...</span>
                    </div>
                    <div class="progress-bar" style="margin-top: 8px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="kimiImportProgressBar" style="height: 100%; width: 0%; background: #8b5cf6; transition: width 0.3s;"></div>
                    </div>
                </div>
                <div class="batch-import-result" id="kimiBatchResult" style="display: none; margin-top: 16px; padding: 12px; border-radius: 8px;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary batch-import-submit" id="kimiBatchSubmit">
                    <i class="fas fa-upload"></i>
                    <span data-i18n="oauth.kimi.startImport">开始导入</span>
                </button>
                <button class="btn btn-secondary batch-import-cancel" id="kimiBatchCancel" style="display: none;">
                    <i class="fas fa-stop-circle"></i>
                    <span data-i18n="oauth.kimi.cancelImport">取消导入</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const textarea = modal.querySelector('#batchKimiTokens');
    const statsDiv = modal.querySelector('#kimiBatchStats');
    const tokenCountValue = modal.querySelector('#kimiTokenCountValue');
    const progressDiv = modal.querySelector('#kimiBatchProgress');
    const progressBar = modal.querySelector('#kimiImportProgressBar');
    const resultDiv = modal.querySelector('#kimiBatchResult');
    const submitBtn = modal.querySelector('#kimiBatchSubmit');
    const cancelBtn = modal.querySelector('#kimiBatchCancel');

    // AbortController for cancelling the import
    let abortController = null;

    // 监听输入变化
    textarea.addEventListener('input', () => {
        const tokens = textarea.value.trim().split('\n').filter(t => t.trim());
        if (tokens.length > 0) {
            statsDiv.style.display = 'block';
            tokenCountValue.textContent = tokens.length;
        } else {
            statsDiv.style.display = 'none';
        }
    });

    // 关闭按钮事件
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });

    // 提交按钮事件
    submitBtn.addEventListener('click', async () => {
        const tokens = textarea.value.trim().split('\n').filter(t => t.trim());

        if (tokens.length === 0) {
            showToast(t('common.error'), t('oauth.kimi.noTokens'), 'error');
            return;
        }

        // 禁用输入和按钮，显示取消按钮
        textarea.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-flex';
        progressDiv.style.display = 'block';
        resultDiv.style.display = 'none';

        // 创建 AbortController
        abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const response = await fetch('/api/kimi/batch-import-tokens', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ refreshTokens: tokens }),
                signal: signal
            });

            if (!response.ok) {
                throw new Error('Import failed');
            }

            // 处理 SSE 流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let successCount = 0;
            let failedCount = 0;
            let importComplete = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6).trim();
                        if (!jsonStr) continue;

                        let data;
                        try {
                            data = JSON.parse(jsonStr);
                        } catch (parseError) {
                            console.error('Failed to parse SSE data:', jsonStr);
                            continue;
                        }

                        if (data.index) {
                            const progress = (data.index / tokens.length) * 100;
                            progressBar.style.width = progress + '%';

                            if (data.success) {
                                successCount++;
                            } else {
                                failedCount++;
                            }
                        }

                        if (data.total !== undefined) {
                            // 完成
                            importComplete = true;
                            progressDiv.style.display = 'none';
                            resultDiv.style.display = 'block';
                            resultDiv.style.background = '#d1fae5';
                            resultDiv.style.border = '1px solid #6ee7b7';
                            resultDiv.innerHTML = `
                                <div style="color: #065f46;">
                                    <i class="fas fa-check-circle"></i>
                                    <strong>${t('oauth.kimi.importComplete')}</strong>
                                    <div style="margin-top: 8px; font-size: 14px;">
                                        ${t('oauth.kimi.success')}: ${data.successCount} | ${t('oauth.kimi.failed')}: ${data.failedCount}
                                    </div>
                                </div>
                            `;

                            setTimeout(() => {
                                modal.remove();
                                // 触发 oauth_success_event 事件通知 provider-manager 刷新
                                window.dispatchEvent(new CustomEvent('oauth_success_event', {
                                    detail: { provider: 'kimi-oauth', relativePath: '' }
                                }));
                            }, 2000);
                        }
                    }
                }
            }

            // 如果未完成（可能是被取消了）
            if (!importComplete) {
                throw new Error(t('oauth.kimi.importCancelled'));
            }
        } catch (error) {
            // 如果是取消操作，不显示错误
            if (error.name === 'AbortError') {
                resultDiv.style.display = 'block';
                resultDiv.style.background = '#fef3c7';
                resultDiv.style.border = '1px solid #fcd34d';
                resultDiv.innerHTML = `
                    <div style="color: #92400e;">
                        <i class="fas fa-info-circle"></i>
                        <strong>${t('oauth.kimi.importCancelled')}</strong>
                    </div>
                `;
            } else {
                progressDiv.style.display = 'none';
                resultDiv.style.display = 'block';
                resultDiv.style.background = '#fee2e2';
                resultDiv.style.border = '1px solid #fca5a5';
                const safeMessage = escapeHtml(error.message || 'Unknown error');
                resultDiv.innerHTML = `
                    <div style="color: #991b1b;">
                        <i class="fas fa-exclamation-circle"></i>
                        <strong>${t('oauth.kimi.importFailed')}</strong>
                        <div style="margin-top: 8px; font-size: 14px;">${safeMessage}</div>
                    </div>
                `;
            }
            textarea.disabled = false;
            submitBtn.disabled = false;
            submitBtn.style.display = 'inline-flex';
            cancelBtn.style.display = 'none';
        } finally {
            abortController = null;
        }
    });

    // 取消按钮事件
    cancelBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
        }
    });
}
