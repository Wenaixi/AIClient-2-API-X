/**
 * wsrelay/index.js 单元测试
 * 测试模块导出和基本功能
 */

import { WSRelayManager, WSSession, MessageType, getDefaultManager, stopDefaultManager } from '../../../src/wsrelay/index.js';

describe('wsrelay/index.js - 模块导出', () => {
    describe('模块导出', () => {
        test('应导出 WSRelayManager', () => {
            expect(WSRelayManager).toBeDefined();
            expect(typeof WSRelayManager).toBe('function');
        });

        test('应导出 WSSession', () => {
            expect(WSSession).toBeDefined();
            expect(typeof WSSession).toBe('function');
        });

        test('应导出 MessageType', () => {
            expect(MessageType).toBeDefined();
            expect(typeof MessageType).toBe('object');
        });

        test('应导出 getDefaultManager', () => {
            expect(getDefaultManager).toBeDefined();
            expect(typeof getDefaultManager).toBe('function');
        });

        test('应导出 stopDefaultManager', () => {
            expect(stopDefaultManager).toBeDefined();
            expect(typeof stopDefaultManager).toBe('function');
        });
    });

    describe('MessageType 枚举值', () => {
        test('应包含所有消息类型', () => {
            expect(MessageType.Ping).toBe('ping');
            expect(MessageType.Pong).toBe('pong');
            expect(MessageType.HTTPReq).toBe('http_req');
            expect(MessageType.HTTPResp).toBe('http_resp');
            expect(MessageType.StreamData).toBe('stream_data');
            expect(MessageType.StreamEnd).toBe('stream_end');
            expect(MessageType.Error).toBe('error');
        });
    });

    describe('WSRelayManager 基本功能', () => {
        test('应能创建 WSRelayManager 实例', () => {
            const manager = new WSRelayManager({
                path: '/v1/ws',
                onConnected: jest.fn(),
                onDisconnected: jest.fn()
            });

            expect(manager).toBeDefined();
            expect(manager.getPath()).toBe('/v1/ws');
        });

        test('默认路径应为 /v1/ws', () => {
            const manager = new WSRelayManager();
            expect(manager.getPath()).toBe('/v1/ws');
        });

        test('路径应以 / 开头', () => {
            const manager = new WSRelayManager({ path: 'v1/ws' });
            expect(manager.getPath()).toBe('/v1/ws');
        });

        test('应能创建 HTTP handler', () => {
            const manager = new WSRelayManager({ path: '/v1/ws' });
            const handler = manager.createHandler();

            expect(handler).toBeDefined();
            expect(typeof handler).toBe('function');
        });
    });

    describe('getDefaultManager', () => {
        test('应返回单例 manager', () => {
            const manager1 = getDefaultManager();
            const manager2 = getDefaultManager();

            expect(manager1).toBe(manager2);
        });
    });

    describe('stopDefaultManager', () => {
        test('应停止默认 manager', () => {
            // 确保 manager 存在
            const manager = getDefaultManager();
            expect(manager).toBeDefined();

            // 停止不应抛出错误
            expect(() => stopDefaultManager()).not.toThrow();
        });

        test('连续调用 stopDefaultManager 不应抛出错误', () => {
            expect(() => stopDefaultManager()).not.toThrow();
            expect(() => stopDefaultManager()).not.toThrow();
        });
    });
});
