# Task.md - 任务追踪与进度管理

> 规范驱动开发第三步：分解任务并跟踪进度

---

## 当前任务状态

### 正在进行
- [ ] 提升 LRU Cache TTL 至 3 小时（参考 Go 设计）
- [ ] 实现空 Cache Bucket 清理机制
- [ ] 提升核心模块测试覆盖率（utils/common.js, proxy-utils.js 等 0% 模块优先）
- [ ] 维护 CLAUDE.md 和 .agent/ 文档

### 已完成
- [x] 创建 .agent/ 目录结构
- [x] 测试基础设施搭建（1350 测试，33 套件全部通过）
- [x] 修复 wsrelay/index.test.js 动态 import 问题
- [x] Kimi OAuth 集成
- [x] iFlow 提供商支持恢复
- [x] LRU Adapter Cache 实现
- [x] Provider Pool Manager 重构
- [x] 健康检查定时器修复
- [x] 安全漏洞修复（日志脱敏、路径保护）
- [x] 多提供商支持（OpenAI/Claude/Gemini/Kimi/Grok/iFlow/Codex/Qwen）
- [x] LRU Cache TTL 优化（30分钟，参考 CLIProxyAPI 设计）
- [x] adapter.js 死代码清理
- [x] oauth-handlers.js 导出路径修复
- [x] Codex PR 审查问题修复
- [x] WSRelay 模块实现（Manager-Session 架构，64 测试）
- [x] health-check-timer.js 健康检查定时器模块（独立模块，30 测试）
- [x] 深度分析 CLIProxyAPI wsrelay/session.go 和 manager.go 设计
- [x] 深度分析 CLIProxyAPI cache/signature_cache.go 设计
- [x] FillFirstSelector 异步问题修复

---

## 项目结构

### 源码组织 (src/)
```
src/
├── auth/                    # 认证模块
│   ├── index.js
│   ├── oauth-handlers.js
│   ├── kimi-oauth.js        # Kimi OAuth
│   ├── kimi-oauth-handler.js
│   ├── kiro-oauth.js
│   ├── gemini-oauth.js
│   ├── codex-oauth.js
│   ├── qwen-oauth.js
│   └── iflow-oauth.js
├── converters/             # 格式转换器
│   ├── register-converters.js
│   ├── BaseConverter.js
│   ├── ConverterFactory.js
│   └── strategies/
│       ├── ClaudeConverter.js
│       ├── OpenAIConverter.js
│       ├── KimiConverter.js
│       ├── GeminiConverter.js
│       ├── CodexConverter.js
│       ├── GrokConverter.js
│       └── OpenAIResponsesConverter.js
├── core/                   # 核心模块
│   ├── config-manager.js
│   ├── plugin-manager.js
│   └── master.js
├── handlers/               # 请求处理器
│   └── request-handler.js
├── plugins/                # 插件
│   ├── api-potluck/
│   ├── ai-monitor/
│   └── default-auth/
├── providers/              # 提供商
│   ├── adapter.js         # 适配器（LRU Cache）
│   ├── provider-pool-manager.js
│   ├── provider-models.js
│   ├── selectors/index.js
│   ├── openai/
│   ├── claude/
│   ├── gemini/
│   ├── grok/
│   ├── forward/
│   └── kimi/
│       ├── kimi-core.js
│       ├── kimi-strategy.js
│       └── kimi-message-normalizer.js
├── services/              # 服务
│   ├── api-server.js
│   ├── service-manager.js
│   ├── ui-manager.js
│   ├── usage-service.js
│   └── health-check-timer.js
├── ui-modules/            # UI 模块
│   ├── auth.js
│   ├── config-api.js
│   ├── config-scanner.js
│   ├── event-broadcast.js
│   ├── oauth-api.js
│   ├── provider-api.js
│   ├── update-api.js
│   ├── usage-api.js
│   ├── usage-cache.js
│   ├── plugin-api.js
│   ├── system-api.js
│   └── system-monitor.js
├── utils/                 # 工具
│   ├── common.js
│   ├── constants.js
│   ├── logger.js
│   ├── provider-strategies.js
│   ├── provider-utils.js
│   ├── proxy-utils.js
│   └── tls-sidecar.js
├── scripts/               # 脚本
│   ├── kimi-token-refresh.js
│   ├── kiro-token-refresh.js
│   └── kiro-idc-token-refresh.js
└── convert/               # 转换脚本
    ├── convert.js
    └── convert-old.js
```

---

## 测试组织 (tests/)

