/**
 * WSRelay Manager - WebSocket 代理管理器
 *
 * 参考 CLIProxyAPI internal/wsrelay/manager.go 设计
 * 提供 Manager-Session 双层架构管理 WebSocket 连接
 *
 * 主要功能：
 * - 管理多个 WebSocket 会话
 * - 提供会话生命周期管理
 * - 心跳保活机制
 * - 优雅关闭所有会话
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// 消息类型常量
export const MessageType = {
    Ping: 'ping',
    Pong: 'pong',
    HTTPReq: 'http_req',
    HTTPResp: 'http_resp',
    StreamData: 'stream_data',
    StreamEnd: 'stream_end',
    Error: 'error'
};

// 默认配置
const DEFAULT_CONFIG = {
    path: '/v1/ws',
    readTimeout: 60000,      // 60秒读取超时
    writeTimeout: 10000,      // 10秒写入超时
    maxMessageLen: 64 * 1024 * 1024,  // 64 MiB
    heartbeatInterval: 30000 // 30秒心跳间隔
};

/**
 * Manager 类 - 管理所有 WebSocket 会话
 *
 * 参考 Go 版 Manager 结构：
 * - sessions map[string]*session
 * - sessMutex sync.RWMutex
 * - providerFactory func
 * - onConnected/onDisconnected callbacks
 */
