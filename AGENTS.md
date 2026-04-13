# AGENTS.md - 项目记忆与开发思路

> 记录项目状态、开发思路和决策历史
> 最后更新: 2026-04-15

---

## 项目概述

AIClient-2-API 是一个 Node.js 多模型统一接口 API 代理服务，支持 OpenAI、Claude、Gemini、Kimi、Grok、iFlow、Codex、Qwen 等多种 AI 模型提供商。

### 项目身份
| 属性 | 值 |
|------|-----|
| 项目名称 | AIClient-2-API |
| 项目路径 | `E:\newCC\stick\AlClient-2-APIAlClient-2-API\AIClient-2-API` |
| 当前分支 | `pro` |
| 上游仓库 | https://github.com/justlovemaki/AIClient-2-API |
| Fork仓库 | https://github.com/Wenaixi/AIClient-2-API-X |

### 技术栈
- **运行时**: Node.js (ES Modules)
- **测试**: Jest + Babel
- **HTTP客户端**: Axios
- **WebSocket**: ws
- **代理**: socks-proxy-agent, https-proxy-agent

---

## 开发思路

### 规范驱动开发流程
```
Requirement.md (需求规范) → Design.md (技术设计) → Task.md (任务追踪) → 代码实现 → 单元测试
```

### 核心设计原则
1. **模块化** - 功能解耦，文件独立
2. **专业化** - 规范驱动，文档先行
3. **人性化** - 代码清晰，注释友好
4. **严谨性** - 测试覆盖，错误处理完善

### 自主工作模式
- **无需询问，自主决策执行**
- 代码修复、Bug修复、功能实现直接执行
- 测试驱动开发(TDD)：修复后立即运行测试验证
- 提交前确保测试通过

### Git 分支策略
```
upstream/main → origin/main(main分支) → 纯净上游代码
      ↓
origin/pro → 深度定制分支（所有开发在此分支进行）
```
- `main` = 纯净上游追踪分支
- `pro` = 定制开发分支
- 同步上游使用 `git merge`，禁止 rebase

---

## 项目状态快照

### 测试状态（2026-04-15）
```
Test Suites: 34 passed, 34 total
Tests:       1391 passed, 1391 total
Time:        ~35s
```

### 已完成优化（2026-04-15）
1. **LRU Cache TTL 提升至 3 小时** - 与 Go 版本 CLIProxyAPI 一致
2. **WSRelay 模块实现** - Manager-Session 架构，64 测试
3. **health-check-timer.js 独立模块** - 30 测试
4. **adapter.js 死代码清理** - 删除未定义引用
5. **oauth-handlers.js 导出修复** - 按提供商拆分导入
6. **proxy-utils.js 测试覆盖** - 33 测试用例

