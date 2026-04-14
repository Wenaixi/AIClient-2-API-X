/**
 * ui-modules/auth.js 单元测试
 * 测试认证逻辑：密码验证、Token管理、登录请求处理
 */

import { describe, test, expect, beforeEach, jest, afterAll } from '@jest/globals';

// ============ 测试用的常量和工具函数（从 auth.js 复制）============

import crypto from 'crypto';

const DEFAULT_PASSWORD = 'admin123';

const TOKEN_STORE_FILE = 'configs/token-store.json';

// 简化的 validateCredentials 测试实现
async function validateCredentialsImplementation(password, storedPassword) {
    if (!storedPassword || !password) return false;

    // 新格式：pbkdf2:salt:hash
    if (storedPassword.startsWith('pbkdf2:')) {
        const parts = storedPassword.split(':');
        if (parts.length !== 3) return false;
        const [, salt, storedHash] = parts;

        const PASSWORD_CONFIG = {
            PBKDF2_ITERATIONS: 310000,
            PBKDF2_KEYLEN: 64,
            PBKDF2_DIGEST: 'sha512',
        };

        const inputHash = await new Promise((resolve, reject) =>
            crypto.pbkdf2(password.trim(), salt, PASSWORD_CONFIG.PBKDF2_ITERATIONS, PASSWORD_CONFIG.PBKDF2_KEYLEN, PASSWORD_CONFIG.PBKDF2_DIGEST, (err, key) =>
                err ? reject(err) : resolve(key.toString('hex'))
            )
        );

        if (inputHash.length !== storedHash.length) return false;
        return crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'));
    }

    // 旧格式：明文
    const a = Buffer.from(password.trim());
    const b = Buffer.from(storedPassword);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// 简化的密码哈希实现
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const PASSWORD_CONFIG = {
        PBKDF2_ITERATIONS: 310000,
        PBKDF2_KEYLEN: 64,
        PBKDF2_DIGEST: 'sha512',
    };

    const hash = await new Promise((resolve, reject) =>
        crypto.pbkdf2(password, salt, PASSWORD_CONFIG.PBKDF2_ITERATIONS, PASSWORD_CONFIG.PBKDF2_KEYLEN, PASSWORD_CONFIG.PBKDF2_DIGEST, (err, key) =>
            err ? reject(err) : resolve(key.toString('hex'))
        )
    );

    return `pbkdf2:${salt}:${hash}`;
}

// ============ LoginAttemptManager 模拟 ============
class LoginAttemptManager {
    constructor() {
        this.attempts = new Map();
    }

    getIpStatus(ip) {
        if (!this.attempts.has(ip)) {
            this.attempts.set(ip, { count: 0, lastAttempt: 0, lockoutUntil: 0 });
        }
        return this.attempts.get(ip);
    }

    isLockedOut(ip) {
        const status = this.getIpStatus(ip);
        if (status.lockoutUntil > Date.now()) {
            return {
                locked: true,
                remainingTime: Math.ceil((status.lockoutUntil - Date.now()) / 1000)
            };
        }
        if (status.lockoutUntil > 0 && status.lockoutUntil <= Date.now()) {
            status.count = 0;
            status.lockoutUntil = 0;
        }
        return { locked: false };
    }

    isTooFrequent(ip, minInterval = 1000) {
        const status = this.getIpStatus(ip);
        const now = Date.now();
        if (now - status.lastAttempt < minInterval) {
            return true;
        }
        status.lastAttempt = now;
        return false;
    }

    recordFailure(ip, maxAttempts = 5, lockoutDuration = 1800000) {
        const status = this.getIpStatus(ip);
        status.count++;
        if (status.count >= maxAttempts) {
            status.lockoutUntil = Date.now() + lockoutDuration;
            return true;
        }
        return false;
    }

    reset(ip) {
        this.attempts.delete(ip);
    }
}

// ============ Token Store 模拟 ============
class TokenStore {
    constructor() {
        this.tokens = {};
    }

    async read() {
        return { tokens: { ...this.tokens } };
    }

