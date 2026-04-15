# Design.md - 技术设计

> 规范驱动开发第二步：记录技术设计和关键决策

---

## 系统架构

```
Client → API Server → Request Handler → Adapter → Provider Pool
                                              ↓
                                         Providers
```

### 核心模块
| 模块 | 文件 | 说明 |
|------|------|------|
| Adapter | src/providers/adapter.js | LRU Cache，3小时 TTL 滑动过期 |
| Provider Pool Manager | src/providers/provider-pool-manager.js | 故障转移、负载均衡、信号量模式 |
| Selectors | src/providers/selectors/index.js | Score/RoundRobin/FillFirst |
| Health Check Timer | src/services/health-check-timer.js | 定时健康检查（5分钟间隔） |
| WSRelay Manager | src/wsrelay/manager.js | Manager-Session 双层架构 |

### Converters (src/converters/)
ClaudeConverter / OpenAIConverter / KimiConverter / GeminiConverter / CodexConverter / GrokConverter

### OAuth Handlers (src/auth/)
kimi-oauth.js / kiro-oauth.js / gemini-oauth.js / codex-oauth.js / qwen-oauth.js

---

## CLIProxyAPI 参考设计（Go → Node.js 对齐）

### signature_cache.go（已对齐）
- 3 小时 TTL ✅
- 滑动过期 ✅
- 分组 Map → Node.js 单一 LRU Cache

### wsrelay/manager.go + session.go（已对齐）
- Manager-Session 双层架构 ✅
- 30s 心跳间隔 ✅
- 带缓冲 channel（maxBufferSize: 8）✅
- pendingRequest.closeOnce 防止重复关闭 ✅

---

## 安全设计

### 日志脱敏
- 脱敏字段: `token`, `api_key`, `authorization`, `password`, `secret`
- 实现: `src/utils/common.js` → `maskKey()` ✅ (isAuthorized 函数内联实现)

### XSS 防护
- `escapeHtml()` 统一处理所有错误消息输出 ✅
- OAuth handlers 全部使用 ✅

### 时序安全比较
- `safeCompare()` 使用 `crypto.timingSafeEqual()` 防止时序攻击 ✅
- 实现: `src/utils/common.js`

### 请求体大小限制
- `MAX_BODY_SIZE = 10MB` 防止内存耗尽 ✅

---

## Provider Pool Manager 架构 (v2)

### 信号量模式
```javascript
this.refreshSemaphore = {
    global: 16,           // 全局最多 16 并发刷新
    perProvider: 4,      // 每 provider 最多 4 并发
    globalUsed: 0,
    perProviderUsed: {},  // { providerType: count }
    globalWaitQueue: [],
    perProviderWaitQueues: {}
};
```

### 429 指数退避
```javascript
this.quotaBackoff = {
    base: 1000,        // 1s
    max: 1800000,      // 30min
    maxRetries: 3
};
```

### 冷却队列
```javascript
this.cooldownQueue = {
    enabled: true,
    defaultCooldown: 60000,  // 60s
    maxCooldown: 300000       // 5min
};
```

### Per-Provider 刷新提前期
```javascript
REFRESH_LEAD_CONFIG = {
    'gemini-cli-oauth': 20 * 60 * 1000,     // 20 分钟
    'claude-kiro-oauth': 30 * 60 * 1000,    // 30 分钟
    'kimi-oauth': 5 * 60 * 1000,            // 5 分钟
    'default': 10 * 60 * 1000                // 默认 10 分钟
};
```

---

## 已知问题与修复记录

| # | 问题 | 状态 | 日期 |
|---|------|------|------|
| 1 | _getMutableLastCheckTimes 未定义 | ✅ 已修复 | - |
| 2 | 迭代中删除 Map 条目 | ✅ 已修复 | - |
| 3 | adapter.js 死代码清理 | ✅ 已修复 | - |
| 4 | oauth-handlers.js 导出路径错误 | ✅ 已修复 | - |
| 5 | FillFirstSelector 返回 Promise | ✅ 已修复 | - |
| 6 | LRU Cache TTL 提升至 3 小时 | ✅ 已修复 | - |
| 7 | WSRelay Session channel 缓冲优化 | ✅ 已修复 | - |
| 8 | codex-oauth 错误处理 escapeHtml | ✅ 已修复 | - |
| 9 | iFlow Provider 移除 | ✅ 已移除 | - |
| 10 | safeCompare 时序安全比较 | ✅ 已实现 | - |
| 11 | getClientIp 测试空对象访问错误 | ✅ 已修复 | 2026-04-15 |
| 12 | findByPrefix/hasByPrefix 前缀匹配测试 | ✅ 已修复 | 2026-04-15 |
| 13-33 | Timer 泄漏 - 21处 setInterval 未调用 .unref() | ✅ 已全部修复 | 2026-04-15 |
| 34-37 | _sendPing 锁竞态 / _registerSession 大小写 / _sendPong 异步 / ch.messages 泄漏 | ✅ 已修复 | 2026-04-17 |
| 38-41 | ch.drain 未调用 / 终端消息不触发 event / 错误通知丢失 | ✅ 已修复 | 2026-04-19 |

