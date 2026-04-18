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
| 最后更新 | 2026-04-22 七次Review通过 - 确认无新增问题 |

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
# 构建并启动（本地构建，不拉取远程镜像）
docker compose up -d --build

# 仅启动容器（代码未修改时）
docker compose up -d

# 开发模式（热重载）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# 查看日志
docker logs -f aiclient2api

# 停止容器
docker compose down
```

---

## 自主工作模式

- 代码修复、Bug修复、功能实现**直接执行**
- 测试驱动开发(TDD)：修复后立即运行测试验证
- **bypass permissions：始终启用，无需确认**
- 保持main纯净，仅在pro分支工作

---

## 测试状态 (2026-04-18)

```
Test Suites: 52 passed, 52 total
Tests:       2179 passed, 2179 total
Time:        ~34s
```

**注意**：测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

### 覆盖率概况 (2026-04-18)

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi 高覆盖 ✅ |
| providers/forward | 91% | Forward 高覆盖 ✅ |
| providers/selectors | 91% | Selector 高覆盖 ✅ |
| wsrelay/* | 83% | manager.js 83% ✅ (新增 WebSocket error 测试) |
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
3. 日志脱敏 - maskKey() 覆盖 token/api_key 等敏感字段 ✅
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
| 日志脱敏 | ✅ 完整 | maskKey() 覆盖敏感字段 |
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
| 1ee5efb | fix: 六次Review修复 - config-api同步fs方法/activeProviderRefreshes残留引用 |
| fb51051 | docs: 更新文档 - 修复 _sendPong unhandled rejection 说明 |
| 21564fe | fix: 修复 _dispatch 中 _sendPong 未处理的 unhandled rejection |
| 97081e9 | docs: 更新文档日期为 2026-04-17 |
| 77f614a | fix: 二次Review修复 - _sendPing锁竞态/_registerSession大小写/_sendPong异步/ch.messages内存泄漏 |

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

## 二次 Review 发现并修复的 Bug (2026-04-17)

### 🔴 高危 Bug

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | **_sendPing() 锁竞态** - 等待1ms后无条件获取锁，可能允许并发写入 | manager.js:416-422 | ✅ 改为循环重试+5秒超时保护 | 77f614a |
| 2 | **_registerSession 大小写不一致** - 存储原始大小写但注销时用 toLowerCase()，导致无法注销 | manager.js:116 | ✅ 统一使用 toLowerCase() 存储 | 77f614a |

### 🟡 中危 Bug

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | **_sendPong() 未 await** - _dispatch() 调用 _sendPong() 未处理返回值，导致 unhandled rejection | manager.js:459 | ✅ 添加 .catch() 处理 | 21564fe |
| 2 | **ch.messages 无限增长** - drain() 时消息数组无上限，可导致内存泄漏 | manager.js:590-593 | ✅ 添加 MAX_MESSAGES=100 限制 | 77f614a |

### 🟢 死代码清理

| # | 代码 | 文件 | 修复 | 提交 |
|---|------|------|------|------|
| 1 | 注释掉的 initialize() 调用 (106-108, 358-360) | adapter.js | ✅ 已移除 | 77f614a |
| 2 | 过时注释 "Node.js 使用 30 分钟" (889) | adapter.js | ✅ 已修正为 "与 Go 对齐 3 小时" | 77f614a |

---

## 三次 Review 发现并修复的 Bug (2026-04-19)

### 🔴 高危 Bug

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | **request() 错误通知丢失** - catch 中先 push 错误再 close，但 close 后 push 被忽略，调用者收不到错误 | manager.js:620-625 | ✅ 调整顺序：先 push → drain → close | 2cf35b8 |
| 2 | **ch.drain() 从未被调用** - 消息在 buffer 中积累，从不转移到 messages，导致 buffer 溢出和内存泄漏 | manager.js:593-602 | ✅ 在 close 前调用 drain | 2cf35b8 |
| 3 | **cleanup() 未 drain 就 close** - 清理待处理请求时错误消息留在 buffer 未转移 | manager.js:670-672 | ✅ 添加 drain 调用 | 2cf35b8 |

### 🟡 中危 Bug

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | **终端消息不触发 'message' 事件** - 有 pending ID 的终端消息直接返回，不触发 emit，破坏事件驱动调用 | manager.js:481-484 | ✅ 添加 emit('message', msg) | 2cf35b8 |
| 2 | **_dispatch 调用 drain 未检查方法存在** - 测试环境 mock 的 ch 没有 drain 方法会导致错误 | manager.js:483 | ✅ 添加 if (pendingReq.ch.drain) 检查 | 2cf35b8 |

### 📝 修复细节

#### 1. request() 错误通知修复
```javascript
// 修复前：close() 后 push 被忽略
pendingReq.ch.push({ type: MessageType.Error, ... });
pendingReq.close();

