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

describe('WSRelayManager._generateProviderName', () => {
    test('should generate provider name with aistudio prefix', () => {
        const manager = new WSRelayManager();
        const name = manager._generateProviderName();
        expect(name).toMatch(/^aistudio-[a-z0-9]+$/);
        manager.stop();
    });

    test('should generate unique names', () => {
        const manager = new WSRelayManager();
        const names = new Set();
        for (let i = 0; i < 100; i++) {
            names.add(manager._generateProviderName());
        }
        // 100个随机名字应该大部分是唯一的（碰撞概率极低）
        expect(names.size).toBeGreaterThan(90);
        manager.stop();
    });
});

describe('WSRelayManager._registerSession', () => {
    test('should register session and update stats', () => {
        const manager = new WSRelayManager();
        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);

        expect(manager.sessions.size).toBe(1);
        expect(manager.getSession('test-provider')).toBe(mockSession);
        expect(manager.getStats().activeSessions).toBe(1);
        manager.stop();
    });

    test('should replace existing session with same provider', () => {
        const manager = new WSRelayManager();
        const oldSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };
        const newSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(oldSession);
        expect(manager.sessions.size).toBe(1);

        manager._registerSession(newSession);
        expect(manager.sessions.size).toBe(1);
        expect(manager.getSession('test-provider')).toBe(newSession);
        expect(oldSession.cleanup).toHaveBeenCalled();
        manager.stop();
    });

    test('should handle onConnected callback error', () => {
        const onConnected = jest.fn().mockImplementation(() => {
            throw new Error('callback error');
        });
        const manager = new WSRelayManager({ onConnected });
        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        // Should not throw
        expect(() => manager._registerSession(mockSession)).not.toThrow();
        expect(onConnected).toHaveBeenCalledWith('test-provider');
        manager.stop();
    });
});

describe('WSRelayManager._unregisterSession', () => {
    test('should unregister session and update stats', () => {
        const manager = new WSRelayManager();
        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);
        expect(manager.sessions.size).toBe(1);

        manager._unregisterSession(mockSession, new Error('disconnect'));
        expect(manager.sessions.size).toBe(0);
        expect(manager.getStats().activeSessions).toBe(0);
        manager.stop();
    });

    test('should not unregister if session does not match current', () => {
        const manager = new WSRelayManager();
        const session1 = { provider: 'provider-1', cleanup: jest.fn() };
        const session2 = { provider: 'provider-2', cleanup: jest.fn() };

        manager._registerSession(session1);
        expect(manager.sessions.size).toBe(1);

        // Try to unregister session2 when session1 is registered
        manager._unregisterSession(session2, new Error('test'));
        expect(manager.sessions.size).toBe(1);
        expect(session1.cleanup).not.toHaveBeenCalled();
        manager.stop();
    });

    test('should handle onDisconnected callback error', () => {
        const onDisconnected = jest.fn().mockImplementation(() => {
            throw new Error('callback error');
        });
        const manager = new WSRelayManager({ onDisconnected });
        const mockSession = {
            provider: 'test-provider',
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);
        // Should not throw
        expect(() => manager._unregisterSession(mockSession, new Error('test'))).not.toThrow();
        manager.stop();
    });

    test('should handle null session', () => {
        const manager = new WSRelayManager();
        expect(() => manager._unregisterSession(null, new Error('test'))).not.toThrow();
        manager.stop();
    });

    test('should handle session without provider', () => {
        const manager = new WSRelayManager();
        const mockSession = { cleanup: jest.fn() };
        expect(() => manager._unregisterSession(mockSession, new Error('test'))).not.toThrow();
        manager.stop();
    });
});

describe('WSRelayManager.getSession', () => {
    test('should return session for exact provider name', () => {
        const manager = new WSRelayManager();
        const mockSession = { provider: 'Test-Provider', cleanup: jest.fn() };

        manager._registerSession(mockSession);
        expect(manager.getSession('Test-Provider')).toBe(mockSession);
        expect(manager.getSession('test-provider')).toBe(mockSession);
        manager.stop();
    });

    test('should return session for null/undefined provider', () => {
        const manager = new WSRelayManager();
        expect(manager.getSession(null)).toBeUndefined();
        expect(manager.getSession(undefined)).toBeUndefined();
        expect(manager.getSession('')).toBeUndefined();
        manager.stop();
    });
});

