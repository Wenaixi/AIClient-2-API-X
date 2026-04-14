# Requirement.md - 需求规范与验收标准

> 规范驱动开发第一步：明确定义需求和验收标准

---

## 项目概述

| 属性 | 值 |
|------|-----|
| 项目名称 | AIClient-2-API |
| 项目路径 | `E:\newCC\stick\AlClient-2-APIAlClient-2-API\AIClient-2-API` |
| 类型 | Node.js API代理服务（多模型统一接口） |
| 当前分支 | `pro` |
| 上游仓库 | https://github.com/justlovemaki/AIClient-2-API |

---

## 核心功能需求

### 1. 多提供商统一接口
- [x] OpenAI 兼容 API
- [x] Claude 兼容 API
- [x] Gemini 兼容 API
- [x] Kimi (Moonshot AI) 兼容 API
- [x] Grok 兼容 API
- [x] iFlow 兼容 API
- [x] Codex 兼容 API
- [x] Qwen 兼容 API
- [x] Forward 转发支持

### 2. 认证与安全
- [x] OAuth 认证处理（多提供商）
- [x] 默认认证插件
- [x] API Key 管理
- [x] 敏感信息保护（日志脱敏）
- [x] 生产环境路径保护

### 3. 提供商池管理
- [x] ProviderPoolManager 多实例管理
- [x] FillFirstSelector 填充优先选择器
- [x] 健康检查定时器
- [x] LRU Adapter Cache 防止内存泄漏
- [x] 提供商故障转移

### 4. 请求处理
- [x] 请求处理器中间件
- [x] 多格式转换器（Claude/OpenAI/Gemini/Kimi/Codex/Grok）
- [x] 工具调用（Tool Calls）支持
- [x] 流式响应支持
- [x] 非流式响应支持

### 5. 服务架构
- [x] API Server 服务
- [x] Service Manager 服务管理
- [x] UI Manager 界面管理
- [x] Config Manager 配置管理
- [x] Plugin Manager 插件管理
- [x] Health Check Timer 健康检查

### 6. 插件系统
- [x] API Potluck 插件
- [x] AI Monitor 插件
- [x] Default Auth 认证插件
- [x] 插件热加载

### 7. 前端界面
- [x] 配置管理界面
- [x] OAuth API 界面
- [x] 提供商管理界面
- [x] 事件广播系统
- [x] 配置扫描器

---

## 测试需求

### 测试覆盖率目标
- [x] 核心模块单元测试
- [x] Provider 模块测试
- [x] Converter 模块测试
- [x] Service 模块测试
- [x] Utils 模块测试
- [x] Handler 模块测试
- [x] Auth 模块测试
- [x] Plugin 模块测试

### 测试质量标准
- [x] 所有测试通过（2004 测试，51 套件全部通过）
- [x] 使用 mock 处理外部依赖
- [x] 异步操作正确处理
- [x] 资源正确清理（teardown）

### 当前测试状态（2026-04-14 晚间）
```
Test Suites: 51 passed, 51 total
Tests:       2004 passed, 2004 total
Time:        ~40s
```

