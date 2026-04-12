/**
 * Jest 全局设置
 * 在每次测试文件执行前运行
 */

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试根目录
const TEST_ROOT = path.resolve(__dirname, '../..');
const TEST_DATA_DIR = path.join(TEST_ROOT, 'test-data');

/**
 * 清理测试数据目录
 */
function cleanupTestDataDir() {
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      const files = fs.readdirSync(TEST_DATA_DIR);
      for (const file of files) {
        const filePath = path.join(TEST_DATA_DIR, file);
        const stat = fs.statSync(filePath);
        // 只清理测试文件和空目录
        if (stat.isDirectory()) {
          try {
            fs.rmdirSync(filePath);
          } catch {
            // 目录非空，忽略
          }
        } else if (file.match(/\.(tmp|test\.json|test-\d+\.log)$/)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    // 忽略清理错误
  }
}

async function cleanupTestFiles() {
  const tempPatterns = ['*.tmp', '*.test.json', 'test-*.log'];

  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      const files = fs.readdirSync(TEST_DATA_DIR);
      for (const file of files) {
        for (const pattern of tempPatterns) {
          if (file.match(pattern.replace('*', '.*'))) {
            fs.unlinkSync(path.join(TEST_DATA_DIR, file));
            break;
          }
        }
      }
    }
  } catch (error) {
    // 忽略清理错误
  }
}

/**
 * 设置测试环境
 */
export default async function setup() {
  // 测试前清理测试数据目录
  cleanupTestDataDir();

  // 确保测试数据目录存在
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  // 设置环境变量
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.TEST_DATA_DIR = TEST_DATA_DIR;

  console.log('\n🧪 Test environment initialized');
  console.log(`📁 Test data directory: ${TEST_DATA_DIR}`);
}

/**
 * 全局 beforeEach 钩子
 */
beforeEach(() => {
  // 清理所有 mock
  jest.clearAllMocks();

  // 重置 fake timers
  jest.useRealTimers();
});

/**
 * 全局 afterEach 钩子
 */
afterEach(async () => {
  // 清理临时文件
  await cleanupTestFiles();
});