### 测试覆盖率（2026-04-15）
| 模块 | 覆盖率 | 状态 |
|------|--------|------|
| providers/kimi/* | 87-91% | ✅ 良好 |
| providers/selectors | 91% | ✅ 良好 |
| utils/constants | 100% | ✅ 完美 |
| utils/provider-strategies | 100% | ✅ 完美 |
| services/health-check-timer | 81-88% | ✅ 良好 |
| wsrelay/manager.js | 76% | ✅ 良好 |
| providers/adapter | 较好 | ✅ |
| providers/openai/* | 0% | ⚠️ 待提升 |
| providers/gemini/* | 0% | ⚠️ 待提升 |
| providers/grok/* | 0% | ⚠️ 待提升 |
| providers/forward/* | 0% | ⚠️ 待提升 |

---

## CLIProxyAPI 参考架构

参考路径: `E:\newCC\stick\AlClient-2-APIAlClient-2-API\CLIProxyAPI-6.9.15`

### Go vs Node.js 对比总结（2026-04-15）

| 模块 | Go (CLIProxyAPI) | Node.js (AIClient) | 状态 |
|------|------------------|---------------------|------|
| Cache | sync.Map + 滑动 TTL + 3小时 | ✅ LRU Cache + TTL (3小时) | 已完成 |
| WSRelay | Manager-Session 分层 | ✅ 已实现 | 已完成 |
| Auth | 极简接口 | OAuth 处理器分散 | 观察中 |
| Store | Git/Postgres/Object | JSON 文件 | 不适用 |
| Usage | 聚合统计 + 快照 | Provider 查询 | 观察中 |

### 可借鉴的 Go 设计
1. **缓存设计** - 分组 + sync.Map + 滑动 TTL + 3小时 → ✅ Node.js LRU Cache 已对齐
2. **WS管理** - Manager-Session 分层 + 优雅关闭 + 带缓冲 channel → ✅ 已实现
3. **Store 抽象** - 多后端支持 → 不适用当前场景
4. **统计聚合** - 快照 + 去重 + Merge → 观察中

---

## 决策记录

### 2026-04-15 决策

#### 1. LRU Cache TTL 提升至 3 小时
**决策**: Adapter LRU Cache TTL 从 30 分钟提升至 3 小时
**原因**: 与 Go 版本 CLIProxyAPI `signature_cache.go` 保持一致
**实现**:
- SignatureCacheTTL = 3 * time.Hour
- CacheCleanupInterval = 10 * time.Minute
- 滑动过期每次访问刷新 Timestamp
- 空组删除机制不适用于单一 LRU Cache 设计（已分析）

#### 2. WSRelay 模块完整实现
**决策**: 参考 Go 版本完整实现 WSRelay Manager-Session 架构
**原因**: 提供更好的 WebSocket 连接管理和优雅关闭
**实现**:
- WSRelayManager 管理所有 WebSocket 会话
- WSSession 管理单个会话生命周期
- 30s 心跳间隔，`.unref()` 防止阻止进程退出
- 带缓冲的 channel（maxBufferSize: 8）防止消息丢失
- `_cleanupOnce` 保护防止重复 cleanup

#### 3. 空 Cache Bucket 清理分析
**决策**: 不实现空 Cache Bucket 删除机制
**原因**: Node.js 单一 LRU Cache设计与 Go 分组 Map 架构不同
- Go 使用 `sync.Map (groupKey -> groupCache)` 分组架构
- Node.js 使用单一固定大小 LRU Cache，满时自动淘汰最旧条目
- 空组删除只适用于分组 Map 架构，不适用于当前设计

#### 4. Worker 进程警告分析
**决策**: 确认警告非资源泄漏，不需要修复
**原因**:
- OAuth 异步流程在测试环境中触发
- 所有 timer 都正确使用 clearInterval 清理
- HTML countdown timer 由浏览器管理，不影响 Node.js
- Provider Core 模块的 checkInterval 通过 clearInterval + setTimeout 超时机制清理

---

## 测试策略

### 测试配置
```javascript
{
  testEnvironment: 'node',
  transform: { '^.+\\.js$': 'babel-jest' },
  testTimeout: 30000,
  setupFiles: ['./tests/setup.js']
}
```

### 测试文件组织
- `tests/unit/` - 单元测试（34 套件）
- `tests/setup/` - Jest 全局设置/清理
- `tests/factories/` - 测试工厂
- `tests/mocks/` - Mock 辅助
- `tests/helpers/` - 测试辅助函数

### 运行测试
```bash
npm test              # 运行全部测试（1391 测试）
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
npm test -- --detectOpenHandles  # 检测异步句柄泄漏
```

---

## 问题排查

### 常见问题

#### 1. 模块导入失败
**症状**: `Cannot find module`
**排查**:
- 检查文件路径是否正确
- 确认 ES Module (.js) 后缀
- 检查 package.json 的 exports 字段

#### 2. Timer 警告
**症状**: `A worker process has failed to exit gracefully`
**排查**:
- 运行 `npm test -- --detectOpenHandles`
- 检查 setInterval 是否都有 clearInterval
- 确认 timer 使用 `.unref()`
- **注意**: OAuth 页面内 countdown timer 由浏览器管理，不影响 Node.js

#### 3. 测试失败
**症状**: Tests failed
**排查**:
- 检查 mock 是否正确配置
- 确认异步操作正确处理
- 查看 jest output 的具体错误

---

## 文件索引

### 规范文档
| 文件 | 职责 |
|------|------|
| `CLAUDE.md` | 开发规范摘要 |
| `Requirement.md` | 需求规范与验收标准 |
| `Design.md` | 技术设计与架构决策 |
| `Task.md` | 任务追踪与进度管理 |
| `AGENTS.md` | 本文件，项目记忆 |

### 核心源码
| 路径 | 职责 |
|------|------|
| `src/providers/adapter.js` | 提供商适配器 + LRU Cache (3小时 TTL) |
| `src/providers/provider-pool-manager.js` | 提供商池管理 |
| `src/services/health-check-timer.js` | 健康检查定时器（独立模块） |
| `src/wsrelay/manager.js` | WebSocket 代理管理（Manager-Session 架构） |
| `src/auth/oauth-handlers.js` | OAuth 处理器入口 |
| `src/converters/` | 请求/响应格式转换器 |

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2026-04-14 | 初始版本，核心功能需求定义 |
| 2026-04-15 | WSRelay 模块、LRU Cache TTL 3小时优化、健康检查定时器独立模块、文档更新 |

---

*最后更新: 2026-04-15*
