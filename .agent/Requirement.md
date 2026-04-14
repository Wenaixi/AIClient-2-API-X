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

## 测试状态 (2026-04-15 下午)

```
Test Suites: 51 passed, 51 total
Tests:       2032 passed, 2032 total
Time:        ~36s
```

**注意**：测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

### 覆盖率概况

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi 高覆盖 ✅ |
| providers/forward | 91% | Forward 高覆盖 ✅ |
| providers/selectors | 91% | Selector 高覆盖 ✅ |
| wsrelay/* | 75-76% | manager.js 75% |
| services/* | 81-91% | health-check-timer/usage-service |
| utils/* | 28-67% | common.js 20% / logger.js 67% |
| ui-modules/* | 13-73% | config-api 73% / event-broadcast 4% |
| auth/* | 高 | OAuth模块覆盖良好 ✅ |

---

## 代码质量 Review 总结 (pro vs main) - 2026-04-15 下午

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
| utils/logger.js | 67% | 85%+ | 🟡 中 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 中 |
| ui-modules/* | 4-73% | 60%+ | 🟡 需整体提升 |
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

## 提交历史 (2026-04-15)

| 提交 | 说明 |
|------|------|
| 0e14dbe | docs: 更新 .agent 文档 - Timer 泄漏验证完成 |
| 232448e | docs: 更新 Timer 泄漏修复统计 - 确认 21 处 .unref() 已全部添加 |
| b7f0f8f | fix(timer): 修复 gemini-core 和 qwen-core 中 setInterval 未调用 .unref() |
| 3827fea | fix(timer): 修复多处 setInterval 未调用 .unref() 导致的 Timer 泄漏 |
| 4eb5da0 | docs: 更新测试覆盖率分析 - 解释 common.js 低覆盖率原因 |

---

*最后更新: 2026-04-15 下午*