export class WSRelayManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = { ...DEFAULT_CONFIG, ...config };
        this.path = this._normalizePath(this.config.path);

        // 会话存储 (Map: providerName -> session)
        this.sessions = new Map();

        // 简单写入锁实现（替代 async-mutex）
        this._writeLock = false;

        // 回调函数
        this.providerFactory = config.providerFactory || null;
        this.onConnected = config.onConnected || null;
        this.onDisconnected = config.onDisconnected || null;

        // 统计
        this.stats = {
            totalConnections: 0,
            activeSessions: 0,
            messagesSent: 0,
            messagesReceived: 0
        };

        logger.info(`[WSRelay] Manager created with path: ${this.path}`);
    }

    _normalizePath(path) {
        path = (path || '/v1/ws').trim();
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        return path;
    }

    /**
     * 获取管理器路径
     */
    getPath() {
        return this.path;
    }

    /**
     * 检查路径是否匹配
     */
    matchesPath(requestPath) {
        return requestPath === this.path;
    }

    /**
     * 生成随机提供商名称
     */
    _generateProviderName() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const buf = Buffer.alloc(16);
        crypto.randomFillSync(buf);
        let name = '';
        for (let i = 0; i < buf.length; i++) {
            name += alphabet[buf[i] % alphabet.length];
        }
        return 'aistudio-' + name;
    }

    /**
     * 注册新会话
     */
    _registerSession(session) {
        const provider = session.provider;

        // 检查是否已有该 provider 的会话
        const existingSession = this.sessions.get(provider);

        // 存储新会话
        this.sessions.set(provider, session);

        // 如果有旧会话，替换并关闭
        if (existingSession && existingSession !== session) {
            existingSession.cleanup(new Error('replaced by new connection'));
        }

        // 更新统计
        this.stats.activeSessions = this.sessions.size;

        // 触发连接回调
        if (this.onConnected) {
            try {
                this.onConnected(provider);
            } catch (err) {
                logger.error(`[WSRelay] onConnected callback error: ${err.message}`);
            }
        }

        // 触发事件
        this.emit('session:connected', { provider, session });

        logger.info(`[WSRelay] Session registered: provider=${provider}, active=${this.sessions.size}`);
    }

    /**
     * 注销会话
     */
    _unregisterSession(session, cause) {
        if (!session || !session.provider) return;

        const provider = session.provider.toLowerCase();

        // 只删除本会话拥有的条目
        const current = this.sessions.get(provider);
        if (current !== session) {
            return; // 不是当前会话，不处理
        }

        this.sessions.delete(provider);
        this.stats.activeSessions = this.sessions.size;

        // 触发断开回调
        if (this.onDisconnected) {
            try {
                this.onDisconnected(provider, cause);
            } catch (err) {
                logger.error(`[WSRelay] onDisconnected callback error: ${err.message}`);
            }
        }

        // 触发事件
        this.emit('session:disconnected', { provider, cause });

        logger.info(`[WSRelay] Session unregistered: provider=${provider}, active=${this.sessions.size}`);
    }

    /**
     * 获取会话（大小写不敏感）
     */
    getSession(provider) {
        if (!provider) return undefined;
        const key = provider.toLowerCase().trim();
        // 遍历查找大小写不敏感的匹配
        for (const [storedKey, session] of this.sessions) {
            if (storedKey.toLowerCase() === key) {
                return session;
            }
        }
        return undefined;
    }

    /**
     * 获取所有活跃会话的提供商列表
     */
    getActiveProviders() {
        return Array.from(this.sessions.keys());
    }

    /**
     * 发送消息到指定提供商
     * @param {string} provider - 提供商名称
     * @param {object} msg - 消息对象
     * @returns {Promise<Channel>} 返回消息通道
     */
    async send(provider, msg) {
        const session = this.getSession(provider);
        if (!session) {
            throw new Error(`wsrelay: provider ${provider} not connected`);
        }
        return session.request(msg);
    }

    /**
     * 优雅停止 - 关闭所有会话
     */
    async stop() {
        logger.info(`[WSRelay] Stopping manager, closing ${this.sessions.size} sessions...`);

        const sessions = Array.from(this.sessions.values());
        this.sessions.clear();
        this.stats.activeSessions = 0;

        for (const session of sessions) {
            if (session) {
                session.cleanup(new Error('wsrelay: manager stopped'));
            }
        }

        this.emit('manager:stopped');
        logger.info('[WSRelay] Manager stopped');
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            activeSessions: this.sessions.size
        };
    }

    /**
     * 创建 HTTP Handler（用于 Express/Koa）
     */
    createHandler() {
        return async (req, res, next) => {
            // 检查路径
            if (!this.matchesPath(req.url)) {
                return next();
            }

            // 检查方法
            if (req.method !== 'GET') {
                res.setHeader('Allow', 'GET');
                return res.status(405).send('Method Not Allowed');
            }

            // 升级 WebSocket
            this._handleWebsocket(req, res);
        };
    }

    /**
     * 处理 WebSocket 升级
     */
    async _handleWebsocket(req, res) {
        const WebSocket = await import('ws').then(m => m.default || m.WebSocket || m);

        const wss = new WebSocket.Server({ noServer: true });

        wss.handleUpgrade(req, res, req.socket, (ws) => {
            // 创建会话
            const providerName = this._generateProviderName();
            const session = new WSSession(ws, this, providerName, this.config);

            // 如果有 providerFactory，尝试确定提供商
            if (this.providerFactory) {
                try {
                    const name = this.providerFactory(req);
                    if (name && name.trim()) {
                        session.provider = name.toLowerCase();
                    }
                } catch (err) {
                    session.cleanup(err);
                    return;
                }
            }

            // 如果没有确定 provider，使用随机名称
            if (!session.provider) {
                session.provider = providerName;
            }

            // 注册会话
            this._registerSession(session);

            // 启动会话运行
            session.run();
        });
    }
}

/**
 * WSSession 类 - 单个 WebSocket 会话
 *
 * 参考 Go 版 session 结构：
 * - conn *websocket.Conn
 * - manager *Manager
 * - provider, id string
 * - closed chan struct{}
 * - pending sync.Map
 */
