# Task.md - 任务追踪

> 规范驱动开发第三步：分解任务并跟踪进度

---

## 当前任务

### 🔴 高优先级
- [ ] utils/common.js 覆盖率 20% → 60%+
- [ ] utils/logger.js 覆盖率 67% → 85%+

### 🟡 中优先级
- [ ] wsrelay/manager.js 覆盖率 75% → 85%+
- [ ] ui-modules/* 整体覆盖率提升

### 🟢 低优先级
- [x] 清理临时测试文件 (custom-logs/, test-logs/, new-dir/) ✅ 2026-04-15

---

## 测试覆盖率状态 (2026-04-15 下午)

### 实际覆盖率分析

| 模块 | 当前 | 目标 | 状态 | 说明 |
|------|------|------|------|------|
| utils/common.js | 20% | 60% | 🟡 合理 | 工具函数已覆盖，集成函数不适合单元测试 |
| utils/logger.js | 67% | 85%+ | 🟡 需努力 | formatMessage/cleanOldLogs 等边界条件待覆盖 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 需努力 | Session 错误处理/边界条件待覆盖 |
| ui-modules/* | 13-73% | 60%+ | 🟡 需整体提升 | 部分模块覆盖率为0 |

### 已覆盖的 common.js 函数 (通过单元测试)
✅ RETRYABLE_NETWORK_ERRORS / isRetryableNetworkError / getProtocolPrefix
✅ formatExpiryTime / formatLog / formatExpiryLog
✅ getClientIp / getMD5Hash / formatToLocal
✅ findByPrefix / hasByPrefix / getBaseType
✅ extractSystemPromptFromRequestBody / escapeHtml / safeCompare / isAuthorized

### 未覆盖的函数（合理原因）
| 函数 | 行数 | 原因 |
|------|------|------|
| handleStreamRequest | ~350 | 集成级流处理，需 mock 外部服务 |
| handleUnaryRequest | ~250 | 集成级请求处理，含重试逻辑 |
| handleContentGenerationRequest | ~130 | 通用处理，内部调用上述函数 |
| handleModelListRequest | ~110 | 提供商池管理调用 |

**结论**：2032 测试全部通过，项目状态良好。覆盖率低的函数均为集成级，不适合纯单元测试。

**总测试数**: 2032 passed ✅

---

## 详细任务

### 1. utils/common.js 覆盖率提升
**文件**: `src/utils/common.js`
**当前覆盖**: 20%
**目标覆盖**: 60%+
**状态**: 进行中 - 测试文件已重构与源码逻辑对齐 ✅
**待覆盖函数**:
- escapeHtml / findByPrefix / hasByPrefix / getDeviceIdAsync / hashString
- getRequestBody / safeCompare / isAuthorized / handleUnifiedResponse
- handleStreamRequest / handleUnaryRequest / getProtocolPrefix

### 2. utils/logger.js 覆盖率提升
**文件**: `src/utils/logger.js`
**当前覆盖**: 67%
**目标覆盖**: 85%+
**待覆盖函数**:
- formatMessage / getLogStream / LogRotate / sanitizeLog 边界情况
- clearTodayLog / cleanOldLogs

### 3. wsrelay/manager.js 覆盖率提升
**文件**: `src/wsrelay/manager.js`
**当前覆盖**: 75%
**目标覆盖**: 85%+
**待覆盖**: Session 错误处理 / 边界条件

### 4. ui-modules 覆盖率整体提升
**文件**: `src/ui-modules/*`
**问题**: auth.js(0%) / oauth-api.js(0%) / provider-api.js(0%) 等覆盖率为 0

---

## pro vs main 差异分析摘要

### 新增文件（pro 独占）
- `src/auth/kimi-oauth.js` - Kimi OAuth 核心
- `src/auth/kimi-oauth-handler.js` - Kimi OAuth 处理器
- `src/providers/kimi/*` - Kimi Provider 全套
- `src/wsrelay/manager.js` - WSRelay Manager

### 移除文件（pro 已删除）
- `src/auth/iflow-oauth.js` - iFlow OAuth
- `src/providers/openai/iflow-core.js` - iFlow Provider
- `configs/provider_pools.json.example` - iFlow 配置示例

### 重大重构
- `src/providers/provider-pool-manager.js` - 信号量 + 退避 + 冷却
- `src/providers/adapter.js` - LRU Cache TTL 3小时
- `src/utils/common.js` - safeCompare / escapeHtml / MAX_BODY_SIZE

---

## 最近提交 (2026-04-15)

| 提交 | 说明 |
|------|------|
| 88fac03 | docs: 更新 CLAUDE.md 测试状态 (2032 测试通过) |
| 03ff308 | fix(tests): 修复 common.test.js 测试用例与源码逻辑对齐 |
| f943d74 | refactor(tests): 重构 common.test.js 与源码逻辑完全对齐 |

---

*最后更新: 2026-04-15 上午*