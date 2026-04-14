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
| 最后更新 | 2026-04-15 晨间 |

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
npm test             # 运行全部测试
npm run test:coverage # 覆盖率报告
git merge main      # 合并上游到当前分支
```

---

## 自主工作模式

- 代码修复、Bug修复、功能实现**直接执行**
- 测试驱动开发(TDD)：修复后立即运行测试验证
- **bypass permissions：始终启用，无需确认**
- 保持main纯净，仅在pro分支工作

---

## 测试状态 (2026-04-15)

```
Test Suites: 51 passed, 51 total
Tests:       2003 passed, 2003 total
Time:        ~48s (with coverage)
```

### 覆盖率概况

| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/* | 87-100% | Kimi/Claude/Grok/Forward 高覆盖 |
| wsrelay/* | 75-76% | manager.js 需提升 |
| services/* | 81-91% | health-check-timer/usage-service |
| ui-modules/* | 13-73% | 部分模块覆盖率偏低 |
| utils/* | 28-67% | common.js(20%)/logger.js(67%) 需提升 |
| auth/* | 高 | OAuth模块覆盖良好 |

---

## pro 分支对比 main 主要变更

### 新增功能
1. **Kimi OAuth** - 完整 Device Flow 实现 + kimi-oauth-handler.js
2. **Kimi Provider** - kimi-core.js, kimi-strategy.js, kimi-message-normalizer.js
3. **WSRelay Manager** - Manager-Session 双层架构 (参考 Go 版)
4. **LRU Cache TTL 3小时** - 与 CLIProxyAPI 对齐

### 架构优化
1. **Provider Pool Manager 重构**
   - 信号量模式替代 activeProviderRefreshes
   - 429 指数退避机制
   - 冷却队列 per-provider 控制
   - REFRESH_LEAD_CONFIG per-provider 刷新提前期

2. **Health Check Timer** - 完善定时健康检查

### 安全修复
1. XSS 防护 - escapeHtml 统一处理
2. 时序安全比较 - safeCompare() 替代直接字符串比较
3. 日志脱敏 - sanitizeLog() 覆盖 token/api_key 等敏感字段
4. 请求体大小限制 - MAX_BODY_SIZE 10MB

### 移除/废弃
1. **iFlow Provider** - 已从 pro 分支移除 (configs/provider_pools.json.example)

---

## 待优化项

| 模块 | 当前覆盖 | 目标 | 优先级 |
|------|----------|------|--------|
| utils/common.js | 20% | 60%+ | 🔴 高 |
| utils/logger.js | 67% | 85%+ | 🟡 中 |
| ui-modules/* | 13-73% | 60%+ | 🟡 中 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 中 |

---

*最后更新: 2026-04-15 晨间*
