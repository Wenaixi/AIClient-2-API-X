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

## 测试状态 (2026-04-15 上午)

```
Test Suites: 51 passed, 51 total
Tests:       2032 passed, 2032 total
Time:        ~37s
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

## 测试状态分析 (2026-04-15 下午)

### 覆盖率低的原因分析

| 函数 | 源码行数 | 说明 |
|------|----------|------|
| handleStreamRequest | ~350行 | 集成级流式处理函数，涉及复杂异步流处理、外部服务调用 |
| handleUnaryRequest | ~250行 | 集成级 unary 处理函数，涉及重试逻辑、错误处理 |
| handleContentGenerationRequest | ~130行 | 通用请求处理，内部调用 handleStreamRequest/handleUnaryRequest |
| handleModelListRequest | ~110行 | 模型列表处理，涉及提供商池管理 |

**结论**：这些函数是集成级别的（调用外部服务、处理复杂异步流），不适合直接单元测试。正确做法是通过集成测试或端到端测试覆盖。

**已覆盖的工具函数**（测试通过）：
- RETRYABLE_NETWORK_ERRORS / isRetryableNetworkError
- getProtocolPrefix / formatExpiryTime / formatExpiryLog
- formatLog / getClientIp / getMD5Hash / formatToLocal
- findByPrefix / hasByPrefix / getBaseType
- extractSystemPromptFromRequestBody / escapeHtml / safeCompare / isAuthorized

---

## pro 分支对比 main 主要变更

### 新增功能
1. **Kimi OAuth** - 完整 Device Flow 实现 + kimi-oauth-handler.js
2. **Kimi Provider** - kimi-core.js, kimi-strategy.js, kimi-message-normalizer.js
3. **WSRelay Manager** - Manager-Session 双层架构 (参考 Go 版)
4. **LRU Cache TTL 3小时** - 与 CLIProxyAPI 对齐
5. **配置快照恢复** - JSON 解析失败时自动从快照恢复
6. **分区配置管理** - saveSectionConfig/resetSectionConfig

### 架构优化
1. **Provider Pool Manager 重构**
   - 信号量模式替代 activeProviderRefreshes
   - 429 指数退避机制
   - 冷却队列 per-provider 控制
   - REFRESH_LEAD_CONFIG per-provider 刷新提前期

2. **Health Check Timer** - 完善定时健康检查
3. **默认健康检查间隔** - 从 10 分钟优化为 5 分钟

### 安全修复
1. XSS 防护 - escapeHtml 统一处理
2. 时序安全比较 - safeCompare() 替代直接字符串比较
3. 日志脱敏 - sanitizeLog() 覆盖 token/api_key 等敏感字段
4. 请求体大小限制 - MAX_BODY_SIZE 10MB

### 移除/废弃
1. **iFlow Provider** - 已从 pro 分支移除 (configs/provider_pools.json.example)
2. **AGENTS.md** - 已迁移到 .agent 目录

---

## 待优化项

| 模块 | 当前覆盖 | 目标 | 优先级 |
|------|----------|------|--------|
| utils/common.js | 20% | 60%+ | 🔴 高 |
| utils/logger.js | 67% | 85%+ | 🟡 中 |
| ui-modules/* | 13-73% | 60%+ | 🟡 中 |
| wsrelay/manager.js | 75% | 85%+ | 🟡 中 |

---

## 最近提交 (pro 分支)

| 提交 | 说明 |
|------|------|
| b7f0f8f | fix(timer): 修复 gemini-core 和 qwen-core 中 setInterval 未调用 .unref() |
| 747e597 | docs: 更新 .agent 文档 - Timer 泄漏修复记录 |
| 3827fea | fix(timer): 修复多处 setInterval 未调用 .unref() 导致的 Timer 泄漏 |
| 4eb5da0 | docs: 更新测试覆盖率分析 - 解释 common.js 低覆盖率原因 |
| 00d2135 | docs: 更新 .agent 文档 (Requirement.md/Design.md/Task.md) |

---

## Timer 泄漏修复 (2026-04-15)

### 修复的 setInterval 列表
- `src/auth/gemini-oauth.js` - pollTimer (OAuth 轮询)
- `src/auth/codex-oauth.js` - pollTimer (OAuth 轮询)
- `src/plugins/api-potluck/api-routes.js` - rateLimitCleanupTimer (限流清理)
- `src/providers/gemini/antigravity-core.js` - checkInterval (OAuth 检查)

### 修复方法
在所有 `setInterval` 调用后添加 `.unref()` 防止定时器阻止进程退出：
```javascript
const timer = setInterval(/* ... */);
if (timer.unref) timer.unref();
```

### 测试状态
```
Test Suites: 51 passed, 51 total
Tests:       2032 passed, 2032 total
Time:        ~35s
```

*最后更新: 2026-04-15 下午*
