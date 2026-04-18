# Requirement.md - 需求规范

## 项目

- API代理服务 (OpenAI/Claude/Gemini/Kimi/Grok)
- OAuth认证 / 提供商池管理 / WSRelay / LRU Cache 3h

## 测试

```
52 suites / 2179 tests ✅ (~36s)
```

## 完成功能

1. Kimi OAuth + Provider
2. WSRelay Manager
3. Provider Pool 信号量模式
4. Health Check Timer
5. 安全修复 (XSS/safeCompare/脱敏/10MB)
6. Timer泄漏修复 (21处)

## 代码统计

- 变更文件: 172
- 净增行: +35,369

## 八次Review ✅

| 高危 | 中危 | 低危 | 状态 |
|------|------|------|------|
| 15 | 10 | 0 | ✅ 全部修复 |

## Bug修复

| # | Bug | 文件 | 提交 |
|---|-----|------|------|
| 1-5 | LRU/WSRelay/cleanup竞态 | adapter/wsrelay | 791ac91 |
| 6-7 | _sendPing锁竞态/_registerSession | manager | 77f614a |
| 8-9 | 错误通知/ch.drain未调用 | manager | 2cf35b8 |
| 10-14 | safeCompare/内存/密码/ws重复绑定/writeMutex | common/auth | 6408799 |
| 15 | JWT验证缺失 | codex-oauth | c495797 |

## 技术债务

| 问题 | 文件 | 风险 |
|------|------|------|
| Proxy getOwnPropertyDescriptor | adapter.js:944 | 中 |
| config API Key 不持久化 | config-manager.js | 低 |
| _acquireGlobalSemaphoreSync非原子 | provider-pool-manager.js:866 | 低 |

*最后更新: 2026-04-18*