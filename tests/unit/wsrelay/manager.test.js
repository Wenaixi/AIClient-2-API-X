/**
 * WSRelay Manager 单元测试
 *
 * 测试 WSRelayManager 和 WSSession 的核心功能
 */

import { WSRelayManager, WSSession, MessageType } from '../../../src/wsrelay/index.js';

describe('WSRelayManager', () => {
    let manager;

    beforeEach(() => {
        manager = new WSRelayManager({
            path: '/v1/ws',
            onConnected: jest.fn(),
            onDisconnected: jest.fn()
        });
    });

    afterEach(async () => {
        await manager.stop();
    });

    describe('constructor', () => {
        test('should create manager with default config', () => {
            const m = new WSRelayManager();
            expect(m.path).toBe('/v1/ws');
            expect(m.sessions.size).toBe(0);
            m.stop();
        });

        test('should normalize path', () => {
            const m = new WSRelayManager({ path: 'v1/ws' });
            expect(m.path).toBe('/v1/ws');
            m.stop();
        });

        test('should handle empty path', () => {
            const m = new WSRelayManager({ path: '' });
            expect(m.path).toBe('/v1/ws');
            m.stop();
        });

        test('should handle null path', () => {
            const m = new WSRelayManager({ path: null });
            expect(m.path).toBe('/v1/ws');
            m.stop();
        });
    });

    describe('getPath', () => {
        test('should return configured path', () => {
            expect(manager.getPath()).toBe('/v1/ws');
        });
    });

    describe('matchesPath', () => {
        test('should match exact path', () => {
            expect(manager.matchesPath('/v1/ws')).toBe(true);
        });

        test('should not match different path', () => {
            expect(manager.matchesPath('/v1/other')).toBe(false);
        });

        test('should not match partial path', () => {
            expect(manager.matchesPath('/v1')).toBe(false);
        });
    });

    describe('session management', () => {
        test('should return null for non-existent session', () => {
            expect(manager.getSession('unknown')).toBeUndefined();
        });

        test('should return empty array for active providers', () => {
            expect(manager.getActiveProviders()).toEqual([]);
        });

        test('should return correct stats', () => {
            const stats = manager.getStats();
            expect(stats).toHaveProperty('totalConnections');
            expect(stats).toHaveProperty('activeSessions');
            expect(stats.activeSessions).toBe(0);
        });
    });

    describe('send', () => {
        test('should throw error for non-existent provider', async () => {
            await expect(manager.send('unknown', { id: '1' }))
                .rejects.toThrow('wsrelay: provider unknown not connected');
        });
    });

    describe('stop', () => {
        test('should clear all sessions', async () => {
            await manager.stop();
            expect(manager.sessions.size).toBe(0);
            expect(manager.getStats().activeSessions).toBe(0);
        });

        test('should emit manager:stopped event', async () => {
            const listener = jest.fn();
            manager.on('manager:stopped', listener);
            await manager.stop();
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('createHandler', () => {
        test('should return a function', () => {
            const handler = manager.createHandler();
            expect(typeof handler).toBe('function');
        });
    });
});

describe('MessageType', () => {
    test('should have all expected types', () => {
        expect(MessageType.Ping).toBe('ping');
        expect(MessageType.Pong).toBe('pong');
        expect(MessageType.HTTPReq).toBe('http_req');
        expect(MessageType.HTTPResp).toBe('http_resp');
        expect(MessageType.StreamData).toBe('stream_data');
        expect(MessageType.StreamEnd).toBe('stream_end');
        expect(MessageType.Error).toBe('error');
    });
});

describe('WSSession', () => {
    describe('constructor', () => {
        test('should create session with id', () => {
            const mockWs = {
                on: jest.fn(),
                close: jest.fn(),
                ping: jest.fn()
            };
            const session = new WSSession(mockWs, null, 'test-id', {});
            expect(session.id).toBe('test-id');
            expect(session.closed).toBe(false);
        });

        test('should default provider to empty string', () => {
            const mockWs = { on: jest.fn() };
            const session = new WSSession(mockWs, null, 'test-id', {});
            expect(session.provider).toBe('');
        });
    });

    describe('send', () => {
        test('should throw error when session is closed', async () => {
            const mockWs = { on: jest.fn() };
            const session = new WSSession(mockWs, null, 'test-id', {});
            session.closed = true;

            await expect(session.send({ type: 'test' }))
                .rejects.toThrow('session closed');
        });
    });

    describe('cleanup', () => {
        test('should not cleanup twice', () => {
            const mockWs = {
                on: jest.fn(),
                close: jest.fn()
            };
            const session = new WSSession(mockWs, null, 'test-id', {});
            session.closed = true;

            session.cleanup(new Error('test'));

            // Should not throw
            expect(() => session.cleanup(new Error('test'))).not.toThrow();
        });

        test('should close websocket', () => {
            const mockWs = {
                on: jest.fn(),
                close: jest.fn()
            };
            const session = new WSSession(mockWs, null, 'test-id', {});

            session.cleanup(new Error('test'));

            expect(mockWs.close).toHaveBeenCalled();
        });
    });

    describe('request', () => {
        test('should throw error for missing id', () => {
            const mockWs = { on: jest.fn() };
            const session = new WSSession(mockWs, null, 'test-id', {});

            return expect(session.request({}))
                .rejects.toThrow('wsrelay: message id is required');
        });

        test('should throw error for closed session', () => {
            const mockWs = { on: jest.fn() };
            const session = new WSSession(mockWs, null, 'test-id', {});
            session.closed = true;

            return expect(session.request({ id: '1' }))
                .rejects.toThrow('session closed');
        });

        test('should throw error for duplicate id', async () => {
            const mockWs = {
                on: jest.fn(),
                send: jest.fn((data, cb) => cb && cb(null))
            };
            const session = new WSSession(mockWs, null, 'test-id', {});

            // 第一个请求应该成功
            await session.request({ id: 'test-1' });

            // 第二个相同 ID 的请求应该失败
            await expect(session.request({ id: 'test-1' }))
                .rejects.toThrow('wsrelay: duplicate message id test-1');
        });
    });
});

describe('WSRelayManager with callbacks', () => {
    test('should call onConnected when session connects', async () => {
        const onConnected = jest.fn();
        const manager = new WSRelayManager({
            onConnected
        });

        // 模拟会话注册
        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);

        expect(onConnected).toHaveBeenCalledWith('test-provider');
        await manager.stop();
    });

    test('should call onDisconnected when session disconnects', async () => {
        const onDisconnected = jest.fn();
        const manager = new WSRelayManager({
            onDisconnected
        });

        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        // 注册后再注销
        manager._registerSession(mockSession);
        manager._unregisterSession(mockSession, new Error('test error'));

        expect(onDisconnected).toHaveBeenCalledWith('test-provider', expect.any(Error));
        await manager.stop();
    });
});

describe('WSRelayManager events', () => {
    test('should emit session:connected event', async () => {
        const manager = new WSRelayManager();
        const listener = jest.fn();
        manager.on('session:connected', listener);

        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);

        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'test-provider',
                session: mockSession
            })
        );

        await manager.stop();
    });

    test('should emit session:disconnected event', async () => {
        const manager = new WSRelayManager();
        const listener = jest.fn();
        manager.on('session:disconnected', listener);

        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);
        manager._unregisterSession(mockSession, new Error('disconnect'));

        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'test-provider',
                cause: expect.any(Error)
            })
        );

        await manager.stop();
    });
});

describe('getDefaultManager', () => {
    test('should return singleton instance', () => {
        const { getDefaultManager, stopDefaultManager } = require('../../../src/wsrelay/index.js');

        const manager1 = getDefaultManager();
        const manager2 = getDefaultManager();

        expect(manager1).toBe(manager2);

        // 清理
        stopDefaultManager();
    });

    test('should return new instance after stop', () => {
        const { getDefaultManager, stopDefaultManager } = require('../../../src/wsrelay/index.js');

        const manager1 = getDefaultManager();
        stopDefaultManager();

        const manager2 = getDefaultManager();

        expect(manager1).not.toBe(manager2);
    });
});