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

## LRU Cache 设计

### 核心特性

- **容量**: 50 个条目
- **TTL**: 3 小时（与 Go 版本 CLIProxyAPI 对齐）
- **滑动过期**: 每次访问更新 timestamp

### 关键实现 (adapter.js)

```javascript
get(key) {
    // 检查 TTL 过期
    if (this._isExpired(entry)) {
        this.cache.delete(key);
        return undefined;
    }
    // 移动到末尾并刷新时间戳（滑动过期）
    this.cache.delete(key);
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
}
```

---

## 测试覆盖率说明

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
| ui-modules/config-api | 74% | Config API 核心功能已覆盖 |
| utils/provider-utils | 87% | Provider 工具函数高覆盖 |
| wsrelay/manager.js | 83% | 错误处理分支已覆盖 |

### 低覆盖率模块 (<60%)

| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| utils/common.js | 20% | 20个核心函数已覆盖 |
| ui-modules/event-broadcast | 55% | 需继续提升 |

---

## Bug 修复记录汇总

### WSRelay Manager 已修复 Bug (13个)

| # | Bug | 修复方案 |
|---|-----|----------|
| 1 | cleanup() _cleanupOnce 未使用 | `if (this.closed \|\| this._cleanupOnce) return; this._cleanupOnce = true;` |
| 2 | _sendPing() while 忙等阻塞事件循环 | 循环重试+5秒超时保护 |
| 3 | request() send失败不通知调用者 | catch 中向通道 push 错误消息再关闭 |
| 4 | send() acquireLock 未检查 closed | `if (this.closed) reject()` |
| 5 | stop() activeSessions 过早清零 | 移到 cleanup 循环之后 |
| 6 | closedCh 未使用 | 已移除 |
| 7 | _sendPing() 锁竞态 | 循环重试+5秒超时保护 |
| 8 | _registerSession 大小写不一致 | 统一使用 toLowerCase() |
| 9 | _sendPong() 未处理返回值 | 添加 .catch() 处理 |
| 10 | ch.messages 无限增长 | 添加 MAX_MESSAGES=100 限制 |
| 11 | ch.drain() 从未被调用 | 在 request().catch()、cleanup() 中调用 |
| 12 | 终端消息不触发 'message' 事件 | 添加 emit('message', msg) |
| 13 | request() 错误通知丢失 | 修复 push → drain → close 顺序 |

### LRU Cache 已修复 Bug (4个)

| # | Bug | 修复方案 |
|---|-----|----------|
| 1 | get() 访问时不更新 timestamp | `this.cache.set(key, { value, timestamp: Date.now() })` |
| 2 | has() 不更新访问时间 | 添加相同的 timestamp 更新逻辑 |
| 3 | 注释掉的 initialize() 调用 | adapter.js 死代码已移除 |
| 4 | 过时注释 "Node.js 使用 30 分钟" | 已修正为 "与 Go 对齐 3 小时" |

### 安全相关 Bug (6个)

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 1 | safeCompare 时序攻击漏洞 | common.js:259-294 | ✅ 统一转换空字符串，恒定时间比较 |
| 2 | getRequestBody 内存问题 | common.js:204-231 | ✅ req.destroy() + chunks.length=0 |
| 3 | 默认密码 admin123 未强制 | auth.js:34-45 | ✅ isDefaultPassword() 检查 |
| 4 | ws.on('error') 重复绑定 | manager.js:339,377 | ✅ 移除构造函数绑定 |
| 5 | writeMutex 回调异常不重置 | manager.js:538-553 | ✅ settled 标志保护 |
| 6 | JWT 签名验证缺失 | codex-oauth.js:469-513 | ✅ jose JWKS 验证 |

---

## 已知技术债务

| # | 问题 | 文件 | 风险 | 说明 |
|---|-----|------|------|------|
| 1 | Proxy getOwnPropertyDescriptor | adapter.js:944 | 中 | 每次访问更新LRU顺序 |
| 2 | config API Key 不持久化 | config-manager.js | 中 | 重启后丢失 |
| 3 | _acquireGlobalSemaphoreSync 非原子 | provider-pool-manager.js:866 | 低 | 异步版本有保护 |
| 4 | 设备ID存储相对路径 | kimi-oauth.js:88 | 低 | 建议使用绝对路径 |

---

## 八次Review 审查总结 (2026-04-18)

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

### 安全审查 ✅

| 项目 | 状态 |
|------|------|
| JWT JWKS 验证 | ✅ codex-oauth.js:509-551 使用 jose 库 |
| OAuth 凭证环境变量 | ✅ Kimi/Codex 支持 process.env 覆盖 |
| XSS 防护 | ✅ escapeHtml 统一使用 |
| 时序安全比较 | ✅ safeCompare() 使用 timingSafeEqual |
| 日志脱敏 | ✅ maskKey() 覆盖敏感字段 |

### 架构审查 ✅

| 模块 | 文件 | 状态 |
|------|------|------|
| LRU Cache 滑动过期 | adapter.js:796-799 | ✅ 正确实现 |
| 信号量模式 | provider-pool-manager.js:118-128 | ✅ 正确实现 |
| 429 指数退避 | provider-pool-manager.js:142-148 | ✅ 正确实现 |
| WSRelay 双层架构 | wsrelay/manager.js:47-306 | ✅ 正确实现 |
| Health Check Timer | health-check-timer.js:39-300 | ✅ 正确实现 |

*最后更新: 2026-04-18*