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

## 测试状态 (2026-04-18)

```
Test Suites: 52 passed, 52 total
Tests:       2179 passed, 2179 total
Time:        ~36s
```

> ⚠️ 测试运行时可能出现 "A worker process has failed to exit gracefully" 警告，这是 Jest 已知问题（Node.js v24 + Jest 组合），不影响测试结果。

---

## 已完成功能（pro 分支）

### 新增功能
1. **Kimi OAuth** - 完整 Device Flow 实现 + kimi-oauth-handler.js
2. **Health Check Timer** - 独立健康检查模块
3. **WSRelay Manager** - Manager-Session 双层架构
4. **路径安全校验** - PROVIDER_POOLS_FILE_PATH / SCHEDULED_HEALTH_CHECK
5. **iFlow OAuth** - 已从 pro 分支移除
6. **Provider Pool Manager** - 信号量模式 + 429 退避 + 冷却队列
7. **配置快照恢复** - JSON 解析失败时自动从快照恢复
8. **分区配置管理** - saveSectionConfig/resetSectionConfig
9. **Timer 泄漏修复** - 21处 setInterval 添加 .unref()
10. **安全 API Key 生成** - 首次启动自动生成安全随机 Key

### 安全修复
1. XSS 防护 - escapeHtml 统一处理 ✅
2. 时序安全比较 - safeCompare() 替代直接字符串比较 ✅
3. 日志脱敏 - maskKey() 覆盖 token/api_key 等敏感字段 ✅
4. 请求体大小限制 - MAX_BODY_SIZE 10MB ✅

---

## 代码统计

| 指标 | 数值 |
|------|------|
| 变更文件 | 172 个 |
| 新增行数 | +41,047 |
| 删除行数 | -5,678 |
| 净增行数 | +35,369 |

---

## 覆盖率目标追踪

| 模块 | 当前 | 目标 | 状态 |
|------|------|------|------|
| providers/kimi | 87-91% | 90%+ | 🟢 已达标 |
| providers/forward | 91% | 90%+ | 🟢 已达标 |
| providers/selectors | 91% | 90%+ | 🟢 已达标 |
| services/usage-service | 91% | 90%+ | 🟢 已达标 |
| wsrelay/manager.js | 83% | 85%+ | 🟡 |
| utils/logger.js | 78% | 85%+ | 🟡 |
| ui-modules/event-broadcast | 55% | 60%+ | 🟡 |
| utils/common.js | 20% | 60%+ | 🟡 已覆盖 20 个核心函数 |

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
| JWT 签名验证 | ✅ codex-oauth.js 使用 jose JWKS 验证 |
| OAuth 凭证环境变量 | ✅ Kimi/Codex 支持 process.env 覆盖 |
| XSS 防护 | ✅ escapeHtml 统一使用 |
| 时序安全比较 | ✅ safeCompare() 使用 timingSafeEqual |
| 日志脱敏 | ✅ maskKey() 覆盖敏感字段 |

### 架构审查 ✅

| 模块 | 状态 |
|------|------|
| LRU Cache 滑动过期 | ✅ adapter.js:796-799 正确实现 |
| 信号量模式 | ✅ refreshSemaphore 全局/per-provider 控制 |
| 429 指数退避 | ✅ 指数退避 + 冷却队列 + retry-after |

---

## Bug 修复记录

### 🔴 高危 Bug (15个)

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | LRUCache.get() 滑动过期失效 | adapter.js:789-806 | ✅ 已修复 | 791ac91 |
| 2 | cleanup() 竞态条件 | wsrelay/manager.js:610-612 | ✅ 已修复 | 791ac91 |
| 3 | _sendPing() 阻塞事件循环 | wsrelay/manager.js:418-421 | ✅ 已修复 | 791ac91 |
| 4 | request() send失败不通知调用者 | wsrelay/manager.js:592-595 | ✅ 已修复 | 791ac91 |
| 5 | send() acquireLock未检查closed | wsrelay/manager.js:510-516 | ✅ 已修复 | 791ac91 |
| 6 | _sendPing() 锁竞态 | manager.js:416-422 | ✅ 循环重试+5秒超时 | 77f614a |
| 7 | _registerSession 大小写不一致 | manager.js:116 | ✅ 统一toLowerCase | 77f614a |
| 8 | request() 错误通知丢失 | manager.js:620-625 | ✅ push→drain→close | 2cf35b8 |
| 9 | ch.drain() 从未被调用 | manager.js:593-602 | ✅ 已修复 | 2cf35b8 |
| 10 | safeCompare 时序攻击漏洞 | common.js:259-294 | ✅ 恒定时间比较 | 6408799 |
| 11 | getRequestBody 内存问题 | common.js:204-231 | ✅ req.destroy() | 6408799 |
| 12 | 默认密码 admin123 未强制 | auth.js:34-45 | ✅ 拒绝登录 | 6408799 |
| 13 | ws.on('error') 重复绑定 | manager.js:339,377 | ✅ 移除构造函数绑定 | 6408799 |
| 14 | writeMutex 回调异常不重置 | manager.js:538-553 | ✅ settled标志 | 6408799 |
| 15 | JWT 签名验证缺失 | codex-oauth.js:469-513 | ✅ jose JWKS验证 | c495797 |

### 🟡 中危 Bug (10个)

| # | Bug | 文件 | 修复 | 提交 |
|---|-----|------|------|------|
| 1 | LRUCache.has() 不更新访问时间 | adapter.js:822-834 | ✅ 已修复 | 791ac91 |
| 2 | batchImportKimiRefreshTokensStream 路径错误 | kimi-oauth-handler.js:350 | ✅ 已修复 | 791ac91 |
| 3 | completeKimiOAuth 缺少 autoLinkProviderConfigs | kimi-oauth-handler.js:73-128 | ✅ 已修复 | 791ac91 |
| 4 | stop() stats.activeSessions 过早清零 | wsrelay/manager.js:221-223 | ✅ 已修复 | 791ac91 |
| 5 | _sendPong() 未 await | manager.js:459 | ✅ .catch()处理 | 21564fe |
| 6 | ch.messages 无限增长 | manager.js:590-593 | ✅ MAX_MESSAGES=100 | 77f614a |
| 7 | 终端消息不触发 'message' 事件 | manager.js:481-484 | ✅ emit('message', msg) | 2cf35b8 |
| 8 | _dispatch 调用 drain 未检查方法存在 | manager.js:483 | ✅ if (drain) 检查 | 2cf35b8 |
| 9 | config-api同步fs方法 | config-api.js | ✅ 已修复 | 1ee5efb |
| 10 | activeProviderRefreshes残留引用 | provider-pool-manager.js | ✅ 已修复 | 1ee5efb |

---

## 已知技术债务 (无需立即修复)

| # | 问题 | 文件 | 风险 | 说明 |
|---|-----|------|------|------|
| 1 | Proxy getOwnPropertyDescriptor | adapter.js:944 | 中 | 每次访问更新LRU，设计已知 |
| 2 | config API Key 不持久化 | config-manager.js | 低 | 需用户手动保存 |
| 3 | _acquireGlobalSemaphoreSync 非原子 | provider-pool-manager.js:866 | 低 | 异步版本有保护 |
| 4 | 设备ID存储相对路径 | kimi-oauth.js:88 | 低 | 建议使用绝对路径 |

*最后更新: 2026-04-18*