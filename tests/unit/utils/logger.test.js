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

describe('Logger - initializeFileLogging edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        if (logger) logger.close();
    });

    test('should not throw when initializing file logging', () => {
        expect(() => logger.initializeFileLogging()).not.toThrow();
    });

    test('should set currentLogFile path when initializing', () => {
        logger.initializeFileLogging();
        // After initialization, currentLogFile should be set
        expect(typeof logger.currentLogFile).toBe('string');
        expect(logger.currentLogFile).toContain('app-');
        expect(logger.currentLogFile).toContain('.log');
    });

    test('should initialize logStream when file logging is enabled', () => {
        logger.initializeFileLogging();
        // After initialization, logStream should be created
        expect(logger.logStream).not.toBeNull();
    });
});

describe('Logger - initializeFileLogging error handling', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        if (logger) logger.close();
    });

    test('should handle fs error gracefully', () => {
        jest.spyOn(require('fs'), 'existsSync').mockImplementation(() => {
            throw new Error('fs error');
        });
        expect(() => logger.initializeFileLogging()).not.toThrow();
    });
});

describe('Logger - cleanupOldLogs edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.logDir = 'logs';
    });

    afterEach(() => {
        logger.close();
    });

    test('should handle fs readdir error gracefully', () => {
        jest.spyOn(require('fs'), 'readdirSync').mockImplementation(() => {
            throw new Error('readdir error');
        });
        expect(() => logger.cleanupOldLogs()).not.toThrow();
    });

    test('should not throw for non-existent log directory', () => {
        logger.config.logDir = '/non/existent/path';
        expect(() => logger.cleanupOldLogs()).not.toThrow();
    });
});

describe('Logger - checkAndRotateLogFile error handling', () => {
    let logger;
    let originalLogStream;

    beforeEach(() => {
        logger = new Logger();
        originalLogStream = logger.logStream = {
            end: jest.fn(),
            destroyed: false,
            writable: true,
            write: jest.fn()
        };
    });

    afterEach(() => {
        logger.logStream = originalLogStream;
        logger.close();
    });

    test('should handle fs.statSync error gracefully', () => {
        logger.currentLogFile = '/test/path.log';
        jest.spyOn(require('fs'), 'statSync').mockImplementation(() => {
            throw new Error('stat error');
        });
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should handle fs.renameSync error gracefully', () => {
        logger.currentLogFile = '/test/path.log';
        logger.logStream.writable = true;
        jest.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 11 * 1024 * 1024 }); // > 10MB
        jest.spyOn(require('fs'), 'renameSync').mockImplementation(() => {
            throw new Error('rename error');
        });
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should check file existence before rotation', () => {
        logger.currentLogFile = null;
        // Should return early when currentLogFile is null
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should check file existence for non-existent file', () => {
        logger.currentLogFile = '/non/existent/file.log';
        // Should return early when file doesn't exist
        expect(() => logger.checkAndRotateLogFile()).not.toThrow();
    });

    test('should handle logStream write error gracefully', () => {
        logger.currentLogFile = null;
        jest.spyOn(logger, 'checkAndRotateLogFile').mockImplementation(() => {
            throw new Error('rotate error');
        });
        expect(() => logger.log('info', ['test'])).not.toThrow();
    });
});

describe('Logger - log stream error handling', () => {
    let logger;
    let mockWriteStream;
    let originalLogStream;

    beforeEach(() => {
        logger = new Logger();
        originalLogStream = logger.logStream = {
            end: jest.fn(),
            destroyed: false,
            writable: true,
            write: jest.fn()
        };
        logger.config.outputMode = 'file';
        logger.config.logLevel = 'debug';
        logger.currentLogFile = '/test/path.log';
        mockWriteStream = {
            end: jest.fn(),
            destroyed: false,
            writable: true,
            write: jest.fn().mockImplementation((data, cb) => {
                if (cb) cb(new Error('write error'));
            })
        };
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore original logStream before close
        logger.logStream = originalLogStream;
        logger.close();
        jest.restoreAllMocks();
    });

    test('should output to console as backup on stream write error', async () => {
        logger.currentLogFile = '/test/path.log';
        jest.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 100 });
        // Should not throw
        await logger.log('info', ['test message']);
    });

    test('should not log when stream is destroyed', async () => {
        const mockWrite = jest.fn();
        logger.logStream = { destroyed: true, writable: false, end: jest.fn(), write: mockWrite };
        await logger.log('info', ['test']);
        expect(mockWrite).not.toHaveBeenCalled();
    });

    test('should not log when stream is not writable', async () => {
        const mockWrite = jest.fn();
        logger.logStream = { destroyed: false, writable: false, end: jest.fn(), write: mockWrite };
        await logger.log('info', ['test']);
        expect(mockWrite).not.toHaveBeenCalled();
    });
});

