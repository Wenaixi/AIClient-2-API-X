# Task.md - 任务追踪与进度管理

> 规范驱动开发第三步：分解任务并跟踪进度

---

## 当前任务状态

### 正在进行
- [ ] 提升 usage-service.js 覆盖率（当前58%）
- [ ] 提升 logger.js 覆盖率（当前67%）
- [ ] 提升 forward-strategy.js 覆盖率（当前54%）
- [ ] 完善 wsrelay/index.js 测试
- [ ] 维护 CLAUDE.md 和 .agent/ 文档

### 已完成
- [x] 创建 .agent/ 目录结构
- [x] 测试基础设施搭建（1987 测试，52 套件全部通过）
- [x] Provider Strategy 测试覆盖（openai/claude/grok-strategy）
- [x] Provider *-core 测试覆盖（claude/grok/openai/gemini/qwen/iflow/antigravity-core）
- [x] Kimi OAuth 集成
- [x] iFlow 提供商支持恢复
- [x] LRU Adapter Cache 实现
- [x] Provider Pool Manager 重构
- [x] 健康检查定时器修复
- [x] 安全漏洞修复（日志脱敏、路径保护）
- [x] 多提供商支持（OpenAI/Claude/Gemini/Kimi/Grok/iFlow/Codex/Qwen）
- [x] LRU Cache TTL 优化（3小时，参考 CLIProxyAPI 设计）
- [x] LRU Cache TTL 测试完善（9 个 TTL 专项测试，滑动过期/过期清理）
- [x] adapter.js 死代码清理
- [x] oauth-handlers.js 导出路径修复
- [x] Codex PR 审查问题修复
- [x] WSRelay 模块实现（Manager-Session 架构，64 测试）
- [x] health-check-timer.js 健康检查定时器模块（独立模块，30 测试）
- [x] 深度分析 CLIProxyAPI wsrelay/manager.go 和 session.go 设计
- [x] 深度分析 CLIProxyAPI cache/signature_cache.go 设计
- [x] FillFirstSelector 异步问题修复
- [x] 空 Cache Bucket 清理分析 - **结论：不适用于当前单一 LRU Cache 设计**
- [x] utils/proxy-utils.js 测试覆盖（33 测试）
- [x] UI Modules 测试覆盖率提升（system-api/system-monitor/config-scanner/upload-config-api）
- [x] logger.test.js 测试修复与增强（79 测试全部通过）
- [x] CLIProxyAPI 6.9.15 深度分析（access/api/modules/amp/registry/runtime 模块）
- [x] CLIProxyAPI 6.9.15 完整目录结构分析

---

## 下一步优化计划（2026-04-19）

### 高优先级
1. **usage-service.js 覆盖率提升（58% → 80%+）**
   - 文件: `src/services/usage-service.js`
   - 现状: 58% 覆盖率
   - 目标: 80%+
   - 待测试: `getUsageStats()`, `getGroupedUsage()`, `clearExpiredCache()` 等

2. **logger.js 覆盖率提升（67% → 85%+）**
   - 文件: `src/utils/logger.js`
   - 现状: 67% 覆盖率
   - 目标: 85%+
   - 待测试: `formatMessage()`, `getLogStream()`, `LogRotate` 相关

3. **forward-strategy.js 覆盖率提升（54% → 80%+）**
   - 文件: `src/providers/forward/forward-strategy.js`
   - 现状: 54% 覆盖率
   - 目标: 80%+
   - 待测试: `ForwardProviderStrategy` 核心逻辑

### 中优先级
4. **wsrelay/index.js 导出测试完善**
   - 文件: `src/wsrelay/index.js`
   - 现状: 103 行代码，0% 覆盖率
   - 目标: 80%+
   - 待测试: 导出验证、createHandler 逻辑

5. **kimi-strategy.js 覆盖率提升**
   - 文件: `src/providers/kimi/kimi-strategy.js`
   - 现状: 87-91% 覆盖率
   - 目标: 95%+