### 单元测试 (tests/unit/)
```
tests/unit/
├── auth/
│   └── auth.test.js
├── converters/
│   ├── converter-utils.test.js
│   ├── kimi-converter.test.js
│   ├── openai-converter.test.js
│   └── claude-converter.test.js
├── core/
│   └── plugin-manager.test.js
├── handlers/
│   └── request-handler.test.js
├── plugins/
│   ├── api-potluck/
│   │   └── api-routes.test.js
│   └── ai-monitor.test.js
├── providers/
│   ├── adapter.test.js
│   ├── kimi-core.test.js
│   ├── kimi-message-normalizer.test.js
│   ├── kimi-strategy.test.js
│   ├── provider-pool-manager.test.js
│   ├── provider-pool-manager-deep.test.js
│   └── selectors.test.js
├── services/
│   ├── health-check-timer.test.js
│   └── usage-service.test.js
├── ui-modules/
│   ├── config-api.test.js
│   ├── config-manager.test.js
│   ├── event-broadcast.test.js
│   ├── oauth-api.test.js
│   ├── provider-data-sanitization.test.js
│   └── usage-cache.test.js
└── utils/
    ├── common.test.js
    ├── constants.test.js
    ├── logger.test.js
    ├── provider-strategies.test.js
    └── provider-utils.test.js
```

### 集成测试
```
tests/
├── provider-models.unit.test.js
└── security-fixes.unit.test.js
```

---

## 近期提交记录（pro 分支）

| 提交 | 描述 |
|------|------|
| 4c723ac | chore: remove .agent/ from gitignore - will track in git |
| 405095a | fix: 修复 Codex PR 审查发现的多项问题 |
| 3e99f36 | fix(auth): 恢复 iflow-oauth.js 的 refreshIFlowTokens 导出 |
| ba9865a | fix(auth): 修复 oauth-handlers.js 导出路径错误 |
| 5e2dde2 | perf(adapter): 优化 LRU Cache 实现 - 添加 TTL 滑动过期 |

---

### CLIProxyAPI 参考任务

参考路径: `E:\newCC\stick\AlClient-2-APIAlClient-2-API\CLIProxyAPI-6.9.15`

### Go vs Node.js 深度对比分析（2026-04-14，2026-04-15 持续）
- [x] 深度分析 CLIProxyAPI Go 实现 vs Node.js 实现
- [x] Auth 模块对比：Go接口 vs Node.js OAuth处理器
- [x] Store 模块对比：多后端 vs JSON文件
- [x] Translator 模块对比：blank import vs 显式注册
- [x] Usage 模块对比：聚合统计 vs Provider查询
- [x] Cache 模块对比：sync.Map分组 vs LRU Cache
- [x] WSRelay 模块对比：Manager-Session vs 无独立模块
- [x] WSRelay Session 优化：参考 Go 版本 pending request 处理（带缓冲 channel）

### Go 实现对标（2026-04-14，2026-04-15 持续）
- [x] 对比 Go `internal/cache/signature_cache.go` 设计，优化 Node.js LRU Cache TTL
- [x] 分析 Go 的分组 Cache + sync.Map + 滑动 TTL 架构，Node.js 已实现相似设计
- [x] 优化 WSRelay Session pending request 处理，参考 Go 版本使用带缓冲 channel
- [ ] 考虑借鉴 Go 的优雅关闭机制优化 Worker 进程退出

### Worker 进程异步句柄分析
**OAuth setInterval timer 分析：**
- [x] 分析 OAuth 模块的 setInterval timer 管理机制
- [x] 分析 Provider Core 模块的 setInterval timer 管理机制
- [x] 确认所有 pollTimer/checkInterval 都通过 clearInterval 正确清理
- [x] HTML 页面内 countdown setInterval 由浏览器管理，不影响 Node.js
- [x] 确认 codex-core.js 的 cleanupInterval 使用 .unref() 防止阻止进程退出

**结论：** 测试中出现的 Worker 进程警告是测试框架行为，非资源泄漏。

---

## 下一步工作

### 短期（1-3天）
1. [ ] 完善缺失测试的模块
2. [ ] 修复测试中的异步句柄警告
3. [ ] 更新 CLAUDE.md 文档

### 中期（1周）
1. [ ] 提升测试覆盖率至 90%+
2. [ ] 性能优化分析
3. [ ] 借鉴 Go 设计优化 Node.js 实现

### 长期
1. [ ] 完善错误处理和边界情况
2. [ ] 增强监控和可观测性
3. [ ] 文档完善

---

## 命令速查

```bash
# 开发
npm run start        # 启动服务
npm run start:dev    # 开发模式

# 测试
npm test             # 运行全部测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# Git
git status           # 查看状态
git log --oneline -10 # 最近提交
```

---

*最后更新: 2026-04-14*
