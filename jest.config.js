export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)', // uuid is an ESM module that needs to be transformed
  ],
  globals: {
    'jest': {
      useESM: true
    }
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    // 需要运行服务器的集成测试 - 需要真实服务器运行，使用环境变量控制
    // 安全测试 - 特定于环境的测试
    'security-fixes.test.js$',
    // 集成测试 - 需要真实服务器
    'api-integration.test.js$',
    // 并发测试 - 需要多个服务器实例
    'concurrent-test.js$',
    // 前端测试 - 使用 Vitest 运行
    'tests/frontend/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000 // Add a global test timeout
};