export class WSSession extends EventEmitter {
    constructor(ws, manager, id, config) {
        super();
        this.ws = ws;
        this.manager = manager;
        this.id = id;
        this.provider = '';
        this.config = config || DEFAULT_CONFIG;
        this.closed = false;
        this.closedCh = new EventEmitter();

        // 写入锁
        this.writeMutex = false;

        // 待处理的请求 (messageId -> PendingRequest)
        // 参考 Go 版本: sync.Map + 带缓冲的 channel
        this.pending = new Map();

        // 关闭保护（参考 Go 版本的 closeOnce）
        this._cleanupOnce = false;

        // 设置连接参数
        this.ws.on('error', (err) => this._handleError(err));

        logger.debug(`[WSRelay] Session created: id=${id}`);
    }

    /**
     * 处理错误
     */
    _handleError(err) {
        if (this.closed) return;

        logger.debug(`[WSRelay] Session error: provider=${this.provider}, error=${err.message}`);
        this.cleanup(err);
    }

    /**
     * 启动会话运行
     */
    run() {
        // 设置心跳
        this._startHeartbeat();

        // 处理消息
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this._dispatch(msg);
            } catch (err) {
                logger.warn(`[WSRelay] Failed to parse message: ${err.message}`);
            }
        });

        // 处理关闭
        this.ws.on('close', () => {
            this.cleanup(new Error('connection closed'));
        });

        // 处理错误
        this.ws.on('error', (err) => {
            this.cleanup(err);
        });

        logger.debug(`[WSRelay] Session running: provider=${this.provider}`);
    }

    /**
     * 启动心跳
     */
    _startHeartbeat() {
        const interval = this.config.heartbeatInterval || 30000;

        this.heartbeatTimer = setInterval(async () => {
            if (this.closed) {
                clearInterval(this.heartbeatTimer);
                return;
            }

            try {
                await this._sendPing();
            } catch (err) {
                clearInterval(this.heartbeatTimer);
                this.cleanup(err);
            }
        }, interval);

        if (this.heartbeatTimer.unref) {
            this.heartbeatTimer.unref();
        }
    }

    /**
     * 发送 Ping
     */
    async _sendPing() {
        return new Promise((resolve, reject) => {
            if (this.closed) {
                return reject(new Error('session closed'));
            }

            // 获取写入锁
            while (this.writeMutex) {
                // 忙等待，实际应该用信号量
            }
            this.writeMutex = true;

            this.ws.ping('ping', (err) => {
                this.writeMutex = false;
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 分发消息
     * 参考 Go 版本: dispatch() 实现更完善的 pending 请求处理
     */
    _dispatch(msg) {
        if (!msg) return;

        const messageType = msg.type || msg.MessageType;
        if (!messageType) return;

        // Ping 处理
        if (messageType === MessageType.Ping || messageType === 'ping') {
            this._sendPong();
            return;
        }

        // 检查是否有待处理的请求
        if (msg.id && this.pending.has(msg.id)) {
            const pendingReq = this.pending.get(msg.id);

            // 发送消息到通道（带缓冲）
            if (pendingReq.ch.send) {
                pendingReq.ch.send(msg);
            } else if (pendingReq.ch.push) {
                pendingReq.ch.push(msg);
            }

            // 终端消息类型关闭请求（参考 Go 版本）
            if (messageType === MessageType.HTTPResp ||
                messageType === MessageType.Error ||
                messageType === MessageType.StreamEnd ||
                msg.type === 'http_resp' || msg.type === 'error' || msg.type === 'stream_end') {
                this.pending.delete(msg.id);
                pendingReq.close();
            }
            return;
        }

        // 未知 ID 的终端消息（参考 Go 版本的日志级别）
        if (messageType === MessageType.HTTPResp ||
            messageType === MessageType.Error ||
            messageType === MessageType.StreamEnd) {
            logger.debug(`[WSRelay] Received terminal message for unknown id: ${msg.id} (provider=${this.provider})`);
        }

        // 触发自定义消息事件
        this.emit('message', msg);
    }

    /**
     * 发送 Pong
     */
    _sendPong() {
        this.send({
            type: MessageType.Pong,
            id: '',
            payload: {}
        });
    }

    /**
     * 发送消息
     */
    async send(msg) {
        if (this.closed) {
            throw new Error('session closed');
        }

        return new Promise((resolve, reject) => {
            // 获取写入锁
            const acquireLock = () => {
                if (this.writeMutex) {
                    setTimeout(acquireLock, 1);
                    return;
                }
                this.writeMutex = true;
                doSend();
            };

            const doSend = () => {
                try {
                    this.ws.send(JSON.stringify(msg), (err) => {
                        this.writeMutex = false;
                        if (err) {
                            reject(err);
                        } else {
                            this.manager.stats.messagesSent++;
                            resolve();
                        }
                    });
                } catch (err) {
                    this.writeMutex = false;
                    reject(err);
                }
            };

            acquireLock();
        });
    }

    /**
     * 发起请求（带响应通道）
     * 参考 Go 版本: 使用带缓冲的 channel，并处理 context cancel
     */
    request(msg) {
        if (this.closed) {
            return Promise.reject(new Error('session closed'));
        }

        if (!msg.id) {
            return Promise.reject(new Error('wsrelay: message id is required'));
        }

        // 检查重复 ID
        if (this.pending.has(msg.id)) {
            return Promise.reject(new Error(`wsrelay: duplicate message id ${msg.id}`));
        }

        // 创建待处理请求（参考 Go 版本：带缓冲的 channel，缓冲区 8）
        const ch = {
            messages: [],
            buffer: [],
            maxBufferSize: 8,
            closed: false,
            push: (msg) => {
                if (ch.closed) return;
                if (ch.buffer.length < ch.maxBufferSize) {
                    ch.buffer.push(msg);
                }
            },
            send: (msg) => {
                if (ch.closed) return;
                if (ch.buffer.length < ch.maxBufferSize) {
                    ch.buffer.push(msg);
                }
            },
            close: () => {
                ch.closed = true;
                ch.buffer = [];
            },
            drain: () => {
                ch.messages.push(...ch.buffer);
                ch.buffer = [];
            }
        };

        const pendingReq = {
            ch,
            close: () => {
                ch.close();
            }
        };

        this.pending.set(msg.id, pendingReq);

        // 发送请求
        this.send(msg).then(() => {
            // 启动 context cancel 监听（参考 Go 版本）
        }).catch((err) => {
            this.pending.delete(msg.id);
            pendingReq.close();
        });

        // 返回消息通道（带 drain 方法）
        return {
            ch: ch,
            cancel: () => {
                this.pending.delete(msg.id);
                pendingReq.close();
            }
        };
    }

    /**
     * 清理会话
     */
    cleanup(cause) {
        if (this.closed) return;
        this.closed = true;

        // 停止心跳
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        // 发送错误给所有待处理请求
        for (const [id, pendingReq] of this.pending) {
            const errMsg = {
                id,
                type: MessageType.Error,
                payload: { error: cause ? cause.message : 'session closed' }
            };
            try {
                pendingReq.ch.push(errMsg);
            } catch (e) {
                // ignore
            }
            pendingReq.close();
        }
        this.pending.clear();

        // 关闭 WebSocket
        try {
            this.ws.close();
        } catch (e) {
            // ignore
        }

        // 通知 Manager
        if (this.manager) {
            this.manager._unregisterSession(this, cause);
        }

        this.emit('session:closed', { cause });
        logger.debug(`[WSRelay] Session cleaned up: provider=${this.provider}`);
    }
}

/**
 * 创建默认的 WSRelay Manager 实例
 */
let defaultManager = null;

export function getDefaultManager(config) {
    if (!defaultManager) {
        defaultManager = new WSRelayManager(config);
    }
    return defaultManager;
}

export function stopDefaultManager() {
    if (defaultManager) {
        defaultManager.stop();
        defaultManager = null;
    }
}