**测试覆盖率分析（2026-04-14 晚间）：**
| 模块 | 覆盖率 | 备注 |
|------|--------|------|
| providers/claude/* | 100% | ✅ claude-strategy + claude-core |
| providers/gemini/* | 100% | ✅ gemini-strategy + gemini-core |
| providers/grok/* | 100% | ✅ grok-strategy + grok-core |
| providers/openai/* | 100% | ✅ openai-strategy + openai-core |
| providers/kimi/* | 87-91% | ✅ 良好 |
| providers/selectors | 91% | ✅ 良好 |
| providers/forward | 79-88% | ✅ 良好 |
| utils/provider-strategies | 100% | ✅ 完美 |
| utils/constants | 100% | ✅ 完美 |
| services/health-check-timer | 81-88% | ✅ 良好 |
| services/usage-service | 91% | ✅ 良好 |
| wsrelay/* | 76-90% | ✅ 良好 |
| ui-modules/config-api.js | 85% | ✅ 良好 |
| ui-modules/oauth-api.js | ✅ | ✅ 已完整测试 |
| ui-modules/system-api.js | 72% | ✅ 良好 |
| ui-modules/system-monitor.js | 70% | ✅ 良好 |

---

## review 发现问题与修复状态（2026-04-14 晚间）

### 高优先级（影响稳定性）
| 问题 | 文件 | 状态 |
|------|------|------|
| logger.js 覆盖率 67% | `src/utils/logger.js` | 🔄 待修复 |
| common.js 覆盖率 20% | `src/utils/common.js` | 🔄 待修复 |

### 中优先级（影响安全性）
| 问题 | 文件 | 状态 |
|------|------|------|
| OAuth 错误处理不一致 | `codex-oauth.js` | 🔄 待修复 |
| escapeHtml 调用不一致 | `kimi-oauth-handler.js` | 🔄 待修复 |

### 低优先级（代码优化）- 已修复 ✅
| 问题 | 文件 | 状态 |
|------|------|------|
| Kimi OAuth 日志冗余 | `kimi-oauth-handler.js` | ✅ 已修复 |
| 硬编码配置目录 | `kimi-oauth-handler.js` | ✅ 已修复 |

### 已修复问题
| 问题 | 文件 | 状态 |
|------|------|------|
| iFlow OAuth 已移除 | `src/auth/iflow-oauth.js` | ✅ 已移除 |
| PROVIDER_POOLS_FILE_PATH 校验 | `config-api.js` | ✅ 已添加 |
| SCHEDULED_HEALTH_CHECK 校验 | `config-api.js` | ✅ 已添加 |
| autoLinkProviderConfigs 缺失 | `codex-oauth.js` | ✅ 已添加 |

---

## CLIProxyAPI 参考需求

参考实现路径: `E:\newCC\stick\AlClient-2-APIAlClient-2-API\CLIProxyAPI-6.9.15`

### Go 参考架构
- `internal/access/` - 访问控制
- `internal/api/` - API 处理
- `internal/auth/` - 认证
- `internal/cache/` - 缓存
- `internal/config/` - 配置
- `internal/constant/` - 常量
- `internal/interfaces/` - 接口
- `internal/logging/` - 日志
- `internal/store/` - 存储
- `internal/translator/` - 翻译/转换
- `internal/usage/` - 使用量
- `internal/util/` - 工具
- `internal/watcher/` - 监控
- `internal/wsrelay/` - WebSocket 转发

### Go 关键设计参考（CLIProxyAPI 6.9.15）

#### Cache 模块 (internal/cache/signature_cache.go)
- 3 小时 TTL，与 Node.js LRU Cache TTL 对齐 ✅
- 滑动过期（每次访问刷新 Timestamp）✅
- 分组 Map 架构 (sync.Map groupKey → groupCache)
- 空 Cache Bucket 删除机制

#### WSRelay 模块 (internal/wsrelay/manager.go + session.go)
- Manager-Session 双层架构 ✅
- 30s 心跳间隔 ✅
- 带缓冲的 channel (maxBufferSize: 8) ✅
- Session.request() 使用 chan Message(8) ✅
- 优雅关闭机制 ✅
- Context 取消监听 ✅

### 已知问题（CLIProxyAPI）
- [x] Timer 泄漏问题 → 已分析确认是测试环境行为，非资源泄漏
- [x] Worker 进程未优雅退出 → 已分析确认是测试框架行为

---

## 验收标准

### 交付标准
- [x] 1935+ 测试全部通过
- [x] 核心功能稳定运行
- [x] 无内存泄漏
- [x] 日志无敏感信息泄露
- [x] 配置安全保护

### 性能标准
- [x] LRU Cache TTL 3小时（与 Go 版本 CLIProxyAPI 一致）
- [x] 健康检查间隔可配置
- [ ] 请求响应时间 < 5s（常规）
- [ ] 并发处理正常

### 安全标准
- [x] 无敏感信息日志泄露
- [x] 生产环境无路径暴露
- [x] OAuth Token 安全处理
- [x] API Key 安全存储

---

## 版本信息

| 版本 | 日期 | 变更 |
|------|------|------|
| 2.13.x | 2026-04 | 当前版本，含 Kimi/iFlow 支持 |
| 2.14.x | 2026-04-15 | WSRelay 模块、LRU Cache TTL 优化、健康检查定时器独立模块 |
| 2.15.x | 2026-04-18 | Provider *-core 测试覆盖（claude/grok/openai/gemini），1935 测试全部通过 |

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2026-04-14 | 初始版本，核心功能需求定义 |
| 2026-04-15 | 新增 WSRelay 模块、LRU Cache TTL 3小时优化、健康检查定时器独立模块 |
| 2026-04-16 | Provider Strategy 测试覆盖（openai/claude/grok-strategy） |
| 2026-04-17 | UI Modules 测试覆盖率提升（system-api/system-monitor/config-scanner/upload-config-api） |
| 2026-04-18 | Provider *-core 测试覆盖（claude/grok/openai/gemini-core），1935 测试全部通过 |

*最后更新: 2026-04-18*