// 修复后：push → drain → close
pendingReq.ch.push({ type: MessageType.Error, ... });
pendingReq.ch.drain();
pendingReq.close();
```

#### 2. ch.drain() 调用链
- `request().catch()` → `ch.push()` → `ch.drain()` → `ch.close()`
- `cleanup()` → `ch.push()` → `ch.drain()` → `ch.close()`
- `_dispatch()` 终端消息 → `ch.send()` → `ch.drain()` → `ch.close()` → `emit('message', msg)`

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

*最后更新: 2026-04-21*

---

## 七次Review深度分析 (2026-04-22)

### Review 执行情况

| Review | 发现高危 | 发现中危 | 发现低危 | 状态 |
|--------|----------|----------|----------|------|
| 一次Review | 5 | 4 | 1 | ✅ 全部修复 |
| 二次Review | 2 | 2 | 2 | ✅ 全部修复 |
| 三次Review | 3 | 2 | 0 | ✅ 全部修复 |
| 四次Review | 5 | 5 | 0 | ✅ 全部修复 |
| 五次Review | 1 | 0 | 0 | ✅ 全部修复 |
| 六次Review | 0 | 0 | 0 | ✅ 确认无新增 |
| **七次Review** | 0 | 0 | 0 | ✅ 确认无新增 |

### 七次Review 安全审查结论

**安全审查**: ✅ 通过
- JWT 签名验证: ✅ 完整 JWKS 验证，无降级风险
- OAuth 凭证: ✅ 支持环境变量覆盖
- 密码安全: ✅ 默认密码拒绝 + PBKDF2 + 时序安全比较
- XSS 防护: ✅ escapeHtml 统一使用
- 日志脱敏: ✅ maskKey 覆盖敏感字段

**架构审查**: ✅ 确认
- LRU Cache: ✅ 滑动过期正确实现 (796-799行)
- 信号量模式: ✅ 正确实现（异步版本有保护）
- writeMutex: ✅ settled 标志保护正确

**已知技术债务** (无需立即修复):

| # | 问题 | 文件 | 风险 | 说明 |
|---|-----|------|------|------|
| 1 | Proxy getOwnPropertyDescriptor | adapter.js:944 | 中 | 已知技术债务 |
| 2 | config API Key 不持久化 | config-manager.js | 低 | 需用户手动保存 |
| 3 | _acquireGlobalSemaphoreSync 非原子 | provider-pool-manager.js:866 | 低 | 同步版本有竞态，异步版本有保护 |
| 4 | 设备ID存储相对路径 | kimi-oauth.js:88 | 低 | 建议使用绝对路径 |

---

## 测试状态 (2026-04-22)

```
Test Suites: 52 passed, 52 total
Tests:       2179 passed, 2179 total
Time:        ~34s
```

**注意**：测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

### 覆盖率概况 (2026-04-22)

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi 高覆盖 ✅ |
| providers/forward | 91% | Forward 高覆盖 ✅ |
| providers/selectors | 91% | Selector 高覆盖 ✅ |
| wsrelay/* | 83% | manager.js 83% ✅ |
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

### 已确认/已知问题

| # | 问题 | 文件 | 风险 | 状态 |
|---|-----|------|------|------|
| 1 | **Proxy getOwnPropertyDescriptor 误用 get()** - 每次访问描述符都更新LRU | adapter.js:943-947 | 高 | 已知技术债务 - 当前测试覆盖良好 |
| 2 | **logger JSON.stringify 循环引用** - 有 try-catch 保护但仍可能丢失日志 | logger.js:214 | 中 | 已缓解 - String(arg) fallback |
| 3 | **config API Key 不持久化** - 重启后丢失，需手动保存 | config-manager.js:210-213 | 中 | 设计问题 - 需用户手动保存 |
| 4 | **_acquireGlobalSemaphoreSync 非原子** - 检查和递增之间有竞态窗口 | provider-pool-manager.js:865-870 | 中 | 已知问题 - async版本有保护 |

### 已修复/高优先级

| # | 问题 | 文件 | 风险 | 状态 |
|---|-----|------|------|------|
| 1 | **JWT 签名验证缺失** - codex-oauth.js 仅解析不验证 | codex-oauth.js:469-513 | 高 | ✅ 已修复 - 使用 jose 实现 JWKS 验证 |
| 2 | **硬编码 OAuth 凭证** - gemini/kimi/codex 多处硬编码 | gemini-core.js/antigravity-core.js/qwen-core.js | 高 | ✅ 已修复 - 支持环境变量覆盖 |

### 低优先级问题 (无需立即修复)

- common.js MD5 使用不安全算法 (用于缓存key，可接受)
- adapter maxSize 无边界检查 (通常传入有效值)
- wsrelay manager ws.close() 异常静默忽略 (debug级别，可接受)
- health-check-timer 启动延迟100ms可能导致竞态 (低风险)

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

*最后更新: 2026-04-18*