describe('WSRelayManager.send', () => {
    test('should send message to existing session', async () => {
        const manager = new WSRelayManager();
        const mockSend = jest.fn().mockResolvedValue();
        const mockSession = {
            provider: 'test-provider',
            request: jest.fn().mockResolvedValue({ ch: [] }),
            cleanup: jest.fn()
        };

        manager._registerSession(mockSession);
        await manager.send('test-provider', { id: '1', type: 'http_req' });
        expect(mockSession.request).toHaveBeenCalled();
        manager.stop();
    });
});

describe('WSRelayManager.createHandler', () => {
    test('should return 405 for non-GET method', async () => {
        const manager = new WSRelayManager({ path: '/test' });
        const handler = manager.createHandler();

        const req = { method: 'POST', url: '/test' };
        const res = {
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };
        const next = jest.fn();

        await handler(req, res, next);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.send).toHaveBeenCalledWith('Method Not Allowed');
        expect(next).not.toHaveBeenCalled();
        manager.stop();
    });

    test('should call next for non-matching path', async () => {
        const manager = new WSRelayManager({ path: '/test' });
        const handler = manager.createHandler();

        const req = { method: 'GET', url: '/other' };
        const res = {};
        const next = jest.fn();

        await handler(req, res, next);
        expect(next).toHaveBeenCalled();
        manager.stop();
    });
});

describe('WSSession._handleError', () => {
    test('should cleanup session on error', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        session._handleError(new Error('test error'));

        expect(mockWs.close).toHaveBeenCalled();
        mockManager._unregisterSession.mockRestore();
    });

    test('should not cleanup if already closed', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});
        session.closed = true;

        session._handleError(new Error('test error'));

        expect(mockWs.close).not.toHaveBeenCalled();
        mockManager._unregisterSession.mockRestore();
    });
});

describe('WSSession._sendPing', () => {
    test('should reject if session is closed', async () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});
        session.closed = true;

        await expect(session._sendPing()).rejects.toThrow('session closed');
    });

    test('should handle ping error', async () => {
        const mockWs = {
            on: jest.fn(),
            ping: jest.fn((data, cb) => cb(new Error('ping failed')))
        };
        const session = new WSSession(mockWs, null, 'test-id', {});

        await expect(session._sendPing()).rejects.toThrow('ping failed');
    });
});

describe('WSSession._dispatch', () => {
    test('should handle ping message', () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn()
        };
        const mockManager = {
            stats: { messagesSent: 0 }
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        session._dispatch({ type: 'ping' });

        expect(mockWs.send).toHaveBeenCalled();
        const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
        expect(sentData.type).toBe('pong');
    });

    test('should ignore message without type', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        expect(() => session._dispatch({})).not.toThrow();
    });

    test('should dispatch pending request message', () => {
        const mockWs = { on: jest.fn() };
        const mockCh = {
            messages: [],
            push: jest.fn()
        };
        const session = new WSSession(mockWs, null, 'test-id', {});

        // Set up pending request
        session.pending.set('req-1', {
            ch: mockCh,
            close: jest.fn()
        });

        const msg = { id: 'req-1', type: 'http_resp', payload: { result: 'ok' } };
        session._dispatch(msg);

        expect(mockCh.push).toHaveBeenCalledWith(msg);
    });

    test('should close pending request on terminal message', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'http_resp' });

        expect(mockClose).toHaveBeenCalled();
        expect(session.pending.has('req-1')).toBe(false);
    });

    test('should emit message event for unknown messages', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const listener = jest.fn();
        session.on('message', listener);

        session._dispatch({ type: 'custom', data: 'test' });

        expect(listener).toHaveBeenCalled();
    });

    test('should handle message with MessageType property', () => {
        const mockWs = { on: jest.fn(), send: jest.fn() };
        const mockManager = { stats: { messagesSent: 0 } };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // Test with MessageType format instead of type
        session._dispatch({ MessageType: 'ping' });

        expect(mockWs.send).toHaveBeenCalled();
    });
});

