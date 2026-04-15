# CLAUDE.md - AIClient-2-API 开发规范

@>.agent/Requirement.md
@>.agent/Design.md
@>.agent/Task.md

---

## 项目身份

| 属性 | 值 |
|------|-----|
| 项目名称 | AIClient-2-API |
| 项目路径 | `E:\newCC\stick\AlClient-2-APIAlClient-2-API\AIClient-2-API` |
| 上游仓库 | https://github.com/justlovemaki/AIClient-2-API |
| Fork仓库 | https://github.com/Wenaixi/AIClient-2-API-X |
| 当前分支 | `pro` |
| 最后更新 | 2026-04-15 晚 |

---

## Git 分支策略

```
upstream/main → origin/main → 纯净上游代码
      ↓
origin/pro → 深度定制分支（所有开发在此分支进行）
```

---

## 核心命令

```bash
npm run start        # 启动服务
npm run start:dev   # 开发模式
npm test            # 运行全部测试
npm run test:coverage # 覆盖率报告
git merge main      # 合并上游到当前分支
```

---

## Docker 容器管理

```bash
# 构建并启动（使用预构建镜像，跳过构建）
docker compose -f docker/docker-compose.build.yml up -d --build

# 仅启动容器（代码未修改时）
docker compose -f docker/docker-compose.build.yml up -d

# 查看日志
docker logs -f aiclient2api

# 停止容器
docker compose -f docker/docker-compose.build.yml down
```

---

## 自主工作模式

- 代码修复、Bug修复、功能实现**直接执行**
- 测试驱动开发(TDD)：修复后立即运行测试验证
- **bypass permissions：始终启用，无需确认**
- 保持main纯净，仅在pro分支工作

---

## 测试状态 (2026-04-16)

```
Test Suites: 52 passed, 52 total
Tests:       2175 passed, 2175 total
Time:        ~38s
```

**注意**：测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

