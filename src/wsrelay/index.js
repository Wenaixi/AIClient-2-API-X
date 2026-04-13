/**
 * WSRelay 模块入口
 *
 * 提供 WebSocket 代理功能，参考 CLIProxyAPI internal/wsrelay/ 设计
 *
 * 主要组件：
 * - WSRelayManager: 管理所有 WebSocket 会话
 * - WSSession: 单个 WebSocket 会话
 *
 * 使用方式：
 * ```javascript
 * import { WSRelayManager } from './wsrelay/index.js';
 *
 * const manager = new WSRelayManager({
 *   path: '/v1/ws',
 *   onConnected: (provider) => { ... },
 *   onDisconnected: (provider, err) => { ... }
 * });
 *
 * // 集成到 Express/Koa
 * app.use(manager.createHandler());
 * ```
 */

export {
    WSRelayManager,
    WSSession,
    MessageType,
    getDefaultManager,
    stopDefaultManager
} from './manager.js';