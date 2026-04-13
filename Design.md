# Design.md - 技术设计与架构决策

> 规范驱动开发第二步：记录技术设计和关键决策
> 最后更新: 2026-04-14

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
- **特性**: LRU Cache 防止内存泄漏，支持 TTL 滑动过期
- **关键方法**: `create()` `request()` `release()`

#### 2. Provider Pool Manager (src/providers/provider-pool-manager.js)
- **职责**: 管理多个提供商实例，提供故障转移和负载均衡
- **关键类**: `ProviderPoolManager` `FillFirstSelector`
- **特性**: 健康检查、实例池化、动态扩容

#### 3. Converters (src/converters/)
- **职责**: 请求/响应格式转换
- **转换器**:
  - `ClaudeConverter.js` - Claude 格式 ↔ OpenAI 格式
  - `OpenAIConverter.js` - OpenAI 格式
  - `KimiConverter.js` - Kimi/Moonshot 格式
  - `GeminiConverter.js` - Gemini 格式
  - `CodexConverter.js` - Codex 格式
  - `GrokConverter.js` - Grok 格式
  - `OpenAIResponsesConverter.js` - OpenAI Responses API

#### 4. Health Check Timer (src/services/health-check-timer.js)
- **职责**: 定时健康检查，移除不健康实例
- **关键逻辑**: `_getMutableLastCheckTimes()` 修复了迭代中删除条目的 Bug

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

## LRU Cache 设计（TTL 滑动过期）

### Adapter LRU Cache
```javascript
class LRUCache {
    constructor(maxSize = 50, ttlMs = 0) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs; // 0 表示无 TTL
        this.cache = new Map();
    }

    _isExpired(entry) {
        if (!this.ttlMs) return false;
        return Date.now() - entry.timestamp > this.ttlMs;
    }

    get(key) {
        // 检查 TTL 过期
        // 移动到末尾（最新使用）
    }

    purgeExpired() {
        // 批量清理过期条目
    }
}

// 30 分钟 TTL + 10 分钟清理间隔
const serviceInstancesCache = new LRUCache(50, CACHE_TTL_MS);
```

### CLIProxyAPI 参考 (signature_cache.go)
- sync.Map 分组存储
- 滑动 TTL 过期
- 定期 purgeExpired 清理

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

### Go vs Node.js 深度对比（2026-04-14）

#### 1. Auth 模块
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 设计 | 极简接口，状态外部化 | OAuth处理器分散多文件 |
| 存储 | TokenStorage接口 | 文件系统JSON |
| 扩展 | 子包按提供商实现 | 各提供商独立文件 |

#### 2. Store 模块（数据存储）
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 后端 | Git/Postgres/Object三种 | JSON文件+内存 |
| 分支隔离 | 支持git分支管理 | 无 |
| 事务性 | Squash提交保证原子性 | 无 |

#### 3. Translator 模块（格式转换）
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 注册 | blank import自动注册 | 显式调用registerConverter |
| 结构 | `{source}/{target}/` 目录对 | ConverterFactory策略模式 |
| 映射 | 多对多任意组合 | 转换器类实例化 |

#### 4. Usage 模块（使用量统计）
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 架构 | 插件+聚合统计+快照+Merge | Provider查询+格式化 |
| 并发 | sync/atomic原子操作 | Promise.allSettled |
| 去重 | dedupKey多字段生成 | 无 |

#### 5. Cache 模块
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 存储 | sync.Map分组存储 | ✅ LRU Cache + TTL |
| TTL | 滑动过期+清理goroutine | ✅ 滑动过期+定时清理 |
| 设计 | 分组Cache减少锁竞争 | ✅ Adapter单实例 |

#### 6. WSRelay 模块（WebSocket）
| 特性 | Go (CLIProxyAPI) | Node.js (AIClient) |
|------|------------------|---------------------|
| 架构 | Manager-Session双层 | 无独立模块 |
| 心跳 | 30s ticker保活 | - |
| 关闭 | 优雅关闭所有session | - |

### 可借鉴的Go优化点
1. **缓存设计**：分组+sync.Map+滑动TTL
2. **存储抽象**：多后端支持（Git/Postgres/Object）
3. **WS管理**：Manager-Session分层+优雅关闭
4. **统计聚合**：快照+去重+Merge机制
5. **Init注册**：blank import自动注册，减少手动维护

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

## 已修复问题

### 2026-04-14 修复
1. ✅ `_getMutableLastCheckTimes` 未定义 Bug
2. ✅ 迭代中删除 Map 条目 Bug（使用 `Array.from()` 复制）
3. ✅ 认证日志敏感信息泄露
4. ✅ 生产环境路径暴露
5. ✅ `getDeviceId()` → `getDeviceIdAsync()`
6. ✅ Timer 泄漏问题
7. ✅ adapter.js 死代码清理（getGroupCache/groupCacheRegistry/GroupCache 未定义引用）
8. ✅ oauth-handlers.js 导出路径错误（所有导出错误地从 kimi-oauth-handler.js 导入）
9. ✅ provider-pool-manager.js validateConfig() 构造函数顺序问题
10. ✅ _acquireGlobalSemaphore 超时 UUID 清理问题
11. ✅ health-check-timer.js 使用 || 而非 ?? 导致 0 值禁用失效

### 待监控
1. ⚠️ Worker 进程异步句柄警告（不影响正确性）
2. ⚠️ `MAX_INTERVAL_MS` 期望值测试修复

---

*最后更新: 2026-04-14*
