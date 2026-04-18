# CLAUDE.md - AIClient-2-API

> 项目开发规范 | pro 分支

---

## 项目

| 属性 | 值 |
|------|-----|
| 分支 | `pro` |
| 上游 | https://github.com/justlovemaki/AIClient-2-API |
| 测试 | 52 suites / 2179 tests ✅ |

## 命令

```bash
npm run start      # 启动
npm test           # 测试
npm run test:coverage  # 覆盖率
docker compose up -d --build  # Docker
```

## 已完成

- Kimi OAuth / Kimi Provider
- WSRelay Manager (721行)
- LRU Cache 3h TTL + 滑动过期
- Provider Pool 信号量模式 + 429退避
- Health Check Timer
- 安全: XSS防护 / safeCompare / 日志脱敏 / MAX_BODY_SIZE 10MB
- Timer泄漏修复 (21处 .unref())
- iFlow Provider 已移除

## 八次Review (2026-04-18)

| Review | 高危 | 中危 | 低危 | 状态 |
|--------|------|------|------|------|
| 1-8 | 15 | 10 | 0 | ✅ 全部修复 |

### 安全 ✅
- JWT JWKS验证 (jose库)
- OAuth 凭证环境变量覆盖
- safeCompare 时序安全

### 架构 ✅
- LRU Cache 滑动过期
- 信号量模式
- 429指数退避

## 技术债务 (无需修复)
1. Proxy getOwnPropertyDescriptor (adapter.js:944)
2. config API Key 不持久化
3. _acquireGlobalSemaphoreSync 非原子

## 规范文档

@>.agent/Requirement.md - 需求
@>.agent/Design.md - 设计
@>.agent/Task.md - 任务

*最后更新: 2026-04-18*