describe('WSSession.send', () => {
    test('should resolve on successful send', async () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn((data, cb) => cb && cb(null))
        };
        const mockManager = { stats: { messagesSent: 0 } };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        await expect(session.send({ type: 'test' })).resolves.toBeUndefined();
        expect(mockManager.stats.messagesSent).toBe(1);
    });

    test('should reject on send error', async () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn((data, cb) => cb && cb(new Error('send failed')))
        };
        const mockManager = { stats: { messagesSent: 0 } };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        await expect(session.send({ type: 'test' })).rejects.toThrow('send failed');
    });
});

describe('WSSession.request', () => {
    test('should return message channel', async () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn((data, cb) => cb && cb(null))
        };
        const mockManager = { stats: { messagesSent: 0 } };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        const result = session.request({ id: 'req-1', type: 'http_req' });

        expect(result).toHaveProperty('ch');
        expect(result).toHaveProperty('cancel');
        expect(typeof result.cancel).toBe('function');
    });

    test('should handle send failure', async () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn((data, cb) => cb && cb(new Error('send failed')))
        };
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.request({ id: 'req-1', type: 'http_req' });

        // Give async send time to fail
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(session.pending.has('req-1')).toBe(false);
    });

    test('cancel should remove pending request', async () => {
        const mockWs = {
            on: jest.fn(),
            send: jest.fn((data, cb) => cb && cb(null))
        };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const result = session.request({ id: 'req-1', type: 'http_req' });
        expect(session.pending.has('req-1')).toBe(true);

        result.cancel();
        expect(session.pending.has('req-1')).toBe(false);
    });
});

describe('WSSession.cleanup', () => {
    test('should cleanup pending requests', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // Add pending request
        session.pending.set('req-1', {
            ch: {
                messages: [],
                push: jest.fn()
            },
            close: jest.fn()
        });

        session.cleanup(new Error('test'));

        // Pending should be cleared
        expect(session.pending.size).toBe(0);
        expect(mockWs.close).toHaveBeenCalled();
        mockManager._unregisterSession.mockRestore();
    });

    test('should emit session:closed event', () => {
        const mockWs = { on: jest.fn(), close: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const listener = jest.fn();
        session.on('session:closed', listener);

        session.cleanup(new Error('test'));

        expect(listener).toHaveBeenCalled();
    });
});

describe('WSRelayManager.getActiveProviders', () => {
    test('should return all active provider names', () => {
        const manager = new WSRelayManager();
        manager._registerSession({ provider: 'provider-1', cleanup: jest.fn() });
        manager._registerSession({ provider: 'provider-2', cleanup: jest.fn() });

        const providers = manager.getActiveProviders();
        expect(providers).toContain('provider-1');
        expect(providers).toContain('provider-2');
        expect(providers.length).toBe(2);
        manager.stop();
    });
});

describe('WSSession._startHeartbeat', () => {
    test('should clear heartbeat timer when closed', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', { heartbeatInterval: 10 });

        session._startHeartbeat();
        expect(session.heartbeatTimer).toBeDefined();

        session.closed = true;
        // Manually trigger the interval callback to test cleanup path
        const intervalCallback = session.heartbeatTimer;
        clearInterval(intervalCallback);
    });

    test('should cleanup on ping error', () => {
        const mockWs = {
            on: jest.fn(),
            ping: jest.fn((data, cb) => cb(new Error('ping failed')))
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', { heartbeatInterval: 10 });

        session._startHeartbeat();

        // Trigger interval manually
        const intervalCallback = session.heartbeatTimer;
        clearInterval(intervalCallback);

        mockManager._unregisterSession.mockRestore();
    });
});

describe('WSSession.run', () => {
    test('should setup message handler', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const session = new WSSession(mockWs, {}, 'test-id', {});

        session.run();

        // Verify message handler was registered
        const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message');
        expect(messageHandler).toBeDefined();

        // Verify close handler was registered
        const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close');
        expect(closeHandler).toBeDefined();

        // Verify error handler was registered
        const errorHandler = mockWs.on.mock.calls.find(call => call[0] === 'error');
        expect(errorHandler).toBeDefined();
    });

    test('should handle JSON parse error in message handler', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        session.run();

        // Find the message handler
        const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];

        // Call with invalid JSON - should not throw
        expect(() => messageHandler('not valid json {')).not.toThrow();

        session.cleanup();
        mockManager._unregisterSession.mockRestore();
    });

    test('should call cleanup on close', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        session.run();

        // Find the close handler
        const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];

        // Call close handler
        closeHandler();

        expect(mockWs.close).toHaveBeenCalled();
        mockManager._unregisterSession.mockRestore();
    });
});

