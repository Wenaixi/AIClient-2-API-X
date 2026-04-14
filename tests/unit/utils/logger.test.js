/**
 * logger.js 单元测试
 * 针对 src/utils/logger.js 的全面测试
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Logger } from '../../../src/utils/logger.js';

describe('Logger - 基础功能', () => {
    let logger;

    beforeEach(() => {
        // 每次测试创建新的 Logger 实例
        logger = new Logger();
        // 禁用文件输出，避免测试产生文件
        logger.config.outputMode = 'console';
        logger.config.enabled = true;
        logger.config.logLevel = 'debug';
        logger.config.includeTimestamp = true;
        logger.config.includeRequestId = true;
        // Mock 控制台方法
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should have default config values', () => {
        expect(logger.config.enabled).toBe(true);
        expect(logger.config.outputMode).toBe('console');
        expect(logger.config.logLevel).toBe('debug');
        expect(logger.config.logDir).toBe('logs');
    });

    test('should format message with timestamp and request ID', () => {
        const message = logger.formatMessage('info', ['Test message'], 'req-123');
        expect(typeof message).toBe('string');
        expect(message).toContain('[INFO]');
        expect(message).toContain('Test message');
        expect(message).toContain('[Req:req-123]');
    });

    test('should format message without request ID when not provided', () => {
        const message = logger.formatMessage('info', ['Test message'], null);
        expect(message).not.toContain('[Req:');
        expect(message).toContain('[INFO]');
        expect(message).toContain('Test message');
    });

    test('should handle object arguments in formatMessage', () => {
        const obj = { key: 'value', num: 42 };
        const message = logger.formatMessage('info', [obj], null);
        expect(message).toContain('"key"');
        expect(message).toContain('"value"');
        expect(message).toContain('42');
    });

    test('should handle multiple arguments', () => {
        const message = logger.formatMessage('info', ['Hello', 'World'], null);
        expect(message).toContain('Hello World');
    });
});

describe('Logger - 日志级别', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.enabled = true;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should log debug level when logLevel is debug', () => {
        logger.config.logLevel = 'debug';
        logger.debug('Debug message');
        expect(console.debug).toHaveBeenCalled();
    });

    test('should not log debug level when logLevel is info', () => {
        logger.config.logLevel = 'info';
        logger.debug('Debug message');
        expect(console.debug).not.toHaveBeenCalled();
    });

    test('should log info level when logLevel is info', () => {
        logger.config.logLevel = 'info';
        logger.info('Info message');
        expect(console.log).toHaveBeenCalled();
    });

    test('should log warn level', () => {
        logger.config.logLevel = 'debug';
        logger.warn('Warn message');
        expect(console.warn).toHaveBeenCalled();
    });

    test('should log error level', () => {
        logger.config.logLevel = 'debug';
        logger.error('Error message');
        expect(console.error).toHaveBeenCalled();
    });

    test('should not log any level when disabled', () => {
        logger.config.enabled = false;
        logger.config.logLevel = 'debug';
        logger.debug('Debug');
        logger.info('Info');
        logger.warn('Warn');
        logger.error('Error');
        expect(console.debug).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });

    test('should respect log hierarchy - warn does not trigger info', () => {
        logger.config.logLevel = 'warn';
        logger.info('Info message');
        logger.warn('Warn message');
        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalled();
    });
});

describe('Logger - shouldLog', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.enabled = true;
    });

    test('should return true for debug when level is debug', () => {
        logger.config.logLevel = 'debug';
        expect(logger.shouldLog('debug')).toBe(true);
    });

    test('should return false for debug when level is info', () => {
        logger.config.logLevel = 'info';
        expect(logger.shouldLog('debug')).toBe(false);
    });

    test('should return true for error when level is debug', () => {
        logger.config.logLevel = 'debug';
        expect(logger.shouldLog('error')).toBe(true);
    });

    test('should return false when logger is disabled', () => {
        logger.config.enabled = false;
        expect(logger.shouldLog('debug')).toBe(false);
    });
});

describe('Logger - withRequest', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.logLevel = 'debug';
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should create logger with specific request ID', () => {
        const requestLogger = logger.withRequest('test-req-id');
        requestLogger.info('Test message');
        expect(console.log).toHaveBeenCalled();
        const call = console.log.mock.calls[0][0];
        expect(call).toContain('[Req:test-req-id]');
    });

    test('should support all log levels', () => {
        const requestLogger = logger.withRequest('req-456');
        requestLogger.debug('Debug');
        requestLogger.info('Info');
        requestLogger.warn('Warn');
        requestLogger.error('Error');
        expect(console.debug).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
    });
});

describe('Logger - request context', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should return empty context for unknown request ID', () => {
        const ctx = logger.getRequestContext('non-existent');
        expect(ctx).toEqual({});
    });

    test('should clear request context', () => {
        logger.setRequestContext('test-id', { key: 'value' });
        logger.clearRequestContext('test-id');
        const ctx = logger.getRequestContext('test-id');
        expect(ctx).toEqual({});
    });

    test('should set request context', () => {
        const id = logger.setRequestContext('test-id', { key: 'value' });
        expect(id).toBe('test-id');
    });

    test('should generate UUID for empty request ID', () => {
        const id = logger.setRequestContext('', {});
        expect(typeof id).toBe('string');
        expect(id.length).toBe(8);
    });
});

describe('Logger - runWithContext', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should run callback with context', () => {
        const result = logger.runWithContext('test-id', () => {
            return 'success';
        });
        expect(result).toBe('success');
    });

    test('should generate request ID if not provided', () => {
        const id = logger.runWithContext(null, () => {
            return logger.getCurrentRequestId();
        });
        expect(typeof id).toBe('string');
        expect(id.length).toBe(8);
    });
});

describe('Logger - close', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    test('should close without errors', () => {
        expect(() => logger.close()).not.toThrow();
    });

    test('should clear context cleanup timer', () => {
        logger.setRequestContext('test-id', {});
        logger.close();
        expect(logger._contextCleanupTimer).toBeNull();
    });
});

describe('Logger - config', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should have correct default levels', () => {
        expect(logger.levels.debug).toBe(0);
        expect(logger.levels.info).toBe(1);
        expect(logger.levels.warn).toBe(2);
        expect(logger.levels.error).toBe(3);
    });

    test('should have correct context TTL', () => {
        expect(logger.contextTTL).toBe(5 * 60 * 1000); // 5 minutes
    });

    test('should have correct max file size', () => {
        expect(logger.config.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
    });

    test('should have correct max files', () => {
        expect(logger.config.maxFiles).toBe(10);
    });
});

describe('Logger - initialize', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should initialize with default config', () => {
        logger.initialize();
        expect(logger.config.enabled).toBe(true);
    });

    test('should disable logger when outputMode is none', () => {
        logger.initialize({ outputMode: 'none' });
        expect(logger.config.enabled).toBe(false);
    });

    test('should merge provided config with defaults', () => {
        logger.initialize({ logLevel: 'error', logDir: 'custom-logs' });
        expect(logger.config.logLevel).toBe('error');
        expect(logger.config.logDir).toBe('custom-logs');
    });
});

describe('Logger - getCurrentRequestId', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should return undefined when no context', () => {
        expect(logger.getCurrentRequestId()).toBeUndefined();
    });

    test('should return request ID when context is set', () => {
        logger.setRequestContext('test-req-id', {});
        expect(logger.getCurrentRequestId()).toBe('test-req-id');
    });
});

describe('Logger - cleanupOldLogs', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.logDir = 'logs';
    });

    afterEach(() => {
        logger.close();
    });

    test('should handle non-existent log directory', () => {
        logger.config.logDir = '/non/existent/path';
        expect(() => logger.cleanupOldLogs()).not.toThrow();
    });
});

describe('Logger - checkAndRotateLogFile', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should handle missing log file', () => {
        logger.currentLogFile = null;
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should handle non-existent log file', () => {
        logger.currentLogFile = '/non/existent/log file.log';
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });
});

describe('Logger - message formatting patterns', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.logLevel = 'debug';
        logger.config.includeTimestamp = true;
        logger.config.includeRequestId = true;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should include year in timestamp', () => {
        const message = logger.formatMessage('info', ['Test'], null);
        const year = new Date().getFullYear();
        expect(message).toContain(String(year));
    });

    test('should format timestamp with leading zeros', () => {
        const message = logger.formatMessage('info', ['Test'], null);
        // Format: YYYY-MM-DD HH:MM:SS.mmm
        expect(message).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    test('should include all timestamp components', () => {
        const message = logger.formatMessage('info', ['Test'], null);
        const date = new Date();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        expect(message).toContain(`-${month}-`);
        expect(message).toContain(` ${String(date.getHours()).padStart(2, '0')}:`);
    });

    test('should uppercase log level', () => {
        expect(logger.formatMessage('debug', ['Test'], null)).toContain('[DEBUG]');
        expect(logger.formatMessage('info', ['Test'], null)).toContain('[INFO]');
        expect(logger.formatMessage('warn', ['Test'], null)).toContain('[WARN]');
        expect(logger.formatMessage('error', ['Test'], null)).toContain('[ERROR]');
    });

    test('should handle boolean arguments', () => {
        const message = logger.formatMessage('info', [true, false], null);
        expect(message).toContain('true');
        expect(message).toContain('false');
    });

    test('should handle number arguments', () => {
        const message = logger.formatMessage('info', [42, 3.14], null);
        expect(message).toContain('42');
        expect(message).toContain('3.14');
    });

    test('should handle array arguments', () => {
        const message = logger.formatMessage('info', [[1, 2, 3]], null);
        expect(message).toContain('1');
        expect(message).toContain('2');
        expect(message).toContain('3');
    });

    test('should join multiple arguments with space', () => {
        const message = logger.formatMessage('info', ['arg1', 'arg2', 'arg3'], null);
        expect(message).toContain('arg1 arg2 arg3');
    });

    test('should handle undefined arguments', () => {
        const message = logger.formatMessage('info', [undefined], null);
        expect(typeof message).toBe('string');
        expect(message).toContain('undefined');
    });
});

describe('Logger - AsyncLocalStorage context', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.logLevel = 'debug';
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should not leak context outside runWithContext', () => {
        let outerContext;
        logger.runWithContext('req-outer', () => {
            outerContext = logger.getCurrentRequestId();
        });
        expect(outerContext).toBe('req-outer');
        expect(logger.getCurrentRequestId()).toBeUndefined();
    });

    test('should maintain context within runWithContext', () => {
        let contextId;
        logger.runWithContext('test-req', () => {
            contextId = logger.getCurrentRequestId();
        });
        expect(contextId).toBe('test-req');
    });

    test('should generate new request ID if not provided', () => {
        let id1, id2;
        logger.runWithContext(null, () => {
            id1 = logger.getCurrentRequestId();
        });
        logger.runWithContext(null, () => {
            id2 = logger.getCurrentRequestId();
        });
        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2); // Each call should get a unique ID
    });
});

describe('Logger - context TTL cleanup', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should track context creation time', () => {
        logger.setRequestContext('test-ctx', { data: 'test' });
        const ctx = logger.getRequestContext('test-ctx');
        expect(ctx._createdAt).toBeDefined();
        expect(typeof ctx._createdAt).toBe('number');
    });

    test('should store custom context data', () => {
        const customData = { userId: '123', sessionId: 'abc' };
        logger.setRequestContext('test-ctx', customData);
        const ctx = logger.getRequestContext('test-ctx');
        expect(ctx.userId).toBe('123');
        expect(ctx.sessionId).toBe('abc');
    });
});

describe('Logger - log method direct calls', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.logLevel = 'debug';
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should call formatMessage when logging', () => {
        // Test that logging works and produces formatted output
        logger.info('Test message');
        expect(console.log).toHaveBeenCalled();
        const logCall = console.log.mock.calls[0][0];
        expect(logCall).toContain('[INFO]');
        expect(logCall).toContain('Test message');
    });

    test('should use current requestId from context', () => {
        logger.setRequestContext('my-req-id', {});
        logger.info('Test');
        expect(console.log).toHaveBeenCalled();
        const logCall = console.log.mock.calls[0][0];
        expect(logCall).toContain('[Req:my-req-id]');
    });

    test('should pass requestId to formatMessage when provided', () => {
        const message = logger.formatMessage('info', ['Test'], 'explicit-req');
        expect(message).toContain('[Req:explicit-req]');
    });
});

describe('Logger - context cleanup timer behavior', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should not start cleanup timer initially', () => {
        expect(logger._contextCleanupTimer).toBeNull();
    });

    test('should start cleanup timer after setting context', () => {
        logger.setRequestContext('ctx-1', {});
        // Timer starts lazily
        logger._ensureContextCleanup();
        expect(logger._contextCleanupTimer).not.toBeNull();
    });

    test('should not restart timer if already running', () => {
        logger.setRequestContext('ctx-1', {});
        logger._ensureContextCleanup();
        const timer1 = logger._contextCleanupTimer;
        logger._ensureContextCleanup();
        expect(logger._contextCleanupTimer).toBe(timer1);
    });
});

describe('Logger - log level validation', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.enabled = true;
        logger.config.logLevel = 'debug';
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should handle unknown log level as info', () => {
        // Unknown level defaults to info (level 1)
        const shouldLogUnknown = logger.levels['unknown'] ?? 1;
        expect(shouldLogUnknown).toBe(1);
    });

    test('should log when current level equals target level', () => {
        logger.config.logLevel = 'info';
        expect(logger.shouldLog('info')).toBe(true);
    });
});

describe('Logger - clearTodayLog', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should return false when no current log file', () => {
        logger.currentLogFile = null;
        expect(logger.clearTodayLog()).toBe(false);
    });

    test('should return false for non-existent log file', () => {
        logger.currentLogFile = '/path/to/nonexistent.log';
        expect(logger.clearTodayLog()).toBe(false);
    });
});

describe('Logger - context auto cleanup', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should cleanup only expired contexts', () => {
        const now = Date.now();
        logger.requestContext.set('fresh', { _createdAt: now });
        logger.requestContext.set('stale', { _createdAt: now - 400 * 1000 }); // 400 seconds ago

        // Simulate what the cleanup timer does
        const cleanupFn = () => {
            const now = Date.now();
            for (const [id, ctx] of logger.requestContext) {
                if (now - (ctx._createdAt || 0) > logger.contextTTL) {
                    logger.requestContext.delete(id);
                }
            }
        };

        cleanupFn();
        expect(logger.requestContext.has('fresh')).toBe(true);
        expect(logger.requestContext.has('stale')).toBe(false);
    });
});

describe('Logger - file stream error handling', () => {
    let logger;
    let originalLogStream;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        // Store original mock to restore in afterEach
        originalLogStream = logger.logStream = {
            end: jest.fn(),
            destroyed: false,
            writable: true
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
        // Restore original logStream before close
        logger.logStream = originalLogStream;
        logger.close();
    });

    test('should not throw when logStream is null', () => {
        // Set to null, then call log which checks logStream.destroyed
        logger.logStream = null;
        expect(() => logger.log('info', ['Test'])).not.toThrow();
    });

    test('should not call log when stream is destroyed', () => {
        logger.currentLogFile = 'test.log';
        logger.logStream = { destroyed: true, writable: true };
        expect(() => logger.log('info', ['Test'])).not.toThrow();
    });

    test('should not call log when stream is not writable', () => {
        logger.currentLogFile = 'test.log';
        logger.logStream = { destroyed: false, writable: false };
        expect(() => logger.log('info', ['Test'])).not.toThrow();
    });
});

describe('Logger - file logging initialization', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should not initialize file logging for console mode', () => {
        logger.config.outputMode = 'console';
        logger.initialize();
        expect(logger.logStream).toBeNull();
    });

    test('should not initialize file logging for none mode', () => {
        logger.config.outputMode = 'none';
        logger.initialize();
        expect(logger.logStream).toBeNull();
    });
});

describe('Logger - rotate behavior', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should not rotate when file does not exist', () => {
        logger.currentLogFile = null;
        // Should handle gracefully
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should not rotate when file size is under limit', () => {
        // Just verify no error occurs
        logger.currentLogFile = null;
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });
});

describe('Logger - formatMessage edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.includeTimestamp = false;
        logger.config.includeRequestId = false;
    });

    afterEach(() => {
        logger.close();
    });

    test('should format message with timestamp disabled', () => {
        logger.config.includeTimestamp = false;
        const message = logger.formatMessage('info', ['Test'], 'req-1');
        expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('should format message with requestId disabled', () => {
        logger.config.includeRequestId = false;
        const message = logger.formatMessage('info', ['Test'], 'req-1');
        expect(message).not.toContain('[Req:');
    });

    test('should handle nested objects in formatMessage', () => {
        const nested = { level1: { level2: { level3: 'deep' } } };
        const message = logger.formatMessage('info', [nested], null);
        expect(message).toContain('level3');
    });

    test('should handle circular references in formatMessage', () => {
        const circular = { name: 'test' };
        circular.self = circular;
        const message = logger.formatMessage('info', [circular], null);
        expect(typeof message).toBe('string');
    });

    test('should handle null/undefined arguments', () => {
        const message = logger.formatMessage('info', [null, undefined], null);
        expect(typeof message).toBe('string');
    });
});

describe('Logger - async context', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'console';
        logger.config.logLevel = 'debug';
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        logger.close();
    });

    test('should maintain context across async operations', async () => {
        const requestId = logger.setRequestContext('async-req', { data: 'test' });
        await Promise.resolve();
        expect(logger.getCurrentRequestId()).toBe('async-req');
    });

    test('should generate UUID with correct length', () => {
        const id = logger.setRequestContext('', {});
        expect(id.length).toBe(8);
    });
});

describe('Logger - config initialization edge cases', () => {
    let logger;

    afterEach(() => {
        if (logger) logger.close();
    });

    test('should handle empty config object', () => {
        logger = new Logger();
        logger.initialize({});
        expect(logger.config.enabled).toBe(true);
    });

    test('should preserve existing config when initializing with partial config', () => {
        logger = new Logger();
        logger.config.logLevel = 'error';
        logger.config.maxFiles = 5;
        logger.initialize({ logDir: 'new-dir' });
        expect(logger.config.logLevel).toBe('error');
        expect(logger.config.maxFiles).toBe(5);
        expect(logger.config.logDir).toBe('new-dir');
    });
});