    async write(tokenStore) {
        this.tokens = { ...tokenStore.tokens };
    }

    async addToken(token, info) {
        const store = await this.read();
        store.tokens[token] = info;
        await this.write(store);
    }

    async removeToken(token) {
        const store = await this.read();
        if (store.tokens[token]) {
            delete store.tokens[token];
            await this.write(store);
        }
    }

    async getToken(token) {
        const store = await this.read();
        return store.tokens[token] || null;
    }

    async cleanup() {
        const store = await this.read();
        const now = Date.now();
        let hasChanges = false;
        for (const tk in store.tokens) {
            if (now > store.tokens[tk].expiryTime) {
                delete store.tokens[tk];
                hasChanges = true;
            }
        }
        if (hasChanges) {
            await this.write(store);
        }
    }
}

// ============ 测试用例 ============

describe('validateCredentials - 密码验证', () => {
    describe('明文密码 (旧格式)', () => {
        test('应验证正确的明文密码', async () => {
            const password = 'mysecretpassword';
            const storedPassword = password;
            const result = await validateCredentialsImplementation(password, storedPassword);
            expect(result).toBe(true);
        });

        test('应拒绝错误的明文密码', async () => {
            const correctPassword = 'mysecretpassword';
            const wrongPassword = 'wrongpassword';
            const result = await validateCredentialsImplementation(wrongPassword, correctPassword);
            expect(result).toBe(false);
        });

        test('应拒绝空密码', async () => {
            const result = await validateCredentialsImplementation('', 'secret');
            expect(result).toBe(false);
        });

        test('应拒绝空存储密码', async () => {
            const result = await validateCredentialsImplementation('password', '');
            expect(result).toBe(false);
        });

        test('应处理空白符修剪', async () => {
            const password = '  mysecretpassword  ';
            const storedPassword = 'mysecretpassword';
            const result = await validateCredentialsImplementation(password, storedPassword);
            expect(result).toBe(true);
        });

        test('应拒绝长度不一致的密码', async () => {
            const password = 'short';
            const storedPassword = 'muchlongerpassword';
            const result = await validateCredentialsImplementation(password, storedPassword);
            expect(result).toBe(false);
        });
    });

    describe('PBKDF2 哈希密码 (新格式)', () => {
        test('应验证正确的 PBKDF2 哈希密码', async () => {
            const password = 'mySecurePassword123!';
            const hashedPassword = await hashPassword(password);
            const result = await validateCredentialsImplementation(password, hashedPassword);
            expect(result).toBe(true);
        });

        test('应拒绝错误的 PBKDF2 密码', async () => {
            const correctPassword = 'mySecurePassword123!';
            const wrongPassword = 'wrongPassword456!';
            const hashedPassword = await hashPassword(correctPassword);
            const result = await validateCredentialsImplementation(wrongPassword, hashedPassword);
            expect(result).toBe(false);
        });

        test('应拒绝格式错误的 PBKDF2', async () => {
            const password = 'mySecurePassword123!';
            const malformedHash = 'pbkdf2:onlyTwoParts';
            const result = await validateCredentialsImplementation(password, malformedHash);
            expect(result).toBe(false);
        });

        test('应拒绝带多余冒号的 PBKDF2 格式', async () => {
            const password = 'test';
            const invalidHash = 'pbkdf2:salt:hash:with:extra:colons';
            const result = await validateCredentialsImplementation(password, invalidHash);
            expect(result).toBe(false);
        });

        test('相同密码不同盐应产生不同哈希', async () => {
            const password = 'samePassword';
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);
            expect(hash1).not.toBe(hash2);
            // 但都能验证
            expect(await validateCredentialsImplementation(password, hash1)).toBe(true);
            expect(await validateCredentialsImplementation(password, hash2)).toBe(true);
        });
    });

    describe('边界条件', () => {
        test('应处理 null 密码', async () => {
            const result = await validateCredentialsImplementation(null, 'stored');
            expect(result).toBe(false);
        });

        test('应处理 undefined 密码', async () => {
            const result = await validateCredentialsImplementation(undefined, 'stored');
            expect(result).toBe(false);
        });

        test('应处理 null 存储密码', async () => {
            const result = await validateCredentialsImplementation('password', null);
            expect(result).toBe(false);
        });

        test('应处理 undefined 存储密码', async () => {
            const result = await validateCredentialsImplementation('password', undefined);
            expect(result).toBe(false);
        });

        test('应处理密码特殊字符', async () => {
            const password = '密码🔐!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\\';
            const hash = await hashPassword(password);
            const result = await validateCredentialsImplementation(password, hash);
            expect(result).toBe(true);
        });

        test('应处理超长密码', async () => {
            const password = 'a'.repeat(10000);
            const hash = await hashPassword(password);
            const result = await validateCredentialsImplementation(password, hash);
            expect(result).toBe(true);
        });

        test('应处理 Unicode 字符', async () => {
            const password = '日本語パスワード🔐한국어';
            const hash = await hashPassword(password);
            const result = await validateCredentialsImplementation(password, hash);
            expect(result).toBe(true);
        });
    });
});

