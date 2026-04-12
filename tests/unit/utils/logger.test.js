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
