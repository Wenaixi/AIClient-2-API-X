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

---

## 测试状态 (2026-04-15)

```
Test Suites: 51 passed, 51 total
Tests:       2003 passed, 2003 total
Time:        ~48s (with coverage)
```

---

## Review 发现 (pro vs main)

### 高优先级问题

| 问题 | 文件 | 建议 |
|------|------|------|
| common.js 覆盖率 20% | src/utils/common.js | 需提升至 60%+ |
| logger.js 覆盖率 67% | src/utils/logger.js | 需提升至 85%+ |
| ui-modules/* 部分模块覆盖低 | src/ui-modules/* | 需整体提升 |

### 中优先级问题

| 问题 | 文件 | 建议 |
|------|------|------|
| wsrelay manager 覆盖率 75% | src/wsrelay/manager.js | 需提升至 85%+ |
| config-api 覆盖率 73% | src/ui-modules/config-api.js | 边缘覆盖不足 |

### 低优先级/已确认

| 项目 | 状态 |
|------|------|
| Kimi OAuth 设备流 | ✅ 实现正确 |
| escapeHtml XSS 防护 | ✅ 统一使用 |
| safeCompare 时序安全比较 | ✅ 正确实现 |
| LRU Cache TTL 3小时 | ✅ 与 Go 版本对齐 |
| Provider Pool 信号量模式 | ✅ 重构完成 |

---

## 已完成功能（pro 分支）

1. **Kimi OAuth** - 完整 Device Flow 实现 + check-status 限速器
2. **Health Check Timer** - 独立健康检查模块
3. **WSRelay Manager** - Manager-Session 双层架构
4. **路径安全校验** - PROVIDER_POOLS_FILE_PATH / SCHEDULED_HEALTH_CHECK
5. **iFlow OAuth** - 已从 pro 分支移除
6. **Provider Pool Manager** - 信号量模式 + 429 退避 + 冷却队列

---

## 覆盖率目标追踪

| 模块 | 当前 | 目标 | 状态 |
|------|------|------|------|
| utils/common.js | 20% | 60%+ | 🔴 差距大 |
| utils/logger.js | 67% | 85%+ | 🟡 需努力 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 需努力 |
| ui-modules/* | 13-73% | 60%+ | 🟡 需整体提升 |

---

*最后更新: 2026-04-15 晨间*