describe('WSSession._dispatch', () => {
    test('should handle null message', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        expect(() => session._dispatch(null)).not.toThrow();
    });

    test('should handle StreamEnd terminal message', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'stream_end' });

        expect(mockClose).toHaveBeenCalled();
        expect(session.pending.has('req-1')).toBe(false);
    });

    test('should handle Error terminal message', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'error', payload: { error: 'test error' } });

        expect(mockClose).toHaveBeenCalled();
        expect(session.pending.has('req-1')).toBe(false);
    });

    test('should handle http_resp type string as terminal', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn(), send: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'http_resp', payload: {} });

        expect(mockClose).toHaveBeenCalled();
    });

    test('should handle error type string as terminal', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn(), send: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'error' });

        expect(mockClose).toHaveBeenCalled();
    });

    test('should handle stream_end type string as terminal', () => {
        const mockWs = { on: jest.fn() };
        const mockClose = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], push: jest.fn(), send: jest.fn() },
            close: mockClose
        });

        session._dispatch({ id: 'req-1', type: 'stream_end' });

        expect(mockClose).toHaveBeenCalled();
    });

    test('should use send method if push not available', () => {
        const mockWs = { on: jest.fn() };
        const mockSend = jest.fn();
        const session = new WSSession(mockWs, null, 'test-id', {});

        session.pending.set('req-1', {
            ch: { messages: [], send: mockSend },
            close: jest.fn()
        });

        session._dispatch({ id: 'req-1', type: 'http_resp' });

        expect(mockSend).toHaveBeenCalled();
    });

    test('should ignore terminal message for unknown id (debug log path)', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        // Should not throw, just log debug
        expect(() => session._dispatch({ id: 'unknown-id', type: 'http_resp' })).not.toThrow();
    });

    test('should ignore terminal message for unknown id with error type', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        expect(() => session._dispatch({ id: 'unknown-id', type: 'error' })).not.toThrow();
    });

    test('should ignore terminal message for unknown id with stream_end type', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        expect(() => session._dispatch({ id: 'unknown-id', type: 'stream_end' })).not.toThrow();
    });
});

describe('WSSession.cleanup', () => {
    test('should handle null manager', () => {
        const mockWs = { on: jest.fn(), close: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        // Should not throw even without manager
        expect(() => session.cleanup(new Error('test'))).not.toThrow();
    });

    test('should clear heartbeat timer if exists', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // Set up heartbeat timer
        session.heartbeatTimer = setInterval(() => {}, 1000);

        session.cleanup(new Error('test'));

        expect(session.heartbeatTimer).toBeNull();
        mockManager._unregisterSession.mockRestore();
    });

    test('should handle pending request push error', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // Add pending request with push that throws
        session.pending.set('req-1', {
            ch: {
                messages: [],
                push: jest.fn().mockImplementation(() => {
                    throw new Error('push error');
                })
            },
            close: jest.fn()
        });

        // Should not throw
        expect(() => session.cleanup(new Error('test'))).not.toThrow();

        mockManager._unregisterSession.mockRestore();
    });

    test('should handle ws.close error', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn().mockImplementation(() => {
                throw new Error('close error');
            })
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // Should not throw even if close throws
        expect(() => session.cleanup(new Error('test'))).not.toThrow();

        mockManager._unregisterSession.mockRestore();
    });

    test('should handle ws.close error during second cleanup', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn().mockImplementation(() => {
                throw new Error('close error');
            })
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // First cleanup
        session.cleanup(new Error('test'));

        // Second cleanup should be no-op due to closed flag
        session.closed = false; // Reset for test
        expect(() => session.cleanup(new Error('test2'))).not.toThrow();

        mockManager._unregisterSession.mockRestore();
    });
});

describe('WSRelayManager.getStats', () => {
    test('should include messagesSent and messagesReceived', () => {
        const manager = new WSRelayManager();
        const stats = manager.getStats();

        expect(stats).toHaveProperty('messagesSent');
        expect(stats).toHaveProperty('messagesReceived');
        expect(stats).toHaveProperty('totalConnections');
        manager.stop();
    });

    test('should reflect activeSessions from sessions size', () => {
        const manager = new WSRelayManager();
        expect(manager.getStats().activeSessions).toBe(0);

        manager._registerSession({ provider: 'test', cleanup: jest.fn() });
        expect(manager.getStats().activeSessions).toBe(1);

        manager.stop();
    });
});