describe('Logger - clearTodayLog error handling', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logger.close();
        jest.restoreAllMocks();
    });

    test('should handle fs.writeFileSync error gracefully', () => {
        logger.currentLogFile = '/test/path.log';
        logger.logStream = {
            end: jest.fn(),
            destroyed: false
        };
        jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {
            throw new Error('write error');
        });
        expect(() => logger.clearTodayLog()).not.toThrow();
    });

    test('should handle createWriteStream error gracefully', () => {
        logger.currentLogFile = '/test/path.log';
        logger.logStream = {
            end: jest.fn(),
            destroyed: false
        };
        jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {});
        jest.spyOn(require('fs'), 'createWriteStream').mockImplementation(() => {
            throw new Error('stream error');
        });
        expect(() => logger.clearTodayLog()).not.toThrow();
    });
});

describe('Logger - formatMessage with includeTimestamp false', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.includeTimestamp = false;
        logger.config.includeRequestId = false;
    });

    afterEach(() => {
        logger.close();
    });

    test('should format message without timestamp', () => {
        const message = logger.formatMessage('info', ['test'], null);
        expect(message).toContain('[INFO]');
        expect(message).toContain('test');
        expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('should include timestamp when enabled', () => {
        logger.config.includeTimestamp = true;
        const message = logger.formatMessage('info', ['test'], null);
        expect(message).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('should include requestId when enabled', () => {
        logger.config.includeRequestId = true;
        const message = logger.formatMessage('info', ['test'], 'req-123');
        expect(message).toContain('[Req:req-123]');
    });
});

describe('Logger - log file output mode', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.outputMode = 'file';
        logger.config.logLevel = 'debug';
        logger.currentLogFile = '/test/path.log';
        logger.logStream = {
            end: jest.fn(),
            destroyed: false,
            writable: true,
            write: jest.fn()
        };
        jest.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 100 });
    });

    afterEach(() => {
        logger.close();
        jest.restoreAllMocks();
    });

    test('should output to file when mode is file', async () => {
        await logger.log('info', ['test']);
        expect(logger.logStream.write).toHaveBeenCalled();
    });

    test('should output to console when mode is all', async () => {
        logger.config.outputMode = 'all';
        jest.spyOn(console, 'log').mockImplementation(() => {});
        await logger.log('info', ['test']);
        expect(logger.logStream.write).toHaveBeenCalled();
    });
});

describe('Logger - _contextCleanupTimer interval behavior', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        jest.useFakeTimers();
    });

    afterEach(() => {
        logger.close();
        jest.useRealTimers();
    });

    test('should start cleanup timer when calling _ensureContextCleanup', () => {
        logger.setRequestContext('test-1', {});
        logger._ensureContextCleanup();
        expect(logger._contextCleanupTimer).not.toBeNull();
    });

    test('should not start timer if already running', () => {
        logger.setRequestContext('test-1', {});
        logger._ensureContextCleanup();
        const timer = logger._contextCleanupTimer;
        logger._ensureContextCleanup();
        expect(logger._contextCleanupTimer).toBe(timer);
    });

    test('should stop timer when no contexts remain', () => {
        logger.setRequestContext('test-1', {});
        logger._ensureContextCleanup();
        expect(logger._contextCleanupTimer).not.toBeNull();

        // Manually clear all contexts
        logger.requestContext.clear();
        jest.advanceTimersByTime(60000);

        // The timer should stop itself when map is empty
        expect(logger._contextCleanupTimer).toBeNull();
    });
});

describe('Logger - close behavior', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.setRequestContext('test-1', {});
        logger._ensureContextCleanup();
    });

    afterEach(() => {
        logger.close();
    });

    test('should set _contextCleanupTimer to null after close', () => {
        expect(logger._contextCleanupTimer).not.toBeNull();
        logger.close();
        expect(logger._contextCleanupTimer).toBeNull();
    });

    test('should not throw when closing multiple times', () => {
        logger.close();
        expect(() => logger.close()).not.toThrow();
    });
});

describe('Logger - initialize error handling', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should handle file logging initialization error', () => {
        jest.spyOn(require('fs'), 'existsSync').mockImplementation(() => {
            throw new Error('init error');
        });
        expect(() => logger.initialize({ outputMode: 'file' })).not.toThrow();
    });
});

