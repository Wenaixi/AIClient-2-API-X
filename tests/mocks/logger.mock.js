/**
 * Logger Mock
 * 提供可配置的日志模拟
 */

import { jest } from '@jest/globals';

/**
 * 创建 Logger Mock
 * @param {object} options - 选项
 * @returns {object}
 */
export function createLoggerMock(options = {}) {
  const mock = {
    trace: jest.fn((...args) => console.log('[TRACE]', ...args)),
    debug: jest.fn((...args) => console.log('[DEBUG]', ...args)),
    info: jest.fn((...args) => console.log('[INFO]', ...args)),
    warn: jest.fn((...args) => console.warn('[WARN]', ...args)),
    error: jest.fn((...args) => console.error('[ERROR]', ...args)),
    fatal: jest.fn((...args) => console.error('[FATAL]', ...args)),

    // 便捷方法
    log: jest.fn((...args) => console.log(...args)),
    dir: jest.fn((obj) => console.dir(obj)),

    // 重置方法
    reset: jest.fn(),
    clear: jest.fn(),

    // 获取调用历史
    getCalls: (level) => mock[level]?.mock.calls || [],

    // 获取调用计数
    getCallCount: (level) => mock[level]?.mock.calls.length || 0,

    // 检查是否包含特定消息的调用
    hasCall: (level, message) => {
      const calls = mock[level]?.mock.calls || [];
      return calls.some(call =>
        call.some(arg => typeof arg === 'string' && arg.includes(message))
      );
    },
  };

  // 设置日志级别过滤
  if (options.level) {
    mock.minLevel = options.level;
  }

  // 静默模式
  if (options.silent) {
    Object.keys(mock).forEach(key => {
      if (typeof mock[key] === 'function' && key !== 'reset' && key !== 'clear') {
        mock[key] = jest.fn();
      }
    });
  }

  return mock;
}

/**
 * 创建默认的 Logger Mock
 * @returns {object}
 */
export function createDefaultLoggerMock() {
  return createLoggerMock({ silent: false });
}

/**
 * 创建静默的 Logger Mock
 * @returns {object}
 */
export function createSilentLoggerMock() {
  return createLoggerMock({ silent: true });
}

/**
 * 预设的 Logger Mock
 */
export const LoggerMocks = {
  create: createLoggerMock,
  createDefault: createDefaultLoggerMock,
  createSilent: createSilentLoggerMock,
};

export default LoggerMocks;