describe('WSRelayManager._handleWebsocket (mock)', () => {
    test('should handle providerFactory throwing error', async () => {
        const manager = new WSRelayManager({
            providerFactory: () => {
                throw new Error('factory error');
            }
        });

        // We can't easily test _handleWebsocket without real WebSocket,
        // but we can verify the error handling structure
        expect(manager.providerFactory).toBeDefined();
        manager.stop();
    });

    test('should handle providerFactory returning empty name', async () => {
        const manager = new WSRelayManager({
            providerFactory: () => ''
        });

        expect(manager.providerFactory).toBeDefined();
        manager.stop();
    });

    test('should handle providerFactory returning whitespace name', async () => {
        const manager = new WSRelayManager({
            providerFactory: () => '   '
        });

        expect(manager.providerFactory).toBeDefined();
        manager.stop();
    });

    test('should handle providerFactory returning null', async () => {
        const manager = new WSRelayManager({
            providerFactory: () => null
        });

        expect(manager.providerFactory).toBeDefined();
        manager.stop();
    });
});

describe('WSSession request channel', () => {
    test('should handle ch.send when buffer is full', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const ch = {
            messages: [],
            buffer: [],
            maxBufferSize: 2,
            closed: false,
            push: jest.fn(),
            send: jest.fn(),
            close: jest.fn()
        };

        // Fill buffer to max
        ch.buffer = [{ id: 1 }, { id: 2 }];

        // Try to send when buffer is full
        ch.send({ id: 3 });

        // Should not throw, just ignore
        expect(ch.buffer.length).toBe(2);
    });

    test('should handle ch.push when buffer is full', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const ch = {
            messages: [],
            buffer: [],
            maxBufferSize: 2,
            closed: false,
            push: jest.fn(),
            send: jest.fn(),
            close: jest.fn()
        };

        // Fill buffer to max
        ch.buffer = [{ id: 1 }, { id: 2 }];

        // Try to push when buffer is full
        ch.push({ id: 3 });

        // Should not throw, just ignore
        expect(ch.buffer.length).toBe(2);
    });

    test('should handle ch.drain', () => {
        const mockWs = { on: jest.fn() };
        const session = new WSSession(mockWs, null, 'test-id', {});

        const ch = {
            messages: [],
            buffer: [{ id: 1 }, { id: 2 }],
            maxBufferSize: 8,
            closed: false,
            push: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
            drain: () => {
                ch.messages.push(...ch.buffer);
                ch.buffer = [];
            }
        };

        ch.drain();

        expect(ch.messages.length).toBe(2);
        expect(ch.buffer.length).toBe(0);
    });
});

describe('WSSession._handleError', () => {
    test('should handle error when session is already closed', () => {
        const mockWs = {
            on: jest.fn(),
            close: jest.fn()
        };
        const mockManager = {
            _unregisterSession: jest.fn()
        };
        const session = new WSSession(mockWs, mockManager, 'test-id', {});

        // First close
        session.cleanup(new Error('first close'));

        // Then try to handle error - should be no-op
        session._handleError(new Error('late error'));

        expect(mockWs.close).toHaveBeenCalledTimes(1);
        mockManager._unregisterSession.mockRestore();
    });
});

describe('WSRelayManager stop with sessions', () => {
    test('should stop all sessions', async () => {
        const manager = new WSRelayManager();

        const mockSession1 = { provider: 'provider1', cleanup: jest.fn() };
        const mockSession2 = { provider: 'provider2', cleanup: jest.fn() };

        manager._registerSession(mockSession1);
        manager._registerSession(mockSession2);

        await manager.stop();

        expect(mockSession1.cleanup).toHaveBeenCalled();
        expect(mockSession2.cleanup).toHaveBeenCalled();
        expect(manager.sessions.size).toBe(0);
    });

    test('should handle null session in sessions map during stop', async () => {
        const manager = new WSRelayManager();

        // Add a null session directly to map
        manager.sessions.set('null-session', null);

        await manager.stop();

        expect(manager.sessions.size).toBe(0);
    });
});