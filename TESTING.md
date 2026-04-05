# AIClient-2-API 测试系统规范

## 1. 测试架构概述

### 1.1 测试金字塔

```
        /\
       /  \     E2E Tests (端到端测试)
      /____\        ~10%
     /      \
    /        \   Integration Tests (集成测试)
   /__________\      ~30%
  /            \
 /              \ Unit Tests (单元测试)
/________________\    ~60%
```

### 1.2 测试目录结构

```
tests/
├── unit/                          # 单元测试
│   ├── utils/                     # 工具函数测试
│   ├── auth/                      # 认证模块测试
│   ├── converters/                # 转换器测试
│   └── ui-modules/                # UI模块测试
├── integration/                   # 集成测试
│   ├── api/                       # API集成测试
│   ├── providers/                 # 提供商集成测试
│   └── services/                  # 服务集成测试
├── e2e/                          # 端到端测试
│   └── flows/                     # 业务流程测试
├── fixtures/                      # 测试数据
├── mocks/                         # 模拟对象
├── helpers/                       # 测试辅助函数
└── setup/                         # 测试配置
    ├── jest.setup.js              # Jest全局设置
    └── jest.teardown.js           # Jest全局清理
```

## 2. 测试规范

### 2.1 命名规范

- 测试文件: `{module-name}.test.js` 或 `{module-name}.spec.js`
- 测试套件: `describe('ModuleName', () => {})`
- 测试用例: `test('should {expected_behavior} when {condition}', () => {})`
- 钩子函数: `beforeAll`, `afterAll`, `beforeEach`, `afterEach`

### 2.2 测试结构 (AAA模式)

```javascript
test('should return user when valid id provided', () => {
  // Arrange (准备)
  const userId = '123';
  const expectedUser = { id: '123', name: 'John' };
  
  // Act (执行)
  const result = getUser(userId);
  
  // Assert (断言)
  expect(result).toEqual(expectedUser);
});
```

### 2.3 测试覆盖率要求

| 模块类型 | 行覆盖率 | 分支覆盖率 | 函数覆盖率 |
|---------|---------|-----------|-----------|
| Core (核心) | ≥90% | ≥85% | ≥95% |
| Utils (工具) | ≥85% | ≥80% | ≥90% |
| UI Modules | ≥75% | ≥70% | ≥80% |
| Auth (认证) | ≥95% | ≥90% | ≥95% |

## 3. 测试环境配置

### 3.1 环境变量

```bash
# 测试环境
NODE_ENV=test
TEST_DB_PATH=./test-data/test.db
TEST_LOG_LEVEL=error
TEST_TIMEOUT=30000

# 功能开关
ENABLE_E2E_TESTS=false
ENABLE_INTEGRATION_TESTS=true
ENABLE_UNIT_TESTS=true
```

### 3.2 测试隔离原则

1. **数据库隔离**: 每个测试使用独立的数据库/数据目录
2. **文件系统隔离**: 使用临时目录，测试后清理
3. **网络隔离**: 外部API调用使用mock
4. **时间隔离**: 使用jest fake timers控制时间

## 4. 测试类型详解

### 4.1 单元测试

测试单个函数/类，不依赖外部资源。

```javascript
// 特点:
// - 快速执行 (<100ms)
// - 无外部依赖
// - 确定性结果
// - 易于调试
```

### 4.2 集成测试

测试模块间的交互，可能依赖测试数据库/服务。

```javascript
// 特点:
// - 测试真实交互
// - 使用测试数据库
// - 可能需要启动服务
// - 执行时间较长 (1-10s)
```

### 4.3 E2E测试

测试完整业务流程，模拟真实用户操作。

```javascript
// 特点:
// - 完整流程验证
// - 最贴近真实场景
// - 执行时间最长 (>10s)
// - 稳定性相对较低
```

## 5. Mock规范

### 5.1 Mock分层

```javascript
// Level 1: 函数级Mock
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

// Level 2: 模块级Mock
jest.mock('../core/config-manager', () => ({
  CONFIG: {
    SERVER_PORT: 3000,
    LOG_LEVEL: 'error',
  },
}));

// Level 3: 服务级Mock
const mockServer = createMockServer();
beforeAll(() => mockServer.start());
afterAll(() => mockServer.stop());
```

### 5.2 Mock数据工厂

```javascript
// tests/factories/user.factory.js
export const userFactory = {
  create: (overrides = {}) => ({
    id: generateUUID(),
    name: 'Test User',
    email: 'test@example.com',
    ...overrides,
  }),
  
  createMany: (count, overrides = {}) => 
    Array.from({ length: count }, (_, i) => 
      userFactory.create({ ...overrides, id: `user-${i}` })
    ),
};
```

## 6. 测试执行策略

### 6.1 本地开发

```bash
# 监听模式
npm run test:watch

# 特定文件
npm test -- tests/unit/utils/common.test.js

# 特定测试
npm test -- --testNamePattern="should validate"
```

### 6.2 CI/CD

```bash
# 完整测试套件
npm run test:coverage

# 只运行单元测试
npm run test:unit

# 并行执行
npm test -- --maxWorkers=4
```

## 7. 断言规范

### 7.1 优先使用

```javascript
// ✅ Good
expect(result).toBe(expected);           // 严格相等
expect(result).toEqual(expected);        // 深度相等
expect(result).toContain(item);          // 包含检查
expect(fn).toThrow(Error);               // 异常检查

// ❌ Avoid
expect(result == expected).toBe(true);   // 不使用 ==
expect(result).toBeTruthy();             // 避免模糊断言
```

### 7.2 异步测试

```javascript
// Promise
test('should resolve with data', async () => {
  const result = await fetchData();
  expect(result).toHaveProperty('id');
});

// Async/Await with rejects
test('should throw on invalid input', async () => {
  await expect(fetchData('invalid'))
    .rejects
    .toThrow('Invalid input');
});
```

## 8. 性能测试规范

### 8.1 测试执行时间限制

```javascript
// 单元测试: <100ms
test('should process quickly', () => {
  const start = performance.now();
  processData();
  const duration = performance.now() - start;
  expect(duration).toBeLessThan(100);
}, 100);

// 集成测试: <5000ms
test('should complete request', async () => {
  // ...
}, 5000);
```

## 9. 测试文档

每个测试文件应包含:

```javascript
/**
 * @module tests/unit/utils/common.test
 * @description Common工具函数单元测试
 * @requires @jest/globals
 * 
 * 测试覆盖:
 * - 字符串处理函数
 * - 日期格式化
 * - 数据验证
 * 
 * @author Test Team
 * @since 1.0.0
 */
```

## 10. 持续改进

- 定期review测试覆盖率报告
- 删除冗余/过时测试
- 补充回归测试
- 优化慢测试
