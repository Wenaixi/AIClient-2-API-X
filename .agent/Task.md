# Task.md - 任务追踪与进度管理

> 规范驱动开发第三步：分解任务并跟踪进度
> **最后更新：2026-04-19**

---

## 当前任务状态总览

### 🔴 高优先级（影响稳定性）
- [ ] logger.js 覆盖率提升（67% → 85%+）
- [ ] utils/common.js 覆盖率提升（20% → 60%+）

### 🟡 中优先级（影响安全性）
- [ ] OAuth 错误处理一致性（codex-oauth 无 try-catch）
- [ ] escapeHtml 调用一致性检查

### 🟢 低优先级（代码优化）
- [ ] Kimi OAuth 日志冗余（多层嵌套 debug）
- [ ] 硬编码配置目录（KIMI_CONFIG_DIR）

---

## 测试覆盖率提升计划

### 当前测试状态（2026-04-19）
```
Test Suites: 51 passed, 51 total
Tests:       2004 passed, 2004 total
Time:        ~39s
```

### 目标测试状态（2026-04-25）
```
Test Suites: 55+ passed
Tests:       2100+ passed
覆盖率目标: 核心模块 90%+
```

---

## 详细任务列表

### 1. logger.js 覆盖率提升（高优先级）
**文件**: `src/utils/logger.js`
**当前**: 67%
**目标**: 85%+
**待覆盖方法**:
- [ ] `formatMessage()` - 日志格式化
- [ ] `getLogStream()` - 日志流获取
- [ ] `LogRotate` 类 - 日志轮转逻辑
- [ ] `sanitizeLog()` - 脱敏逻辑边界情况

**测试策略**:
```javascript
// 1. formatMessage 边界测试
// - 空消息
// - 特殊字符
// - 超长消息

// 2. getLogStream 状态测试
// - 文件不存在
// - 文件可写/不可写

// 3. LogRotate 轮转测试
// - maxSize 触发
// - maxFiles 清理
// - 异步写入竞态
```

### 2. utils/common.js 覆盖率提升（高优先级）
**文件**: `src/utils/common.js`
**当前**: 20%
**目标**: 60%+
**待覆盖方法**:
- [ ] `escapeHtml()` - HTML转义
- [ ] `findByPrefix()` - 前缀查找
- [ ] `hasByPrefix()` - 前缀存在检查
- [ ] `getDeviceIdAsync()` - 异步设备ID
- [ ] `hashString()` - 字符串哈希

**测试策略**:
```javascript
// 1. escapeHtml 边界测试
// - 空字符串
// - 包含 < > & " ' 字符
// - 嵌套标签
// - 多字节字符（中文/Emoji）

// 2. 前缀查找测试
// - 匹配前缀
// - 不匹配前缀
// - 空数组
// - 大小写敏感

// 3. hashString 测试
// - 相同输入相同输出
// - 不同输入不同输出
// - 空字符串
```

### 3. OAuth 错误处理一致性（中优先级）
**文件**: `src/auth/codex-oauth.js`
**问题**: 直接 `await autoLinkProviderConfigs()` 无 try-catch 包装

**修复方案**:
```javascript
// 当前代码（有问题）
await autoLinkProviderConfigs(CONFIG, {
    onlyCurrentCred: true,
    credPath: credentials.relativePath
});

// 修复后（一致）
try {
    await autoLinkProviderConfigs(CONFIG, {
        onlyCurrentCred: true,
        credPath: credentials.relativePath
    });
} catch (err) {
    logger.error('[Codex Auth] autoLinkProviderConfigs failed:', err.message);
}
```

**涉及文件**:
- [ ] `codex-oauth.js` - 第1014-1022行 `handleCodexOAuthCallback`
- [ ] 检查其他 OAuth handlers 是否存在类似问题

### 4. Kimi OAuth 日志优化（低优先级）
**文件**: `src/auth/kimi-oauth-handler.js`
**问题**: 多层嵌套 debug 日志影响性能

**优化方案**:
```javascript
// 移除冗余 debug 日志，保留关键 info/warn
// 当前（冗余）
logger.debug('[Kimi OAuth] checkKimiAuthStatus called');
logger.debug('[Kimi OAuth] Client created, deviceId:', await client.getDeviceIdAsync());
logger.debug('[Kimi OAuth] exchangeDeviceCode result:', ...);

// 优化后（精简）
// 移除所有中间 debug，仅保留关键步骤
```

### 5. 硬编码配置目录（中优先级）
**文件**: `src/auth/kimi-oauth-handler.js`
**问题**: `const KIMI_CONFIG_DIR = 'configs/kimi';`

**修复方案**:
```javascript
// 从 config-manager 获取配置目录
import { CONFIG } from '../core/config-manager.js';
const kimiConfigDir = CONFIG.get('KIMI_CONFIG_DIR') || 'configs/kimi';
```

---

## 项目结构（已更新）

### 源码组织 (src/)
```
src/
├── auth/                    # 认证模块
│   ├── index.js
│   ├── oauth-handlers.js
│   ├── kimi-oauth.js        # Kimi OAuth (493行)
│   ├── kimi-oauth-handler.js # Kimi OAuth 处理器 (580行)
│   ├── kiro-oauth.js
│   ├── gemini-oauth.js
│   ├── codex-oauth.js
│   ├── qwen-oauth.js
│   └── iflow-oauth.js
├── converters/             # 格式转换器
│   ├── register-converters.js
│   └── strategies/
│       ├── ClaudeConverter.js
│       ├── OpenAIConverter.js
│       ├── KimiConverter.js (181行)
│       ├── GeminiConverter.js
│       ├── CodexConverter.js
│       ├── GrokConverter.js
│       └── OpenAIResponsesConverter.js
├── providers/              # 提供商
│   ├── adapter.js         # 适配器（LRU Cache）
│   ├── provider-pool-manager.js (921行)
│   ├── provider-models.js
│   ├── selectors/index.js (204行) - Score/RoundRobin/FillFirst 选择器
│   ├── openai/
│   ├── claude/
│   ├── gemini/
│   ├── grok/
│   ├── forward/
│   └── kimi/
│       ├── kimi-core.js (493行)
│       ├── kimi-strategy.js (356行)
│       └── kimi-message-normalizer.js (152行)
├── services/              # 服务
│   ├── api-server.js (101行 + 定制)
│   ├── service-manager.js
│   ├── ui-manager.js
│   ├── usage-service.js
│   └── health-check-timer.js (326行)
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
│   ├── common.js          # ⚠️ 20% 覆盖率
│   ├── constants.js
│   ├── logger.js          # ⚠️ 67% 覆盖率
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
    └── manager.js         # Manager-Session 双层架构
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
│   ├── common.test.js         # ⚠️ 待增强
│   ├── common-import.test.js
│   ├── constants.test.js
│   ├── logger.test.js         # ⚠️ 待增强
│   ├── provider-strategies.test.js
│   ├── provider-utils.test.js
│   ├── proxy-utils.test.js
│   └── token-utils.test.js
└── wsrelay/
    ├── index.test.js
    └── manager.test.js
```

---

## 近期提交记录（pro 分支）

| 提交 | 描述 |
|------|------|
| e6fc049 | Merge main into pro (v2.14.2) - 深度合并上游更新 |
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
- [x] CLIProxyAPI 6.9.15 完整目录结构分析

---

## 命令速查

```bash
# 开发
npm run start        # 启动服务
npm run start:dev    # 开发模式

# 测试
npm test             # 运行全部测试（2004 测试通过）
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# Git
git status           # 查看状态
git log --oneline -10 # 最近提交
```

---

*最后更新: 2026-04-19*
