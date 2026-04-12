/**
 * Jest 全局清理
 * 在所有测试完成后运行
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_ROOT = path.resolve(__dirname, '../..');
const TEST_DATA_DIR = path.join(TEST_ROOT, 'test-data');

/**
 * 全局清理
 */
export default async function teardown() {
  console.log('\n🧹 Cleaning up test environment...');

  try {
    // 清理测试数据目录
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      console.log('✅ Test data directory cleaned');
    }
  } catch (error) {
    console.error('⚠️  Error during cleanup:', error.message);
  }

  console.log('👋 Test environment teardown complete\n');
}
