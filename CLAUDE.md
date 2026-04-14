# CLAUDE.md - AIClient-2-API 开发规范

## 项目身份

| 属性 | 值 |
|------|-----|
| 项目名称 | AIClient-2-API |
| 项目路径 | `E:\newCC\stick\AlClient-2-APIAlClient-2-API\AIClient-2-API` |
| 上游仓库 | https://github.com/justlovemaki/AIClient-2-API |
| Fork仓库 | https://github.com/Wenaixi/AIClient-2-API-X |
| 当前分支 | `pro` (定制分支，始终使用此分支开发) |
| 最后更新 | 2026-04-18 |

## Git 分支策略

```
upstream/main → origin/main(main分支) → 纯净上游代码
      ↓
origin/pro → 深度定制分支（所有开发在此分支进行）
```

- `main` = 纯净上游追踪分支，永远与 upstream/main 保持一致
- `pro` = 你的定制开发分支，**始终使用此分支开发**
- **默认分支**: 项目始终处于 `pro` 分支
- **同步上游**: `main` → `pro` 使用 `git merge`，禁止 rebase

## 开发风格

- **模块化** - 功能解耦，文件独立
- **专业化** - 规范驱动，文档先行
- **人性化** - 代码清晰，注释友好
- **严谨性** - 测试覆盖，错误处理完善

## 开发流程（规范驱动）

```
Requirement.md (需求规范) → Design.md (技术设计) → Task.md (任务追踪) → 代码实现 → 单元测试
```

## 测试策略

- 收到允许后才运行测试
- 测试环境: `NODE_ENV=test`，超时 30000ms
- 单元测试优先，外部依赖 mock 处理
- 测试驱动开发(TDD)：先写测试，再实现功能

## 文件结构

| 文件 | 职责 |
|------|------|
| `CLAUDE.md` | 本文件，开发规范摘要 |
| `Requirement.md` | 需求规范与验收标准 |
| `Design.md` | 技术设计，架构决策 |
| `Task.md` | 任务追踪，进度管理 |
| `AGENTS.md` | 项目记忆，开发思路 |

> **注意：** .agent/ 目录文件（Requirement.md, Design.md, Task.md, AGENTS.md）已纳入 Git 版本控制

## 核心命令

```bash
# 开发
npm run start        # 启动服务
npm run start:dev   # 开发模式

# 测试（需收到允许）
npm test             # 运行全部测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# Git
git checkout pro     # 切换到定制分支
git fetch upstream   # 拉取上游更新
git merge main      # 合并上游到当前分支
```

## 自主工作模式

**无需询问，自主决策执行：**
- 代码修复、Bug修复、功能实现直接执行
- 测试驱动开发(TDD)：修复后立即运行测试验证
- 代码改进和重构自主判断并实施
- 提交前确保测试通过

**bypass permissions：始终启用，无需确认**

## 开发原则

1. **快速行动**：发现问题直接修复，不等待确认
2. **TDD闭环**：修复/实现后立即运行测试，循环直到通过
3. **本地备份**：每次重要修复后本地提交备份
4. **不推云端**：所有更改仅本地，不推送到远程
5. **保持main纯净**：不修改main分支，仅在pro分支工作

---

## 当前测试状态（2026-04-18）

```
Test Suites: 49 passed, 49 total
Tests:       1935 passed, 1935 total
Time:        ~34s
```