### Timer 泄漏修复 (21处)

| 文件 | 定时器 | 状态 |
|------|--------|------|
| src/auth/gemini-oauth.js | pollTimer | ✅ .unref() |
| src/auth/codex-oauth.js | pollTimer | ✅ .unref() |
| src/plugins/api-potluck/api-routes.js | rateLimitCleanupTimer | ✅ .unref() |
| src/providers/gemini/antigravity-core.js | checkInterval | ✅ .unref() |
| src/wsrelay/manager.js | heartbeatTimer | ✅ .unref() |
| src/services/api-server.js | heartbeatTimer | ✅ .unref() |
| src/services/health-check-timer.js | timerId/startupTimer | ✅ .unref() |
| src/providers/adapter.js | cacheCleanupTimer | ✅ .unref() |
| src/providers/provider-pool-manager.js | refreshBufferTimers/saveTimer | ✅ .unref() |
| src/utils/logger.js | _contextCleanupTimer | ✅ .unref() |
| src/ui-modules/auth.js | tokenCleanupTimer | ✅ .unref() |
| src/ui-modules/event-broadcast.js | keepAlive | ✅ .unref() |
| src/providers/gemini/gemini-core.js | checkInterval | ✅ .unref() |
| src/providers/openai/qwen-core.js | checkInterval | ✅ .unref() |
| src/providers/openai/codex-core.js | cleanupInterval | ✅ .unref() |
| src/plugins/model-usage-stats/stats-manager.js | persistTimer | ✅ .unref() |
| src/plugins/api-potluck/key-manager.js | persistTimer | ✅ .unref() |
| src/utils/tls-sidecar.js | healthCheckTimer | ✅ .unref() |
| src/auth/kiro-oauth.js | timer (前端) | ✅ .unref() |
| src/auth/gemini-oauth.js | timer (前端) | ✅ .unref() |
| src/auth/codex-oauth.js | timer (前端) | ✅ .unref() |

---

## Kimi OAuth 实现细节

### 设备流认证流程
1. `startKimiDeviceFlow()` - 获取 device_code 和 user_code
2. 前端轮询 `checkKimiAuthStatus()` - 单次检查授权状态
3. `completeKimiOAuth()` - 阻塞等待授权完成（不推荐 HTTP 调用）

### Token 刷新机制
- 阈值: REFRESH_THRESHOLD_SECONDS = 300 (5分钟)
- 设备 ID 持久化到 configs/.kimi_device_id
- 内置 CLIENT_ID 可通过 KIMI_CLIENT_ID 环境变量覆盖

---

## 测试用例设计原则

### common.js 测试策略
- **复制函数实现测试**：直接复制源码中的函数逻辑到测试文件
- 确保测试与源码逻辑完全一致，避免因实现差异导致的测试失败
- 适用场景：函数依赖复杂模块链，难以直接 mock

### 已覆盖的函数 (20+ 个)

| 函数 | 文件 | 说明 |
|------|------|------|
| RETRYABLE_NETWORK_ERRORS | common.js | 可重试网络错误常量 |
| isRetryableNetworkError | common.js | 检查是否为可重试网络错误 |
| getProtocolPrefix | common.js | 获取协议前缀 |
| formatExpiryTime | common.js | 格式化过期时间 |
| formatExpiryLog | common.js | 格式化过期日志 |
| formatLog | common.js | 统一日志格式 |
| getClientIp | common.js | 获取客户端 IP |
| getMD5Hash | common.js | MD5 哈希 |
| formatToLocal | common.js | 格式化本地时间 |
| findByPrefix | common.js | 前缀匹配查找 |
| hasByPrefix | common.js | 前缀匹配检查 |
| getBaseType | common.js | 获取基础类型 |
| extractSystemPromptFromRequestBody | common.js | 提取 System Prompt |
| escapeHtml | common.js | HTML 转义防 XSS |
| safeCompare | common.js | 时序安全比较 |
| isAuthorized | common.js | 授权检查 |
| createErrorResponse | common.js | 创建错误响应 |
| createStreamErrorResponse | common.js | 创建流式错误响应 |
| MAX_BODY_SIZE | common.js | 请求体大小限制常量 |
| getRequestBody | common.js | 获取请求体 |
| logConversation | common.js | 对话日志 |

### 边界条件处理
- `getClientIp({})` → 需提供 `headers: {}` 和 `socket: {}`
- `socket: null` → 需提供 `socket: { remoteAddress: null }`
- 前缀匹配：`findByPrefix(registry, 'openai-model')` 需使用完整键名

---

## 测试覆盖率说明 (2026-04-15 晚)

### 高覆盖率模块 (>80%)
| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| providers/kimi | 87-91% | Kimi Provider 高覆盖 |
| providers/forward | 91% | Forward Provider 高覆盖 |
| providers/selectors | 91% | Selector 高覆盖 |
| services/usage-service | 91% | Usage Service 高覆盖 |
| services/health-check-timer | 81% | Health Check Timer 高覆盖 |