### 覆盖率概况 (2026-04-16)

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi 高覆盖 ✅ |
| providers/forward | 91% | Forward 高覆盖 ✅ |
| providers/selectors | 91% | Selector 高覆盖 ✅ |
| wsrelay/* | 83% | manager.js 83.12% ✅ (75% → 83%) |
| services/* | 81-91% | health-check-timer 81% / usage-service 91% |
| utils/* | 30-78% | logger.js 78% ✅ / common.js 20% (集成级函数) |
| ui-modules/* | 13-83% | config-api 74% / system-monitor 71% / event-broadcast 55% ✅ |
| auth/* | 高 | OAuth模块覆盖良好 ✅ |

### 低覆盖率原因说明

| 函数 | 源码行数 | 说明 |
|------|----------|------|
| handleStreamRequest | ~350行 | 集成级流式处理函数，已通过集成测试覆盖 |
| handleUnaryRequest | ~250行 | 集成级 unary 处理函数，已通过集成测试覆盖 |
| handleContentGenerationRequest | ~130行 | 通用请求处理，已通过集成测试覆盖 |
| handleModelListRequest | ~110行 | 模型列表处理，已通过集成测试覆盖 |

**已覆盖的工具函数**：RETRYABLE_NETWORK_ERRORS / isRetryableNetworkError / getProtocolPrefix / formatExpiryTime / formatExpiryLog / formatLog / getClientIp / getMD5Hash / formatToLocal / findByPrefix / hasByPrefix / getBaseType / extractSystemPromptFromRequestBody / escapeHtml / safeCompare / isAuthorized / createErrorResponse / createStreamErrorResponse / MAX_BODY_SIZE / getRequestBody / logConversation

---

## pro 分支对比 main 主要变更

### 新增功能
1. **Kimi OAuth** - 完整 Device Flow 实现 + kimi-oauth-handler.js
2. **Kimi Provider** - kimi-core.js, kimi-strategy.js, kimi-message-normalizer.js
3. **WSRelay Manager** - Manager-Session 双层架构 (参考 Go 版)
4. **LRU Cache TTL 3小时** - 与 CLIProxyAPI 对齐
5. **配置快照恢复** - JSON 解析失败时自动从快照恢复
6. **分区配置管理** - saveSectionConfig/resetSectionConfig
7. **Health Check Timer** - 独立健康检查模块

### 架构优化
1. **Provider Pool Manager 重构**
   - 信号量模式替代 activeProviderRefreshes
   - 429 指数退避机制
   - 冷却队列 per-provider 控制
   - REFRESH_LEAD_CONFIG per-provider 刷新提前期

2. **默认健康检查间隔** - 从 10 分钟优化为 5 分钟
3. **安全 API Key 生成** - 首次启动自动生成安全随机 Key

### 安全修复
1. XSS 防护 - escapeHtml 统一处理 ✅
2. 时序安全比较 - safeCompare() 替代直接字符串比较 ✅
3. 日志脱敏 - sanitizeLog() 覆盖 token/api_key 等敏感字段 ✅
4. 请求体大小限制 - MAX_BODY_SIZE 10MB ✅
5. 安全测试覆盖 - security-fixes.test.js 验证所有安全修复 ✅

### 移除/废弃
1. **iFlow Provider** - 已从 pro 分支移除 (configs/provider_pools.json.example)
2. **AGENTS.md** - 已迁移到 .agent 目录

---

## pro 分支深度 Review 总结 (2026-04-16)

### 代码质量确认 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Timer 泄漏修复 | ✅ 21处 .unref() | 所有 setInterval 均已添加 .unref() |
| 认证模块 | ✅ 完整 | 密码验证/Token管理/登录尝试限制 |
| OAuth 流程 | ✅ 正确 | Kimi/Codex/Gemini/Qwen/Kiro 设备流 |
| XSS 防护 | ✅ 统一 | escapeHtml() 全局使用 |
| 时序安全比较 | ✅ 正确 | safeCompare() 使用 crypto.timingSafeEqual |
| 日志脱敏 | ✅ 完整 | sanitizeLog() 覆盖敏感字段 |
| 请求体限制 | ✅ 10MB | MAX_BODY_SIZE 防止内存耗尽 |

### 代码统计 (pro vs main)

| 指标 | 数值 |
|------|------|
| 变更文件 | 151 个 |
| 新增行数 | +41,047 |
| 删除行数 | -5,678 |
| 净增行数 | +35,369 |

### 核心模块变更

```
新增文件 (83个)：
├── src/auth/kimi-oauth.js (561行)
├── src/auth/kimi-oauth-handler.js (567行)
├── src/providers/kimi/* (Kimi Provider 全套)
├── src/wsrelay/manager.js (670行)
├── src/services/health-check-timer.js (326行)
└── .agent/*.md (规范文档)

移除文件 (4个)：
├── src/auth/iflow-oauth.js
├── src/providers/openai/iflow-core.js
├── configs/provider_pools.json.example
└── configs/pwd
```

### 集成级函数说明

以下函数不适合直接单元测试，已通过集成测试覆盖：
- `handleStreamRequest` (~350行) - 复杂异步流处理、外部服务调用
- `handleUnaryRequest` (~250行) - 重试逻辑、错误处理
- `handleContentGenerationRequest` (~130行) - 内部调用 handleStreamRequest/handleUnaryRequest
- `handleModelListRequest` (~110行) - 提供商池管理

**已覆盖的工具函数**：RETRYABLE_NETWORK_ERRORS / isRetryableNetworkError / getProtocolPrefix / formatExpiryTime / formatExpiryLog / formatLog / getClientIp / getMD5Hash / formatToLocal / findByPrefix / hasByPrefix / getBaseType / extractSystemPromptFromRequestBody / escapeHtml / safeCompare / isAuthorized / createErrorResponse / createStreamErrorResponse / MAX_BODY_SIZE

---

## 待优化项

| 模块 | 当前覆盖 | 目标 | 备注 |
|------|----------|------|------|
| utils/common.js | 20% | 60%+ | 已覆盖 20 个核心工具函数 |
| utils/logger.js | 78% | 85%+ | ✅ 已提升 67% → 78% (128 tests) |
| ui-modules/event-broadcast | 55% | 60%+ | ✅ 已提升 47% → 55% (新增6个测试) |
| wsrelay/manager.js | 83% | 85%+ | 错误处理分支未完全覆盖 |

---

## 最近提交 (pro 分支)

| 提交 | 说明 |
|------|------|
| 791ac91 | fix: 修复多处关键 bug - LRU滑动过期/WSRelay竞态/Kimi OAuth |
| 616fc9f | docs: 更新 .agent 文档 - 测试状态和覆盖率记录 |
| eb14407 | docs: 更新 CLAUDE.md - event-broadcast 测试覆盖率提升记录 |
| 130c6a5 | test: 提升 event-broadcast.js 测试覆盖率 47% → 55% |
| 9d94f3a | docs: 更新文档 - 测试状态和覆盖率概况 (2026-04-16) |
| 2f0bbff | test: 提升 wsrelay/manager.js 测试覆盖率 75% → 83% |

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

### 🟢 已移除的死代码

| # | 代码 | 文件 |
|---|------|------|
| 1 | `closedCh = new EventEmitter()` 未使用 | wsrelay/manager.js:325 |

---

## Timer 泄漏修复 (2026-04-15)

### 修复的 setInterval 列表 (共 21 处)
- `src/auth/gemini-oauth.js` - pollTimer (OAuth 轮询) ✅ 已添加 .unref()
- `src/auth/codex-oauth.js` - pollTimer (OAuth 轮询) ✅ 已添加 .unref()
- `src/plugins/api-potluck/api-routes.js` - rateLimitCleanupTimer (限流清理) ✅ 已添加 .unref()
- `src/providers/gemini/antigravity-core.js` - checkInterval (OAuth 检查) ✅ 已添加 .unref()
- `src/wsrelay/manager.js` - heartbeatTimer (心跳) ✅ 已添加 .unref()
- `src/services/api-server.js` - heartbeatTimer (心跳) ✅ 已添加 .unref()
- `src/services/health-check-timer.js` - timerId/startupTimer ✅ 已添加 .unref()
- `src/providers/adapter.js` - cacheCleanupTimer (缓存清理) ✅ 已添加 .unref()
- `src/providers/provider-pool-manager.js` - refreshBufferTimers/saveTimer ✅ 已添加 .unref()
- `src/utils/logger.js` - _contextCleanupTimer (上下文清理) ✅ 已添加 .unref()
- `src/ui-modules/auth.js` - tokenCleanupTimer (Token 清理) ✅ 已添加 .unref()
- `src/ui-modules/event-broadcast.js` - keepAlive (SSE 保活) ✅ 已添加 .unref()
- `src/providers/gemini/gemini-core.js` - checkInterval ✅ 已添加 .unref()
- `src/providers/openai/qwen-core.js` - checkInterval ✅ 已添加 .unref()
- `src/providers/openai/codex-core.js` - cleanupInterval ✅ 已添加 .unref()
- `src/plugins/model-usage-stats/stats-manager.js` - persistTimer ✅ 已添加 .unref()
- `src/plugins/api-potluck/key-manager.js` - persistTimer ✅ 已添加 .unref()
- `src/utils/tls-sidecar.js` - healthCheckTimer ✅ 已添加 .unref()
- `src/auth/kiro-oauth.js` - timer (页面倒计时) ✅ 已添加 .unref() (前端脚本)
- `src/auth/gemini-oauth.js` - timer (页面倒计时) ✅ 已添加 .unref() (前端脚本)
- `src/auth/codex-oauth.js` - timer (页面倒计时) ✅ 已添加 .unref() (前端脚本)

### 修复方法
在所有 `setInterval` 调用后添加 `.unref()` 防止定时器阻止进程退出：
```javascript
const timer = setInterval(/* ... */);
if (timer.unref) timer.unref();
```

*最后更新: 2026-04-16*