### 低优先级（后续迭代）
6. **services/api-server.js 测试覆盖（当前0%）**
7. **scripts/*.js 测试覆盖（当前0%）**
8. **ui-modules/usage-api.js 测试覆盖（当前0%）**

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
└── wsrelay/               # WebSocket 代理
    ├── index.js           # 导出模块
    └── manager.js         # 核心实现
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
│   ├── selectors.test.js
│   ├── forward.test.js
│   ├── claude-strategy.test.js
│   ├── claude-core.test.js
│   ├── gemini-strategy.test.js
│   ├── gemini-core.test.js
│   ├── grok-strategy.test.js
│   ├── grok-core.test.js
│   ├── openai-strategy.test.js
│   ├── openai-core.test.js
│   ├── qwen-core.test.js
│   ├── iflow-core.test.js
│   └── antigravity-core.test.js
├── services/
│   ├── health-check-timer.test.js
│   └── usage-service.test.js
├── ui-modules/
│   ├── config-api.test.js
│   ├── config-manager.test.js
│   ├── config-scanner.test.js
│   ├── event-broadcast.test.js
│   ├── oauth-api.test.js
│   ├── provider-data-sanitization.test.js
│   ├── system-api.test.js
│   ├── system-monitor.test.js
│   ├── upload-config-api.test.js
│   └── usage-cache.test.js
├── utils/
│   ├── common.test.js
│   ├── common-import.test.js
│   ├── constants.test.js
│   ├── logger.test.js
│   ├── provider-strategies.test.js
│   ├── provider-utils.test.js
│   ├── proxy-utils.test.js
│   └── token-utils.test.js
└── wsrelay/
    ├── index.test.js
    └── manager.test.js
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
| 8fb381d | chore: 更新最后更新时间 |
| babef25 | chore: 更新 CLAUDE.md 和 Task.md 文档 |
| 7e6e57c | test(providers): 新增 qwen-core 测试，完善 providers 测试覆盖 |
| f510384 | chore: 清理临时日志目录 |
| b5d4343 | feat(tests): 新增 antigravity/iflow-core 测试，完善 providers 测试覆盖 |
| e71422c | fix(tests): 修复 logger.test.js 并增强测试覆盖 |
| 177ff56 | test(ui-modules): 新增 system-api/system-monitor/config-scanner/upload-config-api 单元测试 |

---

## CLIProxyAPI 参考任务

参考路径: `E:\newCC\stick\AlClient-2-APIAlClient-2-API\CLIProxyAPI-6.9.15`

### Go vs Node.js 深度对比分析
- [x] 深度分析 CLIProxyAPI Go 实现 vs Node.js 实现
- [x] Auth 模块对比：Go接口 vs Node.js OAuth处理器
- [x] Store 模块对比：多后端 vs JSON文件
- [x] Translator 模块对比：blank import vs 显式注册
- [x] Usage 模块对比：聚合统计 vs Provider查询
- [x] Cache 模块对比：sync.Map分组 vs LRU Cache ✅ 已对齐
- [x] WSRelay 模块对比：Manager-Session vs 无独立模块 ✅ 已对齐
- [x] WSRelay Session 优化：参考 Go 版本 pending request 处理 ✅ 已实现
- [x] access 模块对比：API Key 访问控制 vs 现有 OAuth
- [x] api/modules/amp 对比：SecretSource vs 现有 adapter
- [x] registry 模块对比：远程模型目录 vs 现有硬编码模型列表
- [x] runtime/executor 对比：独立 helps 工具模块 vs 现有分散 core
- [x] CLIProxyAPI 6.9.15 完整目录结构分析（access/api/auth/cache/config/constant/interfaces/logging/registry/runtime/store/thinking/translator/usage/util/watcher/wsrelay）

---

## 当前测试状态（2026-04-19）

```
Test Suites: 52 passed, 52 total
Tests:       1987 passed, 1987 total
Time:        ~41s
```

---

## 命令速查

```bash
# 开发
npm run start        # 启动服务
npm run start:dev    # 开发模式

# 测试
npm test             # 运行全部测试（1987 测试通过）
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# Git
git status           # 查看状态
git log --oneline -10 # 最近提交
```

---

*最后更新: 2026-04-19*