### 中等覆盖率模块 (60-80%)
| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| utils/logger.js | 78% | Logger 脱敏功能已覆盖 |
| ui-modules/config-api | 73% | Config API 核心功能已覆盖 |
| utils/provider-utils | 87% | Provider 工具函数高覆盖 |
| wsrelay/manager.js | 83% | 错误处理分支已覆盖 ✅ |

### 低覆盖率模块 (<60%)
| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| utils/common.js | 20% | 20个核心函数已覆盖 |
| ui-modules/event-broadcast | 47% | 需继续提升 |

### 未覆盖/最小覆盖模块 (0-15%)
- auth/* OAuth 模块 - 通过集成测试覆盖
- providers/gemini - OAuth 集成测试覆盖
- providers/grok - OAuth 集成测试覆盖
- providers/openai (除 selectors) - OAuth 集成测试覆盖
- ui-modules/* (部分) - 部分通过单元测试覆盖

---

## wsrelay/manager.js 未覆盖分支分析

manager.js 75% 覆盖率，未覆盖行：
- **262-301行**: `_handleWebsocket` 错误处理分支
  - providerFactory 抛出异常
  - provider 为空时的处理
- **358-404行**: Session `run()` 方法的错误处理
  - WebSocket 消息解析失败
  - 连接关闭/错误处理
- **428行**: `_dispatch` 未知消息类型处理
- **456行**: 错误响应处理
- **476行**: Session 未找到处理
- **506-507行**: 请求转发错误处理
- **559-567行**: 会话清理错误处理
- **575-576行**: Manager 清理错误处理
- **616-617行**: 统计信息获取

这些分支主要是复杂异步场景和错误恢复路径，通过集成测试和实际使用验证。

---

## WSRelay Manager 已修复 Bug (2026-04-16/17)

| # | Bug | 修复方案 |
|---|-----|----------|
| 1 | cleanup() _cleanupOnce 未使用 | 添加 `if (this.closed \|\| this._cleanupOnce) return; this._cleanupOnce = true;` |
| 2 | _sendPing() while 忙等阻塞事件循环 | 改用循环重试+5秒超时保护 |
| 3 | request() send失败不通知调用者 | catch 中向通道 push 错误消息再关闭 |
| 4 | send() acquireLock 未检查 closed | 添加 `if (this.closed) reject()` 防止闭session等待 |
| 5 | stop() activeSessions 过早清零 | 移到 cleanup 循环之后 |
| 6 | closedCh 未使用 | 已移除 |
| 7 | _sendPing() 锁竞态 | 等待1ms后无条件获取锁，可能允许并发写入 |
| 8 | _registerSession 大小写不一致 | 统一使用 toLowerCase() 存储 provider |
| 9 | _sendPong() 未处理返回值 | _dispatch() 调用 _sendPong() 未处理返回值，导致 unhandled rejection |
| 10 | ch.messages 无限增长 | 添加 MAX_MESSAGES=100 限制 |
| 11 | ch.drain() 从未被调用 | 在 request().catch()、cleanup()、_dispatch() 终端消息处理中调用 drain |
| 12 | 终端消息不触发 'message' 事件 | 终端消息处理后添加 emit('message', msg) |
| 13 | request() 错误通知丢失 | 修复 push → drain → close 顺序 |

## LRU Cache 已修复 Bug (2026-04-16/17)

| # | Bug | 修复方案 |
|---|-----|----------|
| 1 | get() 访问时不更新 timestamp | 改为 `this.cache.set(key, { value, timestamp: Date.now() })` |
| 2 | has() 不更新访问时间 | 添加相同的 timestamp 更新逻辑 |
| 3 | 注释掉的 initialize() 调用 | adapter.js 死代码已移除 |
| 4 | 过时注释 "Node.js 使用 30 分钟" | 已修正为 "与 Go 对齐 3 小时" |

## 深度 Review 发现的问题 (2026-04-19)

### 已修复 ✅

| # | 问题 | 文件 | 风险 | 修复 |
|---|-----|------|------|------|
| 1 | safeCompare 时序攻击漏洞 | common.js | 高 | 恒定时间比较，使用Buffer.fill保证等长 |
| 2 | getRequestBody 字符串拼接性能 | common.js | 中 | chunks 数组 + Buffer.concat() |

### 已确认/已知技术债务

| # | 问题 | 文件 | 风险 | 说明 |
|---|-----|------|------|------|
| 1 | Proxy getOwnPropertyDescriptor 误用 | adapter.js:943 | 高 | get()会更新LRU顺序 |
| 2 | config API Key 不持久化 | config-manager.js | 中 | 重启后丢失 |
| 3 | _acquireGlobalSemaphoreSync 竞态 | provider-pool-manager.js | 中 | async版本有保护 |

### 未修复/需关注

| # | 问题 | 文件 | 风险 |
|---|-----|------|------|
| 1 | 默认密码 admin123 | auth.js:34 | 极高 |
| 2 | JWT 签名验证缺失 | codex-oauth.js | 高 |
| 3 | 硬编码 OAuth 凭证 | auth/*.js | 高 |

---

*最后更新: 2026-04-19*
