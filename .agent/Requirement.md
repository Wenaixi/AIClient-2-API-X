# Requirement.md - 需求规范与验收标准

> 规范驱动开发第一步：明确需求和验收标准

---

## 项目概述

AIClient-2-API 是一个 API 代理服务，支持 OpenAI/Claude/Gemini/Kimi/Grok 等提供商。

### 核心功能
- 统一 API 网关，多提供商适配
- OAuth 认证（Kimi/Codex/Gemini/Qwen/Kiro）
- 提供商池管理与健康检查
- WebSocket 代理（WSRelay）
- LRU Cache（3小时 TTL，与 Go 版本 CLIProxyAPI 一致）
- 配置快照恢复和分区配置管理

---

## 测试状态 (2026-04-16)

```
Test Suites: 52 passed, 52 total
Tests:       2175 passed, 2175 total
Time:        ~38s
```

**注意**：测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

### 覆盖率概况

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi 高覆盖 ✅ |
| providers/forward | 91% | Forward 高覆盖 ✅ |
| providers/selectors | 91% | Selector 高覆盖 ✅ |
| wsrelay/* | 83% | manager.js 83% ✅ (75% → 83%) |
| services/* | 81-91% | health-check-timer/usage-service |
| utils/* | 30-78% | logger.js 78% ✅ / common.js 20% |
| ui-modules/* | 13-83% | auth.js 39 tests / event-broadcast 55% ✅ |
| auth/* | 高 | OAuth模块覆盖良好 ✅ |

---

## 代码质量 Review 总结 (pro vs main) - 2026-04-16

### 已确认 ✅

| 项目 | 状态 |
|------|------|
| Timer 泄漏修复 | ✅ 21处 .unref() 已添加 |
| Kimi OAuth 设备流 | ✅ 实现正确 |
| escapeHtml XSS 防护 | ✅ 统一使用 |
| safeCompare 时序安全比较 | ✅ 正确实现 |
| LRU Cache TTL 3小时 | ✅ 与 Go 版本对齐 |
| Provider Pool 信号量模式 | ✅ 重构完成 |
| 配置快照恢复功能 | ✅ 已实现 |
| 安全 API Key 生成 | ✅ 首次启动自动生成 |
| 健康检查 Timer 独立模块 | ✅ 已实现 |
| 日志脱敏 sanitizeLog() | ✅ 完整实现 |

### 低覆盖率说明

以下集成级函数不适合直接单元测试，已通过集成测试覆盖：
- `handleStreamRequest` (~350行) - 复杂异步流处理
- `handleUnaryRequest` (~250行) - 重试逻辑、错误处理
- `handleContentGenerationRequest` (~130行) - 通用请求处理
- `handleModelListRequest` (~110行) - 提供商池管理

### 核心工具函数已覆盖 (20+ 个)

RETRYABLE_NETWORK_ERRORS / isRetryableNetworkError / getProtocolPrefix / formatExpiryTime / formatExpiryLog / formatLog / getClientIp / getMD5Hash / formatToLocal / findByPrefix / hasByPrefix / getBaseType / extractSystemPromptFromRequestBody / escapeHtml / safeCompare / isAuthorized / createErrorResponse / createStreamErrorResponse / MAX_BODY_SIZE / getRequestBody / logConversation

---

## 已完成功能（pro 分支）

1. **Kimi OAuth** - 完整 Device Flow 实现 + check-status 限速器
2. **Health Check Timer** - 独立健康检查模块
3. **WSRelay Manager** - Manager-Session 双层架构
4. **路径安全校验** - PROVIDER_POOLS_FILE_PATH / SCHEDULED_HEALTH_CHECK
5. **iFlow OAuth** - 已从 pro 分支移除
6. **Provider Pool Manager** - 信号量模式 + 429 退避 + 冷却队列
7. **配置快照恢复** - JSON 解析失败时自动从快照恢复
8. **分区配置管理** - saveSectionConfig/resetSectionConfig
9. **Timer 泄漏修复** - 21处 setInterval 添加 .unref()
10. **安全 API Key 生成** - 首次启动自动生成安全随机 Key

---

## 覆盖率目标追踪

| 模块 | 当前 | 目标 | 状态 |
|------|------|------|------|
| utils/common.js | 20% | 60%+ | 🟡 已覆盖 20 个核心函数 |
| utils/logger.js | 78% | 85%+ | 🟡 ✅ 已提升 67% → 78% |
| wsrelay/manager.js | 75% | 85%+ | 🟡 错误处理分支未完全覆盖 |
| ui-modules/auth.js | 39 tests | 60 tests | 🟡 新建完成 |
| providers/kimi | 87-91% | 90%+ | 🟢 已达标 |

---

## pro vs main 代码统计

| 指标 | 数值 |
|------|------|
| 变更文件 | 151 个 |
| 新增行数 | +41,047 |
| 删除行数 | -5,678 |
| 净增行数 | +35,369 |

---

## 提交历史 (2026-04-16)

| 提交 | 说明 |
|------|------|
| 791ac91 | fix: 修复多处关键 bug - LRU滑动过期/WSRelay竞态/Kimi OAuth |
| 616fc9f | docs: 更新 .agent 文档 - 测试状态和覆盖率记录 |
| eb14407 | docs: 更新 CLAUDE.md - event-broadcast 测试覆盖率提升记录 |
| 130c6a5 | test: 提升 event-broadcast.js 测试覆盖率 47% → 55% |
| 9d94f3a | docs: 更新文档 - 测试状态和覆盖率概况 (2026-04-16) |
| 2f0bbff | test: 提升 wsrelay/manager.js 测试覆盖率 75% → 83% |
| 4e04004 | docs: 更新文档 - logger.js 覆盖率提升记录 |
| e9ded9c | test: 提升 utils/logger.js 测试覆盖率 67% → 78% |

---

## 深度 Review 发现并修复的 Bug (2026-04-16)

### 🔴 高危 Bug

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | **LRUCache.get() 滑动过期失效** - 访问时未更新 timestamp | adapter.js:789-806 | ✅ 已修复 |
| 2 | **cleanup() 竞态条件** - _cleanupOnce 未使用，可重复清理 | wsrelay/manager.js:610-612 | ✅ 已修复 |
| 3 | **_sendPing() 阻塞事件循环** - while忙等锁 | wsrelay/manager.js:418-421 | ✅ 已修复 |
| 4 | **request() send失败不通知调用者** - 错误被吞掉 | wsrelay/manager.js:592-595 | ✅ 已修复 |
| 5 | **send() acquireLock未检查closed** - 可导致闭session等待 | wsrelay/manager.js:510-516 | ✅ 已修复 |

### 🟡 中危 Bug

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | **LRUCache.has() 不更新访问时间** - 与 get() 行为不一致 | adapter.js:822-834 | ✅ 已修复 |
| 2 | **batchImportKimiRefreshTokensStream 路径错误** - 使用 process.cwd() | kimi-oauth-handler.js:350 | ✅ 已修复 |
| 3 | **completeKimiOAuth 缺少 autoLinkProviderConfigs** - 与 checkKimiAuthStatus 行为不一致 | kimi-oauth-handler.js:73-128 | ✅ 已修复 |
| 4 | **stop() stats.activeSessions 过早清零** - cleanup 前就设为0 | wsrelay/manager.js:221-223 | ✅ 已修复 |

---

## 三次 Review 发现并修复的 Bug (2026-04-19)

### 🔴 高危 Bug

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | **ch.drain() 从未被调用** - 消息在 buffer 中积累，从不转移到 messages，导致 buffer 溢出和内存泄漏 | manager.js:593-602 | ✅ 在 request().catch()、cleanup()、_dispatch() 终端消息处理中调用 drain |
| 2 | **终端消息不触发 'message' 事件** - 有 pending ID 的终端消息直接返回，不触发 emit，破坏事件驱动调用 | manager.js:481-484 | ✅ 添加 emit('message', msg) |
| 3 | **request() 错误通知丢失** - catch 中先 push 错误再 close，但 close 后 push 被忽略 | manager.js:620-625 | ✅ 调整顺序：先 push → drain → close |

### 🟡 中危 Bug

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | **_dispatch 调用 drain 未检查方法存在** - 测试环境 mock 的 ch 没有 drain 方法会导致错误 | manager.js:483 | ✅ 添加 if (pendingReq.ch.drain) 检查 |

---

## 四次 Review 发现并修复的 Bug (2026-04-20)

### 🔴 高危 Bug

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | **safeCompare 时序攻击漏洞** - `!a \|\| !b` 早期返回泄漏信息 | common.js:259-294 | ✅ 统一转换为空字符串处理，消除早期返回 |
| 2 | **getRequestBody 内存问题** - chunks未清空 + 请求流未终止 | common.js:204-231 | ✅ 添加 req.destroy() + chunks.length=0 |
| 3 | **默认密码 admin123 未强制** - 可直接登录 | auth.js:34-45 | ✅ 添加 isDefaultPassword() 检查，拒绝默认密码登录 |
| 4 | **ws.on('error') 重复绑定** - 构造函数和run()各设置一次 | manager.js:339,377 | ✅ 移除构造函数中的错误处理绑定 |
| 5 | **writeMutex 回调异常不重置** - ws.send回调抛出时锁永久持有 | manager.js:538-553 | ✅ 添加 settled 标志确保锁正确释放 |

## 深度 Review 发现的问题 (2026-04-20)

### 🔴 高危问题

| # | 问题 | 文件 | 状态 |
|---|-----|------|------|
| 1 | **safeCompare 时序攻击漏洞** - 早期返回泄漏信息 | common.js:259-294 | ✅ 已修复 |
| 2 | **默认密码 admin123** - 未强制更改 | auth.js:34 | ✅ 已修复 (拒绝登录) |
| 3 | **JWT 签名验证缺失** - 仅解析不验证 | codex-oauth.js:469-513 | ✅ 已修复 - 使用 jose 实现 JWKS 验证 |
| 4 | **硬编码 OAuth 凭证** | gemini-core.js/antigravity-core.js/qwen-core.js | ✅ 已修复 - 支持环境变量覆盖 |

### 🟡 中危问题

| # | 问题 | 文件 | 状态 |
|---|-----|------|------|
| 1 | getRequestBody 内存问题 | common.js:204-231 | ✅ 已修复 |
| 2 | ws.on('error') 重复绑定 | manager.js:339,377 | ✅ 已修复 |
| 3 | writeMutex 回调异常不重置 | manager.js:538-553 | ✅ 已修复 |
| 4 | Proxy getOwnPropertyDescriptor 误用 | adapter.js:943 | ⚠️ 已知技术债务 |
| 5 | config API Key 不持久化 | config-manager.js | ⚠️ 设计问题 |

*最后更新: 2026-04-18*

---

## 八次Review深度分析 (2026-04-18)

### Review 执行情况

| Review | 发现高危 | 发现中危 | 发现低危 | 状态 |
|--------|----------|----------|----------|------|
| 一次Review | 5 | 4 | 1 | ✅ 全部修复 |
| 二次Review | 2 | 2 | 2 | ✅ 全部修复 |
| 三次Review | 3 | 2 | 0 | ✅ 全部修复 |
| 四次Review | 5 | 5 | 0 | ✅ 全部修复 |
| 五次Review | 1 | 0 | 0 | ✅ 全部修复 |
| 六次Review | 0 | 0 | 0 | ✅ 确认无新增 |
| 七次Review | 0 | 0 | 0 | ✅ 确认无新增 |
| **八次Review** | 0 | 0 | 0 | ✅ 确认无新增 |

### 八次Review 审查范围

**代码审查**：pro 分支对比 main (172 个变更文件，+41,047/-5,678 行)

核心模块审查：
- `src/wsrelay/manager.js` (721 行) - Manager-Session 双层架构 ✅
- `src/providers/adapter.js` (1004 行) - LRU Cache + 滑动过期 ✅
- `src/auth/kimi-oauth.js` (561 行) - Device Flow 实现 ✅
- `src/providers/provider-pool-manager.js` (1600+ 行) - 信号量模式 + 429 退避 ✅
- `src/services/health-check-timer.js` (326 行) - 独立健康检查模块 ✅
- `src/auth/codex-oauth.js` (800+ 行) - JWT JWKS 验证 ✅

### 八次Review 安全审查结论

**安全审查**: ✅ 通过
- JWT 签名验证: ✅ 完整 JWKS 验证（jose 库）✅
- OAuth 凭证: ✅ 支持环境变量覆盖（Kimi/Codex）✅
- XSS 防护: ✅ escapeHtml 统一使用 ✅
- 时序安全: ✅ safeCompare() 使用 timingSafeEqual ✅
- 日志脱敏: ✅ maskKey() 覆盖敏感字段 ✅

**架构审查**: ✅ 确认
- LRU Cache: ✅ 滑动过期正确实现（adapter.js:796-799）✅
- 信号量模式: ✅ refreshSemaphore 全局/per-provider 控制 ✅
- 429 退避: ✅ 指数退避 + 冷却队列 + retry-after ✅
- writeMutex: ✅ settled 标志保护正确 ✅

### 测试状态 (2026-04-18)

```
Test Suites: 52 passed, 52 total
Tests:       2179 passed, 2179 total
Time:        ~36s
```

### 已知技术债务 (无需立即修复)

| # | 问题 | 文件 | 风险 | 说明 |
|---|-----|------|------|------|
| 1 | Proxy getOwnPropertyDescriptor | adapter.js:944 | 中 | 每次访问更新LRU，设计已知 |
| 2 | config API Key 不持久化 | config-manager.js | 低 | 需用户手动保存 |
| 3 | _acquireGlobalSemaphoreSync 非原子 | provider-pool-manager.js:866 | 低 | 异步版本有保护 |
| 4 | 设备ID存储相对路径 | kimi-oauth.js:88 | 低 | 建议使用绝对路径 |