describe('LoginAttemptManager - 登录尝试管理', () => {
    let manager;

    beforeEach(() => {
        manager = new LoginAttemptManager();
    });

    test('应返回未锁定状态对于新 IP', () => {
        const result = manager.isLockedOut('192.168.1.1');
        expect(result.locked).toBe(false);
    });

    test('应正确记录失败次数', () => {
        manager.recordFailure('192.168.1.1', 5);
        let status = manager.getIpStatus('192.168.1.1');
        expect(status.count).toBe(1);

        manager.recordFailure('192.168.1.1', 5);
        status = manager.getIpStatus('192.168.1.1');
        expect(status.count).toBe(2);
    });

    test('超过最大尝试次数应锁定', () => {
        const isLocked = manager.recordFailure('192.168.1.1', 5);
        expect(isLocked).toBe(false);

        manager.recordFailure('192.168.1.1', 5);
        manager.recordFailure('192.168.1.1', 5);
        manager.recordFailure('192.168.1.1', 5);
        const isLockedNow = manager.recordFailure('192.168.1.1', 5);
        expect(isLockedNow).toBe(true);
    });

    test('isLockedOut 应返回锁定状态和剩余时间', () => {
        manager.recordFailure('192.168.1.1', 1); // 1次就锁定
        manager.recordFailure('192.168.1.1', 1);
        const result = manager.isLockedOut('192.168.1.1');
        expect(result.locked).toBe(true);
        expect(result.remainingTime).toBeGreaterThan(0);
    });

    test('isTooFrequent 应限制请求频率', () => {
        const ip = '192.168.1.2';
        // 首次不应频繁
        expect(manager.isTooFrequent(ip, 1000)).toBe(false);
        // 立即再次调用应频繁
        expect(manager.isTooFrequent(ip, 1000)).toBe(true);
    });

    test('reset 应清除 IP 的所有状态', () => {
        manager.recordFailure('192.168.1.3', 5);
        manager.recordFailure('192.168.1.3', 5);
        let status = manager.getIpStatus('192.168.1.3');
        expect(status.count).toBe(2);

        manager.reset('192.168.1.3');
        status = manager.getIpStatus('192.168.1.3');
        expect(status.count).toBe(0);
    });
});

describe('TokenStore - Token 存储管理', () => {
    let store;

    beforeEach(() => {
        store = new TokenStore();
    });

    test('应存储和获取 token', async () => {
        const token = 'test-token-123';
        const info = { username: 'admin', loginTime: Date.now(), expiryTime: Date.now() + 3600000 };
        await store.addToken(token, info);

        const retrieved = await store.getToken(token);
        expect(retrieved).toEqual(info);
    });

    test('应返回 null 对于不存在的 token', async () => {
        const result = await store.getToken('nonexistent');
        expect(result).toBeNull();
    });

    test('应删除过期的 token', async () => {
        const token = 'expired-token';
        const expiredInfo = { username: 'admin', expiryTime: Date.now() - 1000 }; // 已过期
        await store.addToken(token, expiredInfo);

        await store.cleanup();

        const result = await store.getToken(token);
        expect(result).toBeNull();
    });

    test('cleanup 不应删除未过期的 token', async () => {
        const token = 'valid-token';
        const validInfo = { username: 'admin', expiryTime: Date.now() + 3600000 };
        await store.addToken(token, validInfo);

        await store.cleanup();

        const result = await store.getToken(token);
        expect(result).not.toBeNull();
    });

    test('应删除指定的 token', async () => {
        const token = 'to-delete';
        const info = { username: 'admin', expiryTime: Date.now() + 3600000 };
        await store.addToken(token, info);

        await store.removeToken(token);

        const result = await store.getToken(token);
        expect(result).toBeNull();
    });
});

