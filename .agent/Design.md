# Design.md - 技术设计与架构决策

> 规范驱动开发第二步：记录技术设计和关键决策

---

## 系统架构

### 整体架构
```
Client → API Server → Request Handler → Adapter → Provider Pool
                                              ↓
                                         Providers
                                         (OpenAI/Claude/Gemini/Kimi/Grok/iFlow/...)
```

### 核心模块

#### 1. Adapter (src/providers/adapter.js)
- **职责**: 提供商适配器，统一的请求/响应处理接口
- **特性**: LRU Cache 防止内存泄漏，3小时 TTL 滑动过期
- **关键方法**: `create()` `request()` `release()`
- **参考**: CLIProxyAPI `internal/cache/signature_cache.go`

#### 2. Provider Pool Manager (src/providers/provider-pool-manager.js)
- **职责**: 管理多个提供商实例，提供故障转移和负载均衡
- **关键类**: `ProviderPoolManager` `FillFirstSelector`
- **特性**: 健康检查、实例池化、动态扩容

#### 3. Provider Selectors (src/providers/selectors/index.js)
- **职责**: 提供商选择策略
- **选择器**:
  - `ScoreBasedSelector` - 基于评分的选择（分数越低越优先）
  - `RoundRobinSelector` - 轮询策略
  - `FillFirstSelector` - 优先填充单个节点策略
- **特性**: 支持并发串行化，防止竞争条件

#### 4. Converters (src/converters/)
- **职责**: 请求/响应格式转换
- **转换器**:
  - `ClaudeConverter.js` - Claude 格式 ↔ OpenAI 格式
  - `OpenAIConverter.js` - OpenAI 格式
  - `KimiConverter.js` - Kimi/Moonshot 格式
  - `GeminiConverter.js` - Gemini 格式
  - `CodexConverter.js` - Codex 格式
  - `GrokConverter.js` - Grok 格式
  - `OpenAIResponsesConverter.js` - OpenAI Responses API

#### 5. Health Check Timer (src/services/health-check-timer.js)
- **职责**: 定时健康检查，移除不健康实例
- **关键逻辑**: `_getMutableLastCheckTimes()` 修复了迭代中删除条目的 Bug

#### 6. WSRelay Manager (src/wsrelay/manager.js)
- **职责**: WebSocket 代理管理
- **架构**: Manager-Session 双层架构
- **参考**: CLIProxyAPI `internal/wsrelay/manager.go`

---

## 认证系统

### OAuth Handlers (src/auth/)
```
oauth-handlers.js → kimi-oauth.js
                  → kiro-oauth.js
                  → gemini-oauth.js
                  → codex-oauth.js
                  → qwen-oauth.js
                  → iflow-oauth.js
```

### Kimi OAuth 特殊处理
- `kimi-oauth-handler.js` - 专用 Kimi OAuth 处理器
- `kimi-token-refresh.js` - Token 刷新脚本
- 需设置 `KIMI_CLIENT_ID` 和 `KIMI_CLIENT_SECRET` 环境变量

---

## 配置管理

### 配置文件
- `configs/config.json.example` - 主配置
- `configs/plugins.json.example` - 插件配置
- `configs/provider_pools.json.example` - 提供商池配置

### Config Manager (src/core/config-manager.js)
- **职责**: 配置加载、验证、动态更新
- **特性**: 支持多环境配置

---

## 插件系统

### Plugin Manager (src/core/plugin-manager.js)
- **职责**: 插件生命周期管理
- **内置插件**:
  - `api-potluck` - API 路由和 Key 管理
  - `ai-monitor` - AI 监控
  - `default-auth` - 默认认证

### API Potluck 插件 (src/plugins/api-potluck/)
- **职责**: API Key 生成、验证、使用量统计
- **路由**: `/api/*`

---

## 请求处理流程

