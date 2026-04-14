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

## 测试状态 (2026-04-15 上午)

```
Test Suites: 51 passed, 51 total
Tests:       2032 passed, 2032 total
Time:        ~37s
```

### 最近修复 (2026-04-15)
- ✅ common.test.js 测试用例重构，与源码逻辑完全对齐
- ✅ 修复 getClientIp 测试 - 空对象访问 headers 导致报错
- ✅ 修复 findByPrefix/hasByPrefix 前缀匹配测试
- ✅ 清理临时测试文件 (custom-logs/, new-dir/)

---

## Review 发现 (pro vs main)

### 高优先级问题

| 问题 | 文件 | 建议 | 状态 |
|------|------|------|------|
| common.js 覆盖率 20% | src/utils/common.js | 需提升至 60%+ | 🔴 |
| logger.js 覆盖率 67% | src/utils/logger.js | 需提升至 85%+ | 🟡 |

### 中优先级问题

| 问题 | 文件 | 建议 | 状态 |
|------|------|------|------|
| wsrelay manager 覆盖率 75% | src/wsrelay/manager.js | 需提升至 85%+ | 🟡 |
| config-api 覆盖率 73% | src/ui-modules/config-api.js | 边缘覆盖不足 | 🟡 |
| ui-modules/* 部分模块覆盖低 | src/ui-modules/* | 需整体提升 | 🟡 |

### 低优先级/已确认 ✅

| 项目 | 状态 |
|------|------|
| Kimi OAuth 设备流 | ✅ 实现正确 |
| escapeHtml XSS 防护 | ✅ 统一使用 |
| safeCompare 时序安全比较 | ✅ 正确实现 |
| LRU Cache TTL 3小时 | ✅ 与 Go 版本对齐 |
| Provider Pool 信号量模式 | ✅ 重构完成 |
| 配置快照恢复功能 | ✅ 已实现 |

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

---

## 覆盖率目标追踪

| 模块 | 当前 | 目标 | 状态 |
|------|------|------|------|
| utils/common.js | 20% | 60%+ | 🔴 差距大 |
| utils/logger.js | 67% | 85%+ | 🟡 需努力 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 需努力 |
| ui-modules/* | 13-73% | 60%+ | 🟡 需整体提升 |

---

## 提交历史 (2026-04-15)

| 提交 | 说明 |
|------|------|
| 4aad3fb | docs: 更新 Task.md - 添加测试完成记录和临时文件清理状态 |
| 88fac03 | docs: 更新 CLAUDE.md 测试状态 (2032 测试通过) |
| 03ff308 | fix(tests): 修复 common.test.js 测试用例与源码逻辑对齐 |
| f943d74 | refactor(tests): 重构 common.test.js 与源码逻辑完全对齐 |

---

*最后更新: 2026-04-15 上午*