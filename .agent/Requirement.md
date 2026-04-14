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

### 最近修复 (2026-04-15)
- ✅ Timer 泄漏修复 - 21处 setInterval 全部添加 .unref() (验证通过)
- ✅ 清理临时测试文件 (custom-logs/, new-dir/)
- ✅ 测试覆盖率分析 - 解释 common.js 低覆盖率原因
- ✅ 代码质量深度Review - 确认核心功能正常

---

## Review 发现 (pro vs main) - 2026-04-15 下午

### 高优先级问题

| 问题 | 文件 | 建议 | 状态 |
|------|------|------|------|
| common.js 覆盖率 20% | src/utils/common.js | 需提升至 60%+ | 🔴 进行中 |
| event-broadcast 覆盖率 4% | src/ui-modules/event-broadcast.js | 需提升 | 🔴 |

### 中优先级问题

| 问题 | 文件 | 建议 | 状态 |
|------|------|------|------|
| auth.js 覆盖率 0% | src/ui-modules/auth.js | 需提升至 50%+ | 🟡 |
| oauth-api.js 覆盖率 0% | src/ui-modules/oauth-api.js | 需提升 | 🟡 |
| provider-api.js 覆盖率 0% | src/ui-modules/provider-api.js | 需提升 | 🟡 |
| wsrelay manager 覆盖率 75% | src/wsrelay/manager.js | 需提升至 85%+ | 🟡 |

### 低优先级/已确认 ✅

| 项目 | 状态 |
|------|------|
| Kimi OAuth 设备流 | ✅ 实现正确 |
| escapeHtml XSS 防护 | ✅ 统一使用 |
| safeCompare 时序安全比较 | ✅ 正确实现 |
| LRU Cache TTL 3小时 | ✅ 与 Go 版本对齐 |
| Provider Pool 信号量模式 | ✅ 重构完成 |
| 配置快照恢复功能 | ✅ 已实现 |
| Timer 泄漏修复 | ✅ 21处 .unref() |

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
9. **Timer 泄漏修复** - 10处 setInterval 添加 .unref()

---

## 覆盖率目标追踪

| 模块 | 当前 | 目标 | 状态 |
|------|------|------|------|
| utils/common.js | 20.22% | 60%+ | 🔴 差距大 |
| utils/logger.js | 67.06% | 85%+ | 🟡 需努力 |
| wsrelay/manager.js | 75.72% | 85%+ | 🟡 需努力 |
| ui-modules/* | 4-73% | 60%+ | 🔴 需整体提升 |
| providers/kimi | 87.81% | 90%+ | 🟢 已达标 |

---

## 提交历史 (2026-04-15)

| 提交 | 说明 |
|------|------|
| b7f0f8f | fix(timer): 修复 gemini-core 和 qwen-core 中 setInterval 未调用 .unref() |
| 747e597 | docs: 更新 .agent 文档 - Timer 泄漏修复记录 |
| 3827fea | fix(timer): 修复多处 setInterval 未调用 .unref() 导致的 Timer 泄漏 |
| 4eb5da0 | docs: 更新测试覆盖率分析 - 解释 common.js 低覆盖率原因 |
| 00d2135 | docs: 更新 .agent 文档 (Requirement.md/Design.md/Task.md) |

---

## 已知问题

### 1. 测试 Worker 警告
**描述**: "A worker process has failed to exit gracefully"
**原因**: 可能是 setInterval 定时器未正确清理
**影响**: 不影响测试结果，仅是警告
**状态**: 🔴 需进一步调查

---

*最后更新: 2026-04-15 下午*