### 请求流程
```
1. Client Request → API Server
2. → Middleware (Auth, CORS, etc.)
3. → Request Handler
4. → Adapter (转换请求格式)
5. → Provider Pool Manager
6. → FillFirstSelector (选择健康实例)
7. → Provider (OpenAI/Claude/...)
8. → Response (逆向流程返回)
```

### 请求转换点
- **请求入口**: `src/handlers/request-handler.js`
- **格式转换**: `src/converters/` 各转换器
- **Provider 核心**: `src/providers/*/kimi-core.js` 等

---

## 测试架构

### 测试配置 (jest.config.js)
```javascript
{
  testEnvironment: 'node',
  transform: { '^.+\\.js$': 'babel-jest' },
  plugins: ['babel-plugin-transform-import-meta'],
  testTimeout: 30000,
  setupFiles: ['./tests/setup.js']
}
```

### 测试文件组织
```
tests/
├── unit/
│   ├── auth/
│   ├── converters/
│   ├── core/
│   ├── handlers/
│   ├── plugins/
│   ├── providers/
│   │   ├── selectors/        # 选择器测试
│   │   └── ...
│   ├── services/
│   ├── ui-modules/
│   └── utils/
├── provider-models.unit.test.js
└── security-fixes.unit.test.js
```

---

## CLIProxyAPI 参考架构（Go）

### 目录结构
```
CLIProxyAPI-6.9.15/
├── internal/
│   ├── access/     - 访问控制
│   ├── api/        - API 路由
│   ├── auth/       - 认证逻辑
│   ├── cache/      - 缓存实现
│   ├── config/     - 配置加载
│   ├── constant/   - 常量定义
│   ├── interfaces/ - 接口定义
│   ├── logging/    - 日志系统
│   ├── store/      - 数据存储
│   ├── translator/ - 格式转换
│   ├── usage/      - 使用量统计
│   ├── util/       - 工具函数
│   ├── watcher/    - 监控告警
│   └── wsrelay/    - WebSocket
├── test/           - Go 测试
└── cmd/           - 命令行入口
```

### 关键设计模式（CLIProxyAPI）
1. **Interface 定义** - 清晰的接口边界
2. **Config 驱动** - YAML 配置
3. **Store 抽象** - 数据存储解耦
4. **Translator** - 请求/响应转换层
5. **Usage Tracking** - 使用量统计

---

## CLIProxyAPI Go vs Node.js 深度对比（2026-04-15）

### Cache 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 存储 | sync.Map 分组存储 | ✅ LRU Cache + TTL |
| TTL | 3小时滑动过期 | ✅ 3小时滑动过期 |
| 清理 | 分组清理+空组删除 | ✅ 定时 purgeExpired |
| 架构 | 分组Map减少锁竞争 | ✅ Adapter单实例 |

**分析结论：**
- Go 使用分组 Map 架构 (groupKey → groupCache)，每组独立 TTL
- Node.js 使用单一固定大小 LRU Cache，满时自动淘汰最旧条目
- 空组删除机制不适用于当前设计（单一 LRU Cache，满时自动淘汰）
- 当前设计已满足需求，无需改为分组架构

### WSRelay 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 架构 | Manager-Session 双层 | ✅ 已实现 |
| 心跳 | 30s ticker 保活 | ✅ 30s heartbeat |
| 关闭 | 优雅关闭所有 session | ✅ cleanup 机制 |
| Channel 缓冲 | maxBufferSize: 8 | ✅ 已实现 |
| Context 取消 | goroutine 监听 ctx.Done() | ✅ cancel 回调 |

**分析结论：**
- Node.js WSRelay 模块已完整对齐 Go 设计
- Session.request() 使用带缓冲的 channel（maxBufferSize: 8）
- Manager.Stop() 优雅关闭所有会话
- _cleanupOnce 保护防止重复 cleanup

### Auth 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 设计 | 极简接口，状态外部化 | OAuth 处理器分散多文件 |
| 存储 | TokenStorage 接口 | 文件系统 JSON |
| 扩展 | 子包按提供商实现 | 各提供商独立文件 |

