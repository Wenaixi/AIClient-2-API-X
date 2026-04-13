// OAuth 处理器统一导出文件
// 此文件已按提供商拆分为多个独立文件，请从 index.js 导入

// 重新导出所有 OAuth 处理函数以保持向后兼容

// iFlow OAuth
export { handleIFlowOAuth } from './iflow-oauth.js';

// Codex OAuth
export {
    refreshCodexTokensWithRetry,
    handleCodexOAuth,
    handleCodexOAuthCallback,
    batchImportCodexTokensStream,
} from './codex-oauth.js';

// Gemini OAuth
export {
    handleGeminiCliOAuth,
    handleGeminiAntigravityOAuth,
    batchImportGeminiTokensStream,
    checkGeminiCredentialsDuplicate,
} from './gemini-oauth.js';

// Qwen OAuth
export { handleQwenOAuth } from './qwen-oauth.js';

// Kiro OAuth
export {
    handleKiroOAuth,
    checkKiroCredentialsDuplicate,
    batchImportKiroRefreshTokens,
    batchImportKiroRefreshTokensStream,
    importAwsCredentials,
} from './kiro-oauth.js';

// Kimi OAuth
export {
    handleKimiOAuth,
    completeKimiOAuth,
    checkKimiAuthStatus,
    batchImportKimiRefreshTokens,
    batchImportKimiRefreshTokensStream,
    checkKimiCredentialsDuplicate,
    refreshKimiTokens
} from './kimi-oauth-handler.js';
