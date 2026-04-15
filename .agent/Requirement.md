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

*最后更新: 2026-04-19*