### Store 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 后端 | Git/Postgres/Object 三种 | JSON 文件 + 内存 |
| 分支隔离 | 支持 git 分支管理 | 无 |
| 事务性 | Squash 提交保证原子性 | 无 |

### Translator 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 注册 | blank import 自动注册 | 显式调用 registerConverter |
| 结构 | `{source}/{target}/` 目录对 | ConverterFactory 策略模式 |
| 映射 | 多对多任意组合 | 转换器类实例化 |

### Usage 模块对比
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 架构 | 插件 + 聚合统计 + 快照 + Merge | Provider 查询 + 格式化 |
| 并发 | sync/atomic 原子操作 | Promise.allSettled |
| 去重 | dedupKey 多字段生成 | 无 |

---

## 安全设计

### 日志脱敏
- **实现**: `src/utils/logger.js`
- **脱敏字段**: `token`, `api_key`, `authorization`, `password`, `secret`
- **实现方式**: `sanitizeLog()` 方法

### 生产环境保护
- 错误信息不暴露内部路径
- 配置信息加密存储
- OAuth Token 不日志输出

---

## 已知问题与修复

### 已修复
1. ✅ `_getMutableLastCheckTimes` 未定义 Bug
2. ✅ 迭代中删除 Map 条目 Bug（使用 `Array.from()` 复制）
3. ✅ 认证日志敏感信息泄露
4. ✅ 生产环境路径暴露
5. ✅ `getDeviceId()` → `getDeviceIdAsync()`
6. ✅ Timer 泄漏问题（已确认是测试环境行为）
7. ✅ adapter.js 死代码清理（getGroupCache/groupCacheRegistry/GroupCache 未定义引用）
8. ✅ oauth-handlers.js 导出路径错误（所有导出错误地从 kimi-oauth-handler.js 导入）
9. ✅ FillFirstSelector 返回 Promise 而非同步值的问题
10. ✅ LRU Cache TTL 提升至 3 小时（与 Go 版本一致）
11. ✅ WSRelay Session 优化（带缓冲 channel，maxBufferSize: 8）

### 待监控
1. ⚠️ Worker 进程异步句柄警告（不影响正确性，测试框架行为）
2. ⚠️ 部分 OAuth 模块 setInterval 缺少 .unref()（已验证均为页面内 countdown timer）

---

## 近期修复（2026-04-15）

### LRU Cache TTL 提升至 3 小时
**问题**: Node.js 缓存 TTL 过短，与 Go 版本不一致
**修复**: SignatureCacheTTL = 3 * time.Hour，CacheCleanupInterval = 10 * time.Minute
**代码位置**: `src/providers/adapter.js`

### WSRelay Session 优化
**问题**: Session 消息处理无缓冲，可能丢失消息
**修复**: Session.request() 使用带缓冲的 channel（maxBufferSize: 8）
**代码位置**: `src/wsrelay/manager.js`

---

## CLIProxyAPI Go 版本关键设计（2026-04-15 分析）

### signature_cache.go 关键设计
```go
// 3 小时 TTL
SignatureCacheTTL = 3 * time.Hour
CacheCleanupInterval = 10 * time.Minute

// 滑动过期 - 每次访问刷新 Timestamp
entry.Timestamp = now

// 分组 Map - sync.Map (groupKey -> groupCache)
var signatureCache sync.Map
type groupCache struct {
    mu      sync.RWMutex
    entries map[string]SignatureEntry
}

// 空 Cache Bucket 删除
if isEmpty {
    signatureCache.Delete(key)
}
```

### wsrelay/manager.go 关键设计
```go
// Manager 结构
type Manager struct {
    sessions  map[string]*session
    sessMutex sync.RWMutex
    providerFactory func(*http.Request) (string, error)
    onConnected    func(string)
    onDisconnected func(string, error)
}

// Session.request() 使用带缓冲 channel
ch := make(chan Message, 8)
```

---

*最后更新: 2026-04-17*
