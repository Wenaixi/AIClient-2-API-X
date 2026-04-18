# Design.md - 技术设计

## 系统架构

```
Client → API Server → Handler → Adapter → Provider Pool
```

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| Adapter | adapter.js | LRU Cache, 3h TTL, 滑动过期 |
| Provider Pool | provider-pool-manager.js | 信号量, 429退避, 冷却队列 |
| Selectors | selectors/index.js | Score/RoundRobin/FillFirst |
| Health Timer | health-check-timer.js | 5分钟间隔 |
| WSRelay | wsrelay/manager.js | Manager-Session双层架构 |

## Go对齐设计

### LRU Cache (signature_cache.go)
- 3h TTL ✅
- 滑动过期 ✅
- maxSize: 50

### WSRelay (manager.go + session.go)
- 双层架构 ✅
- 30s心跳 ✅
- maxBufferSize: 8 ✅
- closeOnce防重复 ✅

## 安全设计

| 项目 | 实现 | 状态 |
|------|------|------|
| 日志脱敏 | maskKey() | ✅ |
| XSS防护 | escapeHtml() | ✅ |
| 时序安全 | safeCompare() | ✅ |
| 请求限制 | MAX_BODY_SIZE 10MB | ✅ |

## Provider Pool架构

### 信号量模式
```javascript
refreshSemaphore = {
    global: 16,      // 全局并发
    perProvider: 4   // 每provider并发
}
```

### 429退避
```javascript
quotaBackoff = {
    base: 1000,     // 1s
    max: 1800000   // 30min
}
```

## Kimi OAuth

- 设备流: device_code → user_code → token
- 阈值: 5分钟刷新
- 环境变量: KIMI_CLIENT_ID

## Bug修复

| 模块 | Bug数 | 状态 |
|------|-------|------|
| WSRelay Manager | 13 | ✅ |
| LRU Cache | 4 | ✅ |
| 安全相关 | 6 | ✅ |

*最后更新: 2026-04-18*