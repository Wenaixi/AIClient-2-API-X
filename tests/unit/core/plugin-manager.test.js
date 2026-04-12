/**
 * Plugin Manager 单元测试
 * 测试插件管理器的核心功能
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

// Import after mocking
const { PluginManager, PLUGIN_TYPE } = require('../../../src/core/plugin-manager.js');

describe('PluginManager', () => {
    let pluginManager;

    beforeEach(() => {
        jest.clearAllMocks();
        pluginManager = new PluginManager();
    });

    describe('Constructor', () => {
        test('should create empty plugins map', () => {
            expect(pluginManager.plugins).toBeInstanceOf(Map);
            expect(pluginManager.plugins.size).toBe(0);
        });

        test('should have empty plugins config', () => {
            expect(pluginManager.pluginsConfig).toEqual({ plugins: {} });
        });

        test('should not be initialized initially', () => {
            expect(pluginManager.initialized).toBe(false);
        });
    });

    describe('PLUGIN_TYPE', () => {
        test('should have AUTH type', () => {
            expect(PLUGIN_TYPE.AUTH).toBe('auth');
        });

        test('should have MIDDLEWARE type', () => {
            expect(PLUGIN_TYPE.MIDDLEWARE).toBe('middleware');
        });
    });

    describe('register', () => {
        test('should register a valid plugin', () => {
            const plugin = {
                name: 'test-plugin',
                version: '1.0.0',
                middleware: jest.fn()
            };

            pluginManager.register(plugin);

            expect(pluginManager.plugins.has('test-plugin')).toBe(true);
        });

        test('should not register plugin without name', () => {
            const plugin = {
                version: '1.0.0',
                middleware: jest.fn()
            };

            expect(() => pluginManager.register(plugin)).toThrow('Plugin must have a name');
        });

        test('should not register duplicate plugin', () => {
            const plugin = {
                name: 'duplicate-plugin',
                version: '1.0.0'
            };

            pluginManager.register(plugin);
            pluginManager.register(plugin);

            expect(pluginManager.plugins.size).toBe(1);
        });
    });

    describe('isEnabled', () => {
        test('should return falsy for non-existent plugin', () => {
            const result = pluginManager.isEnabled('non-existent');
            expect(result).toBeFalsy();
        });

        test('should return false when plugin is not initialized', () => {
            const plugin = { name: 'test', version: '1.0.0' };
            pluginManager.register(plugin);

            const result = pluginManager.isEnabled('test');
            expect(result).toBeFalsy();
        });

        test('should return true when plugin is enabled', () => {
            const plugin = { name: 'test', version: '1.0.0', _enabled: true };
            pluginManager.register(plugin);

            expect(pluginManager.isEnabled('test')).toBe(true);
        });
    });

    describe('getEnabledPlugins', () => {
        test('should return empty array when no plugins', () => {
            expect(pluginManager.getEnabledPlugins()).toEqual([]);
        });

        test('should return only enabled plugins', () => {
            pluginManager.register({ name: 'enabled', version: '1.0.0', _enabled: true });
            pluginManager.register({ name: 'disabled', version: '1.0.0', _enabled: false });

            const enabled = pluginManager.getEnabledPlugins();

            expect(enabled).toHaveLength(1);
            expect(enabled[0].name).toBe('enabled');
        });

        test('should sort by priority (lower first)', () => {
            pluginManager.register({ name: 'low', version: '1.0.0', _priority: 200, _enabled: true });
            pluginManager.register({ name: 'high', version: '1.0.0', _priority: 50, _enabled: true });
            pluginManager.register({ name: 'medium', version: '1.0.0', _priority: 100, _enabled: true });

            const enabled = pluginManager.getEnabledPlugins();

            expect(enabled[0].name).toBe('high');
            expect(enabled[1].name).toBe('medium');
            expect(enabled[2].name).toBe('low');
        });

        test('should put builtin plugins last', () => {
            pluginManager.register({ name: 'builtin', version: '1.0.0', _priority: 50, _enabled: true, _builtin: true });
            pluginManager.register({ name: 'regular', version: '1.0.0', _priority: 50, _enabled: true, _builtin: false });

            const enabled = pluginManager.getEnabledPlugins();

            expect(enabled[0].name).toBe('regular');
            expect(enabled[1].name).toBe('builtin');
        });

        test('should use default priority of 100', () => {
            pluginManager.register({ name: 'default', version: '1.0.0', _enabled: true });
            pluginManager.register({ name: 'higher', version: '1.0.0', _priority: 50, _enabled: true });

            const enabled = pluginManager.getEnabledPlugins();

            expect(enabled[0].name).toBe('higher');
            expect(enabled[1].name).toBe('default');
        });
    });

    describe('getAuthPlugins', () => {
        test('should return only auth type plugins', () => {
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: jest.fn(),
                _enabled: true
            });
            pluginManager.register({
                name: 'middleware-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: jest.fn(),
                _enabled: true
            });

            const authPlugins = pluginManager.getAuthPlugins();

            expect(authPlugins).toHaveLength(1);
            expect(authPlugins[0].name).toBe('auth-plugin');
        });

        test('should not return plugins without authenticate method', () => {
            pluginManager.register({
                name: 'auth-without-method',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                _enabled: true
            });

            const authPlugins = pluginManager.getAuthPlugins();

            expect(authPlugins).toHaveLength(0);
        });
    });

    describe('getMiddlewarePlugins', () => {
        test('should return only middleware type plugins', () => {
            pluginManager.register({
                name: 'mw-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: jest.fn(),
                _enabled: true
            });

            const mwPlugins = pluginManager.getMiddlewarePlugins();

            expect(mwPlugins).toHaveLength(1);
            expect(mwPlugins[0].name).toBe('mw-plugin');
        });

        test('should exclude auth type plugins', () => {
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: jest.fn(),
                _enabled: true
            });

            const mwPlugins = pluginManager.getMiddlewarePlugins();

            expect(mwPlugins).toHaveLength(0);
        });
    });

    describe('executeAuth', () => {
        test('should return unauthorized when no auth plugins', async () => {
            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(result).toEqual({ handled: false, authorized: false });
        });

        test('should call authenticate on auth plugins', async () => {
            const authenticate = jest.fn().mockResolvedValue({ handled: false, authorized: true });
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate,
                _enabled: true
            });

            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(authenticate).toHaveBeenCalled();
            expect(result).toEqual({ handled: false, authorized: true });
        });

        test('should return handled when plugin handles request', async () => {
            const authenticate = jest.fn().mockResolvedValue({ handled: true, authorized: false });
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate,
                _enabled: true
            });

            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(result).toEqual({ handled: true, authorized: false });
        });

        test('should stop on authorization failure', async () => {
            const authenticate1 = jest.fn().mockResolvedValue({ handled: false, authorized: false });
            const authenticate2 = jest.fn();
            pluginManager.register({
                name: 'auth-plugin-1',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: authenticate1,
                _enabled: true
            });
            pluginManager.register({
                name: 'auth-plugin-2',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: authenticate2,
                _enabled: true
            });

            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(authenticate1).toHaveBeenCalled();
            expect(authenticate2).not.toHaveBeenCalled();
            expect(result).toEqual({ handled: true, authorized: false });
        });

        test('should continue when plugin returns null/undefined', async () => {
            const authenticate1 = jest.fn().mockResolvedValue(undefined);
            const authenticate2 = jest.fn().mockResolvedValue({ authorized: true });
            pluginManager.register({
                name: 'auth-plugin-1',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: authenticate1,
                _enabled: true
            });
            pluginManager.register({
                name: 'auth-plugin-2',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate: authenticate2,
                _enabled: true
            });

            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(authenticate1).toHaveBeenCalled();
            expect(authenticate2).toHaveBeenCalled();
            expect(result).toEqual({ handled: false, authorized: true });
        });

        test('should merge data from successful auth', async () => {
            const authenticate = jest.fn().mockResolvedValue({
                authorized: true,
                data: { user: 'test', role: 'admin' }
            });
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate,
                _enabled: true
            });

            const config = {};
            await pluginManager.executeAuth({}, {}, {}, config);

            expect(config.user).toBe('test');
            expect(config.role).toBe('admin');
        });

        test('should handle errors gracefully', async () => {
            const authenticate = jest.fn().mockRejectedValue(new Error('Auth error'));
            pluginManager.register({
                name: 'auth-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.AUTH,
                authenticate,
                _enabled: true
            });

            const result = await pluginManager.executeAuth({}, {}, {}, {});

            expect(result).toEqual({ handled: false, authorized: false });
        });
    });

    describe('executeMiddleware', () => {
        test('should return handled false when no middleware plugins', async () => {
            const result = await pluginManager.executeMiddleware({}, {}, {}, {});

            expect(result).toEqual({ handled: false });
        });

        test('should call middleware on middleware plugins', async () => {
            const middleware = jest.fn().mockResolvedValue({ handled: false });
            pluginManager.register({
                name: 'mw-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware,
                _enabled: true
            });

            await pluginManager.executeMiddleware({}, {}, {}, {});

            expect(middleware).toHaveBeenCalled();
        });

        test('should stop when request is handled', async () => {
            const middleware1 = jest.fn().mockResolvedValue({ handled: true });
            const middleware2 = jest.fn();
            pluginManager.register({
                name: 'mw-plugin-1',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: middleware1,
                _enabled: true
            });
            pluginManager.register({
                name: 'mw-plugin-2',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: middleware2,
                _enabled: true
            });

            const result = await pluginManager.executeMiddleware({}, {}, {}, {});

            expect(result).toEqual({ handled: true });
            expect(middleware2).not.toHaveBeenCalled();
        });

        test('should continue when middleware returns null', async () => {
            const middleware1 = jest.fn().mockResolvedValue(null);
            const middleware2 = jest.fn();
            pluginManager.register({
                name: 'mw-plugin-1',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: middleware1,
                _enabled: true
            });
            pluginManager.register({
                name: 'mw-plugin-2',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: middleware2,
                _enabled: true
            });

            await pluginManager.executeMiddleware({}, {}, {}, {});

            expect(middleware2).toHaveBeenCalled();
        });

        test('should merge data from middleware', async () => {
            const middleware = jest.fn().mockResolvedValue({
                handled: false,
                data: { processed: true }
            });
            pluginManager.register({
                name: 'mw-plugin',
                version: '1.0.0',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware,
                _enabled: true
            });

            const config = {};
            await pluginManager.executeMiddleware({}, {}, {}, config);

            expect(config.processed).toBe(true);
        });
    });

    describe('executeRoutes', () => {
        test('should return false when no plugins have routes', async () => {
            pluginManager.register({ name: 'no-routes', version: '1.0.0', _enabled: true });

            const result = await pluginManager.executeRoutes('GET', '/test', {}, {});

            expect(result).toBe(false);
        });

        test('should match string path exactly', async () => {
            const handler = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('GET', '/api/test', {}, {});

            expect(handler).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should match string path with trailing slash', async () => {
            const handler = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('GET', '/api/test/subpath', {}, {});

            expect(handler).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should match regex path', async () => {
            const handler = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: 'GET', path: /\/api\/test\/\d+/, handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('GET', '/api/test/123', {}, {});

            expect(handler).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should match wildcard method', async () => {
            const handler = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: '*', path: '/api/test', handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('DELETE', '/api/test', {}, {});

            expect(handler).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should be case insensitive for method', async () => {
            const handler = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: 'get', path: '/api/test', handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('GET', '/api/test', {}, {});

            expect(handler).toHaveBeenCalled();
        });

        test('should stop when handler returns true', async () => {
            const handler1 = jest.fn().mockResolvedValue(true);
            const handler2 = jest.fn();
            pluginManager.register({
                name: 'route-plugin-1',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler: handler1 }],
                _enabled: true
            });
            pluginManager.register({
                name: 'route-plugin-2',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler: handler2 }],
                _enabled: true
            });

            await pluginManager.executeRoutes('GET', '/api/test', {}, {});

            expect(handler2).not.toHaveBeenCalled();
        });

        test('should continue when handler returns false', async () => {
            const handler1 = jest.fn().mockResolvedValue(false);
            const handler2 = jest.fn().mockResolvedValue(true);
            pluginManager.register({
                name: 'route-plugin-1',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler: handler1 }],
                _enabled: true
            });
            pluginManager.register({
                name: 'route-plugin-2',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler: handler2 }],
                _enabled: true
            });

            await pluginManager.executeRoutes('GET', '/api/test', {}, {});

            expect(handler2).toHaveBeenCalled();
        });

        test('should handle route errors gracefully', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('Route error'));
            pluginManager.register({
                name: 'route-plugin',
                version: '1.0.0',
                routes: [{ method: 'GET', path: '/api/test', handler }],
                _enabled: true
            });

            const result = await pluginManager.executeRoutes('GET', '/api/test', {}, {});

            expect(result).toBe(false);
        });
    });

    describe('getStaticPaths', () => {
        test('should return empty array when no plugins', () => {
            expect(pluginManager.getStaticPaths()).toEqual([]);
        });

        test('should return static paths from enabled plugins', () => {
            pluginManager.register({
                name: 'plugin1',
                version: '1.0.0',
                staticPaths: ['/static/plugin1'],
                _enabled: true
            });
            pluginManager.register({
                name: 'plugin2',
                version: '1.0.0',
                staticPaths: ['/static/plugin2'],
                _enabled: true
            });

            const paths = pluginManager.getStaticPaths();

            expect(paths).toContain('/static/plugin1');
            expect(paths).toContain('/static/plugin2');
        });

        test('should not include paths from disabled plugins', () => {
            pluginManager.register({
                name: 'enabled-plugin',
                version: '1.0.0',
                staticPaths: ['/static/enabled'],
                _enabled: true
            });
            pluginManager.register({
                name: 'disabled-plugin',
                version: '1.0.0',
                staticPaths: ['/static/disabled'],
                _enabled: false
            });

            const paths = pluginManager.getStaticPaths();

            expect(paths).toContain('/static/enabled');
            expect(paths).not.toContain('/static/disabled');
        });
    });

    describe('isPluginStaticPath', () => {
        test('should return false when no static paths', () => {
            expect(pluginManager.isPluginStaticPath('/static/test')).toBe(false);
        });

        test('should return true for static path', () => {
            pluginManager.register({
                name: 'plugin',
                version: '1.0.0',
                staticPaths: ['/static/plugin'],
                _enabled: true
            });

            expect(pluginManager.isPluginStaticPath('/static/plugin')).toBe(true);
        });

        test('should return true for static path with leading slash', () => {
            pluginManager.register({
                name: 'plugin',
                version: '1.0.0',
                staticPaths: ['static/plugin'],
                _enabled: true
            });

            expect(pluginManager.isPluginStaticPath('/static/plugin')).toBe(true);
        });
    });

    describe('executeHook', () => {
        test('should execute hook on all enabled plugins', async () => {
            const hook1 = jest.fn();
            const hook2 = jest.fn();
            pluginManager.register({
                name: 'plugin1',
                version: '1.0.0',
                hooks: { onBeforeRequest: hook1 },
                _enabled: true
            });
            pluginManager.register({
                name: 'plugin2',
                version: '1.0.0',
                hooks: { onBeforeRequest: hook2 },
                _enabled: true
            });

            await pluginManager.executeHook('onBeforeRequest', { test: 'data' });

            expect(hook1).toHaveBeenCalledWith({ test: 'data' });
            expect(hook2).toHaveBeenCalledWith({ test: 'data' });
        });

        test('should skip plugins without the hook', async () => {
            const hook1 = jest.fn();
            pluginManager.register({
                name: 'plugin1',
                version: '1.0.0',
                hooks: { onBeforeRequest: hook1 },
                _enabled: true
            });
            pluginManager.register({
                name: 'plugin2',
                version: '1.0.0',
                hooks: { otherHook: jest.fn() },
                _enabled: true
            });

            await pluginManager.executeHook('onBeforeRequest');

            expect(hook1).toHaveBeenCalled();
        });

        test('should handle hook errors gracefully', async () => {
            const hook = jest.fn().mockRejectedValue(new Error('Hook error'));
            pluginManager.register({
                name: 'plugin',
                version: '1.0.0',
                hooks: { onBeforeRequest: hook },
                _enabled: true
            });

            await pluginManager.executeHook('onBeforeRequest');

            // Error should be handled without throwing
        });
    });

    describe('getPluginList', () => {
        test('should return empty array when no plugins', () => {
            expect(pluginManager.getPluginList()).toEqual([]);
        });

        test('should return plugin metadata', () => {
            pluginManager.register({
                name: 'test-plugin',
                version: '2.0.0',
                description: 'Test plugin',
                type: PLUGIN_TYPE.MIDDLEWARE,
                middleware: jest.fn(),
                routes: [{ method: 'GET', path: '/test', handler: jest.fn() }],
                hooks: { onBeforeRequest: jest.fn() },
                _enabled: true
            });

            const list = pluginManager.getPluginList();

            expect(list).toHaveLength(1);
            expect(list[0]).toEqual({
                name: 'test-plugin',
                version: '2.0.0',
                description: 'Test plugin',
                enabled: true,
                hasMiddleware: true,
                hasRoutes: true,
                hasHooks: true
            });
        });

        test('should indicate when plugin has no features', () => {
            pluginManager.register({
                name: 'basic-plugin',
                version: '1.0.0',
                _enabled: true
            });

            const list = pluginManager.getPluginList();

            expect(list[0].hasMiddleware).toBeFalsy();
            expect(list[0].hasRoutes).toBeFalsy();
            expect(list[0].hasHooks).toBeFalsy();
        });
    });

    describe('setPluginEnabled', () => {
        test('should update plugin enabled state', async () => {
            pluginManager.register({ name: 'test-plugin', version: '1.0.0' });

            await pluginManager.setPluginEnabled('test-plugin', true);

            expect(pluginManager.plugins.get('test-plugin')._enabled).toBe(true);
        });

        test('should create plugin config if not exists', async () => {
            await pluginManager.setPluginEnabled('new-plugin', true);

            expect(pluginManager.pluginsConfig.plugins['new-plugin']).toBeDefined();
        });
    });
});