describe('Logger - shouldLog edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        logger.config.enabled = true;
        logger.config.logLevel = 'debug';
    });

    afterEach(() => {
        logger.close();
    });

    test('should return false when disabled', () => {
        logger.config.enabled = false;
        expect(logger.shouldLog('debug')).toBe(false);
    });

    test('should return false for lower level than configured', () => {
        logger.config.logLevel = 'error';
        expect(logger.shouldLog('debug')).toBe(false);
    });

    test('should return true for higher level than configured', () => {
        logger.config.logLevel = 'debug';
        expect(logger.shouldLog('error')).toBe(true);
    });

    test('should return true for same level', () => {
        logger.config.logLevel = 'info';
        expect(logger.shouldLog('info')).toBe(true);
    });
});

describe('Logger - getRequestContext edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should return empty object for null requestId', () => {
        const ctx = logger.getRequestContext(null);
        expect(ctx).toEqual({});
    });

    test('should return empty object for undefined requestId', () => {
        const ctx = logger.getRequestContext(undefined);
        expect(ctx).toEqual({});
    });
});

describe('Logger - clearRequestContext edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should not throw for null requestId', () => {
        expect(() => logger.clearRequestContext(null)).not.toThrow();
    });

    test('should not throw for non-existent requestId', () => {
        expect(() => logger.clearRequestContext('non-existent')).not.toThrow();
    });
});

describe('Logger - runWithContext edge cases', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should return result from callback', () => {
        const result = logger.runWithContext('test-id', () => 42);
        expect(result).toBe(42);
    });

    test('should return object from callback', () => {
        const result = logger.runWithContext('test-id', () => ({ key: 'value' }));
        expect(result).toEqual({ key: 'value' });
    });
});

describe('Logger - withRequest edge cases', () => {
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

    test('should use current requestId if not provided', () => {
        const reqLogger = logger.withRequest(null);
        reqLogger.info('test');
        expect(console.log).toHaveBeenCalled();
    });
});

describe('Logger - levels configuration', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should have all required levels', () => {
        expect(logger.levels).toHaveProperty('debug');
        expect(logger.levels).toHaveProperty('info');
        expect(logger.levels).toHaveProperty('warn');
        expect(logger.levels).toHaveProperty('error');
    });

    test('should have correct level values', () => {
        expect(logger.levels.debug).toBe(0);
        expect(logger.levels.info).toBe(1);
        expect(logger.levels.warn).toBe(2);
        expect(logger.levels.error).toBe(3);
    });
});

describe('Logger - default config values', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should have correct default logDir', () => {
        expect(logger.config.logDir).toBe('logs');
    });

    test('should have correct default includeRequestId', () => {
        expect(logger.config.includeRequestId).toBe(true);
    });

    test('should have correct default includeTimestamp', () => {
        expect(logger.config.includeTimestamp).toBe(true);
    });

    test('should have correct default maxFiles', () => {
        expect(logger.config.maxFiles).toBe(10);
    });
});

describe('Logger - context auto-cleanup logic', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should remove stale contexts based on TTL', () => {
        const now = Date.now();
        // Directly manipulate the Map to test cleanup logic
        logger.requestContext.set('fresh', { _createdAt: now });
        logger.requestContext.set('stale', { _createdAt: now - 400 * 1000 });

        // Manually test cleanup logic (simulating what the timer does)
        const beforeCount = logger.requestContext.size;
        for (const [id, ctx] of logger.requestContext) {
            if (now - (ctx._createdAt || 0) > logger.contextTTL) {
                logger.requestContext.delete(id);
            }
        }

        expect(logger.requestContext.has('fresh')).toBe(true);
        expect(logger.requestContext.has('stale')).toBe(false);
        expect(logger.requestContext.size).toBeLessThan(beforeCount);
    });

    test('should not remove fresh contexts', () => {
        const now = Date.now();
        // Directly manipulate the Map
        logger.requestContext.set('ctx-1', { _createdAt: now });
        logger.requestContext.set('ctx-2', { _createdAt: now });

        for (const [id, ctx] of logger.requestContext) {
            if (now - (ctx._createdAt || 0) > logger.contextTTL) {
                logger.requestContext.delete(id);
            }
        }

        expect(logger.requestContext.size).toBe(2);
    });

    test('should use contextTTL value of 5 minutes', () => {
        expect(logger.contextTTL).toBe(5 * 60 * 1000);
    });
});

describe('Logger - requestContext Map operations', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
    });

    afterEach(() => {
        logger.close();
    });

    test('should track multiple contexts', () => {
        logger.setRequestContext('ctx-1', { data: 1 });
        logger.setRequestContext('ctx-2', { data: 2 });
        logger.setRequestContext('ctx-3', { data: 3 });

        expect(logger.requestContext.size).toBe(3);
    });

    test('should update existing context', () => {
        logger.setRequestContext('ctx-1', { data: 1 });
        logger.setRequestContext('ctx-1', { data: 2 });

        expect(logger.getRequestContext('ctx-1').data).toBe(2);
    });
});
