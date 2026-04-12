/**
 * 测试辅助函数库
 * 提供通用的测试工具函数
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_ROOT = path.resolve(__dirname, '../..');

/**
 * 生成测试用的 UUID
 * @returns {string} UUID
 */
export function generateTestUUID() {
  return crypto.randomUUID();
}

/**
 * 生成测试用的时间戳
 * @returns {number} 时间戳
 */
export function generateTestTimestamp() {
  return Date.now();
}

/**
 * 创建临时测试文件
 * @param {string} filename - 文件名
 * @param {string|object} content - 文件内容
 * @param {string} subdir - 子目录
 * @returns {string} 文件完整路径
 */
export function createTempFile(filename, content, subdir = '') {
  const testDataDir = process.env.TEST_DATA_DIR || path.join(TEST_ROOT, 'test-data');
  const dir = subdir ? path.join(testDataDir, subdir) : testDataDir;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, filename);
  const contentToWrite = typeof content === 'object'
    ? JSON.stringify(content, null, 2)
    : content;

  fs.writeFileSync(filePath, contentToWrite, 'utf-8');
  return filePath;
}

/**
 * 删除临时测试文件
 * @param {string} filePath - 文件路径
 */
export function deleteTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // 忽略删除错误
  }
}

/**
 * 创建 Mock Request 对象
 * @param {object} overrides - 覆盖属性
 * @returns {object} Mock Request
 */
export function createMockRequest(overrides = {}) {
  return {
    url: '/api/test',
    method: 'GET',
    headers: {},
    body: null,
    query: {},
    params: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

/**
 * 创建 Mock Response 对象
 * @param {object} overrides - 覆盖属性
 * @returns {object} Mock Response
 */
export function createMockResponse(overrides = {}) {
  const headers = {};
  const data = { chunks: [] };

  return {
    statusCode: 200,
    headers,
    writeHead: jest.fn(function(code, hdrs) {
      this.statusCode = code;
      Object.assign(headers, hdrs);
    }),
    write: jest.fn((chunk) => {
      data.chunks.push(chunk);
    }),
    end: jest.fn((chunk) => {
      if (chunk) data.chunks.push(chunk);
    }),
    json: jest.fn((obj) => {
      data.chunks.push(JSON.stringify(obj));
    }),
    getData: () => data.chunks.join(''),
    getHeaders: () => headers,
    ...overrides,
  };
}

/**
 * 等待指定时间
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待条件满足
 * @param {Function} condition - 条件函数
 * @param {number} timeout - 超时时间（毫秒）
 * @param {number} interval - 检查间隔（毫秒）
 * @returns {Promise<boolean>}
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }

  return false;
}

/**
 * 捕获异步错误
 * @param {Function} fn - 异步函数
 * @returns {Promise<{error: Error|null, result: any}>}
 */
export async function captureAsyncError(fn) {
  try {
    const result = await fn();
    return { error: null, result };
  } catch (error) {
    return { error, result: null };
  }
}

/**
 * 创建受控的 Promise
 * @returns {{promise: Promise, resolve: Function, reject: Function}}
 */
export function createControlledPromise() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * 模拟定时器推进
 * @param {number} ms - 毫秒
 */
export async function advanceTimersByTime(ms) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve(); // 让微任务队列清空
}

/**
 * 生成随机字符串
 * @param {number} length - 长度
 * @returns {string}
 */
export function generateRandomString(length = 10) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * 深度克隆对象
 * @param {any} obj - 要克隆的对象
 * @returns {any}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 比较两个对象是否相等（忽略顺序）
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function deepEqualIgnoreOrder(a, b) {
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) {
    return a === b;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqualIgnoreOrder(item, b[index]));
  }

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length) return false;
  if (!keysA.every((key, i) => key === keysB[i])) return false;

  return keysA.every(key => deepEqualIgnoreOrder(a[key], b[key]));
}

/**
 * 测试环境检查
 * @returns {object} 环境信息
 */
export function getTestEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV,
    isCI: process.env.CI === 'true',
    platform: process.platform,
    nodeVersion: process.version,
    testDataDir: process.env.TEST_DATA_DIR,
  };
}

/**
 * 跳过测试的辅助函数（用于条件跳过）
 * @param {string} reason - 跳过原因
 */
export function skipTest(reason) {
  console.log(`⏭️  Skipping test: ${reason}`);
  return true;
}