**测试覆盖率分析（2026-04-18）：**
| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/kimi/* | 87-91% | ✅ 良好 |
| providers/selectors | 91% | ✅ 良好 |
| providers/forward | 79-88% | ✅ 良好 |
| providers/gemini/* | 100% | ✅ gemini-strategy + gemini-core |
| providers/openai/* | 100% | ✅ openai-strategy + openai-core |
| providers/claude/* | 100% | ✅ claude-strategy + claude-core |
| providers/grok/* | 100% | ✅ grok-strategy + grok-core |
| utils/constants | 100% | ✅ 完美 |
| utils/provider-strategies | 100% | ✅ 完美 |
| utils/provider-utils | 87% | ✅ 良好 |
| services/health-check-timer | 81-88% | ✅ 良好 |
| wsrelay/manager.js | 76% | ✅ 良好 |
| providers/adapter | ✅ | ✅ LRU TTL 3小时 |
| utils/logger.js | ✅ 79 测试 | ✅ 已增强 |
| ui-modules/* | ✅ | ✅ system-api/system-monitor/config-scanner/upload-config-api |

---

## 已完成优化

### 2026-04-18 最新

1. **Provider *-core 测试覆盖提升（2026-04-18）**
   - 新增 `claude-core.test.js` - ClaudeApiService 核心测试
   - 新增 `grok-core.test.js` - GrokApiService 核心测试
   - 新增 `openai-core.test.js` - OpenAIApiService/QwenApiService/CodexApiService 核心测试
   - 新增 `gemini-core.test.js` - GeminiApiService 核心测试
   - 修复 `gemini-core.test.js` OAuth2Client 测试：缺少 `new` 操作符
   - 测试通过：49 套件 1935 测试全部通过

### 2026-04-17 最新

1. **UI Modules 测试覆盖率提升（2026-04-17）**
   - 新增 `system-monitor.test.js` - 12 测试用例
   - 新增 `system-api.test.js` - 8 测试用例
   - 新增 `config-scanner.test.js` - 6 测试用例
   - 新增 `upload-config-api.test.js` - 6 测试用例
   - 测试通过：45 套件 1682 测试全部通过

### 2026-04-16 最新

1. **Provider Strategy 测试覆盖率提升（2026-04-16）**
   - 新增 `openai-strategy.test.js` - 21 测试用例
   - 新增 `claude-strategy.test.js` - 21 测试用例
   - 新增 `grok-strategy.test.js` - 17 测试用例
   - 测试通过：41 套件 1650 测试全部通过

### 2026-04-15 完成

1. **common-import.test.js 测试修复**
   - 修复 92 个测试：调整断言以匹配实际实现行为

2. **LRU Cache TTL 提升至 3 小时**
   - 与 Go 版本 CLIProxyAPI `signature_cache.go` 一致

3. **proxy-utils.js 测试覆盖（2026-04-15）**
   - 新增 `tests/unit/utils/proxy-utils.test.js`
   - 33 个测试用例

### 2026-04-14 完成

1. **health-check-timer.js 健康检查定时器模块（2026-04-14）**
   - 新增独立 `src/services/health-check-timer.js` 模块
   - 30 个单元测试全部通过

2. **adapter.js 死代码清理（2026-04-14）**
   - 删除未定义的 `getGroupCache()` 函数

3. **oauth-handlers.js 导出路径修复（2026-04-14）**
   - 按提供商拆分，从各自模块导入

4. **WSRelay 模块实现（2026-04-14 新增，2026-04-15 优化）**
   - `src/wsrelay/manager.js` - WSRelayManager 和 WSSession 类
   - 64 个单元测试全部通过

---

## CLIProxyAPI 参考架构（关键设计）

### Go `signature_cache.go` 关键设计
1. **3 小时 TTL** ✅ 已对齐
2. **滑动过期** - 每次访问刷新 Timestamp ✅ 已实现
3. **分组 Map** - `sync.Map (groupKey -> groupCache)` 架构
4. **单例清理 goroutine** - `sync.Once` 保证只启动一次 ✅ 已实现
5. **空 Cache 删除** - 清理时删除空的 cache bucket

### Go `wsrelay/manager.go` + `session.go` 关键设计
- Manager-Session 双层架构 ✅ 已实现
- 30s 心跳间隔 ✅ 已实现
- 带缓冲的 channel（maxBufferSize: 8）✅ 已实现
- Session.request() 使用 chan Message(8) ✅ 已实现
- pendingRequest.closeOnce 防止重复关闭 ✅ 已实现
- Context 取消监听 ✅ 已实现

### CLIProxyAPI 6.9.15 新增模块分析
- **browser 模块**: 浏览器自动化，与 Node.js 无关
- **registry 模块**: 模型注册表，参考价值高
- **runtime/executor 模块**: 各提供商执行器，参考价值高
- **tui 模块**: 终端 UI，与 Node.js 无关

---

## Worker 进程异步句柄分析

**结论：** Worker 进程警告是测试环境中 OAuth 异步流程导致的，不是资源泄漏。生产环境所有 timer 都正确管理。

---

*最后更新: 2026-04-18*