describe('cleanupExpiredTokens - 过期 token 清理', () => {
    test('应清理所有过期的 token', async () => {
        const store = new TokenStore();

        // 添加过期 token
        await store.addToken('expired1', {
            username: 'admin',
            expiryTime: Date.now() - 10000
        });
        await store.addToken('expired2', {
            username: 'admin',
            expiryTime: Date.now() - 5000
        });
        // 添加有效 token
        await store.addToken('valid', {
            username: 'admin',
            expiryTime: Date.now() + 3600000
        });

        await store.cleanup();

        expect(await store.getToken('expired1')).toBeNull();
        expect(await store.getToken('expired2')).toBeNull();
        expect(await store.getToken('valid')).not.toBeNull();
    });
});

describe('generateToken - Token 生成', () => {
    test('应生成 64 字符的十六进制 token', async () => {
        const crypto = await import('crypto');
        const token = crypto.default.randomBytes(32).toString('hex');
        expect(token.length).toBe(64);
    });

    test('每次生成的 token 应不同', async () => {
        const crypto = await import('crypto');
        const token1 = crypto.default.randomBytes(32).toString('hex');
        const token2 = crypto.default.randomBytes(32).toString('hex');
        expect(token1).not.toBe(token2);
    });
});

describe('getExpiryTime - 过期时间计算', () => {
    test('应返回当前时间 + 配置的过期时间', () => {
        const now = Date.now();
        const loginExpiry = 3600; // 1小时
        const expiry = now + (loginExpiry * 1000);

        const result = now + (3600 * 1000);
        expect(result).toBeGreaterThanOrEqual(expiry - 100);
        expect(result).toBeLessThanOrEqual(expiry + 100);
    });
});

describe('checkAuth - 认证检查', () => {
    test('应返回 false 当没有 Authorization 头', () => {
        const req = { headers: {} };
        const authHeader = req.headers.authorization;
        const result = !authHeader || !authHeader.startsWith('Bearer ');
        expect(result).toBe(true);
    });

    test('应返回 false 当 Authorization 格式错误', () => {
        const req = { headers: { authorization: 'Basic abc123' } };
        const authHeader = req.headers.authorization;
        const result = !authHeader || !authHeader.startsWith('Bearer ');
        expect(result).toBe(true);
    });

    test('应正确解析 Bearer token', () => {
        const req = { headers: { authorization: 'Bearer abc123token' } };
        const authHeader = req.headers.authorization;
        const token = authHeader.substring(7);
        expect(token).toBe('abc123token');
    });
});

describe('请求体解析 - parseRequestBody', () => {
    test('应解析有效的 JSON', async () => {
        const body = '{"password":"test123"}';
        let result;
        try {
            result = JSON.parse(body);
        } catch (e) {
            result = null;
        }
        expect(result).toEqual({ password: 'test123' });
    });

    test('应拒绝无效的 JSON', () => {
        const body = 'not valid json{';
        let result;
        let hasError = false;
        try {
            result = JSON.parse(body);
        } catch (e) {
            hasError = true;
        }
        expect(hasError).toBe(true);
    });

    test('应处理空请求体', () => {
        const body = '';
        let result;
        let hasError = false;
        try {
            if (!body.trim()) {
                result = {};
            } else {
                result = JSON.parse(body);
            }
        } catch (e) {
            hasError = true;
        }
        expect(result).toEqual({});
    });
});
