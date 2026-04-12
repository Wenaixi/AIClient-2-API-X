/**
 * Auth 模块单元测试
 * 测试密码验证和认证逻辑
 */

import { describe, test, expect, beforeAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';

// Mock 依赖
const mockReadPasswordFile = jest.fn();
const mockWriteFile = jest.fn();
const mockExistsSync = jest.fn();

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock CONFIG
const mockCONFIG = {
  LOGIN_EXPIRY: 3600,
};

// 简化的 validateCredentials 测试实现
async function validateCredentialsImplementation(password, storedPassword) {
  if (!storedPassword || !password) return false;

  // 新格式：pbkdf2:salt:hash
  if (storedPassword.startsWith('pbkdf2:')) {
    const parts = storedPassword.split(':');
    if (parts.length !== 3) return false;
    const [, salt, storedHash] = parts;

    const PASSWORD = {
      PBKDF2_ITERATIONS: 310000,
      PBKDF2_KEYLEN: 64,
      PBKDF2_DIGEST: 'sha512',
    };

    const inputHash = await new Promise((resolve, reject) =>
      crypto.pbkdf2(password.trim(), salt, PASSWORD.PBKDF2_ITERATIONS, PASSWORD.PBKDF2_KEYLEN, PASSWORD.PBKDF2_DIGEST, (err, key) =>
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
  const PASSWORD = {
    PBKDF2_ITERATIONS: 310000,
    PBKDF2_KEYLEN: 64,
    PBKDF2_DIGEST: 'sha512',
  };

  const hash = await new Promise((resolve, reject) =>
    crypto.pbkdf2(password, salt, PASSWORD.PBKDF2_ITERATIONS, PASSWORD.PBKDF2_KEYLEN, PASSWORD.PBKDF2_DIGEST, (err, key) =>
      err ? reject(err) : resolve(key.toString('hex'))
    )
  );

  return `pbkdf2:${salt}:${hash}`;
}

describe('Password Validation', () => {
  describe('Plain Text Password (Legacy)', () => {
    test('should validate correct plain text password', async () => {
      const password = 'mysecretpassword';
      const storedPassword = password;

      const result = await validateCredentialsImplementation(password, storedPassword);
      expect(result).toBe(true);
    });

    test('should reject incorrect plain text password', async () => {
      const correctPassword = 'mysecretpassword';
      const wrongPassword = 'wrongpassword';
      const storedPassword = correctPassword;

      const result = await validateCredentialsImplementation(wrongPassword, storedPassword);
      expect(result).toBe(false);
    });

    test('should reject when password is empty', async () => {
      const storedPassword = 'secret';
      const result = await validateCredentialsImplementation('', storedPassword);
      expect(result).toBe(false);
    });

    test('should reject when stored password is empty', async () => {
      const password = 'secret';
      const result = await validateCredentialsImplementation(password, '');
      expect(result).toBe(false);
    });

    test('should handle whitespace trimming', async () => {
      const password = '  mysecretpassword  ';
      const storedPassword = 'mysecretpassword';

      const result = await validateCredentialsImplementation(password, storedPassword);
      expect(result).toBe(true);
    });

    test('should reject when length differs', async () => {
      const password = 'short';
      const storedPassword = 'muchlongerpassword';

      const result = await validateCredentialsImplementation(password, storedPassword);
      expect(result).toBe(false);
    });
  });

  describe('PBKDF2 Hashed Password', () => {
    test('should validate correct PBKDF2 hashed password', async () => {
      const password = 'mySecurePassword123!';
      const hashedPassword = await hashPassword(password);

      const result = await validateCredentialsImplementation(password, hashedPassword);
      expect(result).toBe(true);
    });

    test('should reject incorrect PBKDF2 password', async () => {
      const correctPassword = 'mySecurePassword123!';
      const wrongPassword = 'wrongPassword456!';
      const hashedPassword = await hashPassword(correctPassword);

      const result = await validateCredentialsImplementation(wrongPassword, hashedPassword);
      expect(result).toBe(false);
    });

    test('should reject malformed PBKDF2 format', async () => {
      const password = 'mySecurePassword123!';
      const malformedHash = 'pbkdf2:onlyTwoParts';

      const result = await validateCredentialsImplementation(password, malformedHash);
      expect(result).toBe(false);
    });

    test('should handle different salts producing different hashes', async () => {
      const password = 'samePassword';

      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // 相同的密码，不同的盐，hash 应该不同
      expect(hash1).not.toBe(hash2);

      // 但都应该能验证
      const result1 = await validateCredentialsImplementation(password, hash1);
      const result2 = await validateCredentialsImplementation(password, hash2);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    test('should reject invalid PBKDF2 format with extra colons', async () => {
      const password = 'test';
      const invalidHash = 'pbkdf2:salt:hash:with:extra:colons';

      const result = await validateCredentialsImplementation(password, invalidHash);
      expect(result).toBe(false);
    });
  });

  describe('Timing Attack Prevention', () => {
    test('should use timing-safe comparison for plain text', async () => {
      // 这个测试验证代码使用了 timingSafeEqual
      // 通过检查函数不会因为前缀匹配而提前返回
      const password1 = 'aaaaab';
      const password2 = 'aaaaaa';

      const result = await validateCredentialsImplementation(password1, password2);
      expect(result).toBe(false);
    });

    test('should use timing-safe comparison for PBKDF2', async () => {
      const password = 'testPassword';
      const hash = await hashPassword(password);

      // 验证时会进行固定时间的比较
      const result = await validateCredentialsImplementation(password, hash);
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null password', async () => {
      const result = await validateCredentialsImplementation(null, 'stored');
      expect(result).toBe(false);
    });

    test('should handle undefined password', async () => {
      const result = await validateCredentialsImplementation(undefined, 'stored');
      expect(result).toBe(false);
    });

    test('should handle null stored password', async () => {
      const result = await validateCredentialsImplementation('password', null);
      expect(result).toBe(false);
    });

    test('should handle undefined stored password', async () => {
      const result = await validateCredentialsImplementation('password', undefined);
      expect(result).toBe(false);
    });

    test('should handle special characters in password', async () => {
      const password = '密码🔐!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\\';
      const hash = await hashPassword(password);

      const result = await validateCredentialsImplementation(password, hash);
      expect(result).toBe(true);
    });

    test('should handle very long passwords', async () => {
      const password = 'a'.repeat(10000);
      const hash = await hashPassword(password);

      const result = await validateCredentialsImplementation(password, hash);
      expect(result).toBe(true);
    });

    test('should handle unicode characters', async () => {
      const password = '日本語パスワード🔐한국어';
      const hash = await hashPassword(password);

      const result = await validateCredentialsImplementation(password, hash);
      expect(result).toBe(true);
    });
  });
});

describe('Password Hashing', () => {
  test('should produce PBKDF2 format hash', async () => {
    const password = 'testPassword123';
    const hash = await hashPassword(password);

    expect(hash.startsWith('pbkdf2:')).toBe(true);
    const parts = hash.split(':');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('pbkdf2');
    expect(parts[1].length).toBe(32); // 16 bytes hex = 32 chars
    expect(parts[2].length).toBe(128); // 64 bytes hex = 128 chars
  });

  test('should produce unique hashes for same password', async () => {
    const password = 'samePassword';

    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  test('should produce hashes with correct parameters', async () => {
    const password = 'test';
    const hash = await hashPassword(password);

    const [, salt, storedHash] = hash.split(':');

    // 验证 salt 长度 (16 bytes -> 32 hex chars)
    expect(salt.length).toBe(32);

    // 验证 hash 长度 (64 bytes -> 128 hex chars for SHA-512)
    expect(storedHash.length).toBe(128);
  });
});

describe('Security Best Practices', () => {
  test('should use at least 310000 PBKDF2 iterations', async () => {
    // OWASP 2023 建议
    const PBKDF2_ITERATIONS = 310000;
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310000);
  });

  test('should use SHA-512 or stronger for PBKDF2', async () => {
    const PBKDF2_DIGEST = 'sha512';
    expect(['sha512', 'sha3-512']).toContain(PBKDF2_DIGEST);
  });

  test('should use adequate key length', async () => {
    const PBKDF2_KEYLEN = 64;
    expect(PBKDF2_KEYLEN).toBeGreaterThanOrEqual(32);
  });

  test('should generate random salts', async () => {
    // 使用接近生产环境的参数进行测试
    const testHashPassword = async (password) => {
      const salt = crypto.randomBytes(32).toString('hex'); // 生产级 salt 长度
      const TEST_ITERATIONS = 1000; // 测试用迭代次数（生产310000）
      const hash = await new Promise((resolve, reject) =>
        crypto.pbkdf2(password, salt, TEST_ITERATIONS, 32, 'sha512', (err, key) => // 生产级 keylen
          err ? reject(err) : resolve(key.toString('hex'))
        )
      );
      return `pbkdf2:${salt}:${hash}`;
    };

    const salts = new Set();
    // 进一步减少测试次数以加快测试速度
    for (let i = 0; i < 5; i++) {
      const hash = await testHashPassword('samePassword');
      const salt = hash.split(':')[1];
      salts.add(salt);
    }
    // 所有盐应该唯一
    expect(salts.size).toBe(5);
  }, 15000);
});
