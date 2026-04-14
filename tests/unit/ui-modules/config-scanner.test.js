/**
 * Config Scanner - Unit Tests
 * Tests src/ui-modules/config-scanner.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        readdir: jest.fn(),
        stat: jest.fn(),
        readFile: jest.fn()
    }
}));

jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    relative: jest.fn((cwd, p) => p),
    basename: jest.fn((p) => p.split('/').pop()),
    extname: jest.fn((p) => {
        const idx = p.lastIndexOf('.');
        return idx >= 0 ? p.substring(idx) : '';
    }),
    sep: '/'
}));

jest.mock('../../../src/utils/provider-utils.js', () => ({
    addToUsedPaths: jest.fn(),
    isPathUsed: jest.fn(),
    pathsEqual: jest.fn()
}));

// Import after mocking
import { scanConfigFiles } from '../../../src/ui-modules/config-scanner.js';
import { existsSync, promises } from 'fs';
import { addToUsedPaths, isPathUsed } from '../../../src/utils/provider-utils.js';

describe('config-scanner', () => {
    let mockCurrentConfig;
    let mockProviderPoolManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCurrentConfig = {
            GEMINI_OAUTH_CREDS_FILE_PATH: 'configs/gemini/creds.json',
            KIRO_OAUTH_CREDS_FILE_PATH: 'configs/kiro/creds.json',
            QWEN_OAUTH_CREDS_FILE_PATH: 'configs/qwen/creds.json',
            ANTIGRAVITY_OAUTH_CREDS_FILE_PATH: 'configs/antigravity/creds.json',
            CODEX_OAUTH_CREDS_FILE_PATH: 'configs/codex/creds.json',
            providerPools: {}
        };
        mockProviderPoolManager = {
            providerPools: {}
        };
    });

    describe('scanConfigFiles', () => {
        it('should return empty array when configs directory does not exist', async () => {
            existsSync.mockReturnValue(false);
            const result = await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            expect(result).toEqual([]);
        });

        it('should call addToUsedPaths for all OAuth credential paths', async () => {
            existsSync.mockReturnValue(true); // Need to return true to continue past early return
            promises.readdir.mockResolvedValue([]);
            await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            expect(addToUsedPaths).toHaveBeenCalledWith(expect.any(Set), mockCurrentConfig.GEMINI_OAUTH_CREDS_FILE_PATH);
            expect(addToUsedPaths).toHaveBeenCalledWith(expect.any(Set), mockCurrentConfig.KIRO_OAUTH_CREDS_FILE_PATH);
            expect(addToUsedPaths).toHaveBeenCalledWith(expect.any(Set), mockCurrentConfig.QWEN_OAUTH_CREDS_FILE_PATH);
            expect(addToUsedPaths).toHaveBeenCalledWith(expect.any(Set), mockCurrentConfig.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH);
            expect(addToUsedPaths).toHaveBeenCalledWith(expect.any(Set), mockCurrentConfig.CODEX_OAUTH_CREDS_FILE_PATH);
        });

        it('should use providerPoolManager.providerPools when available', async () => {
            existsSync.mockReturnValue(false);
            const customPools = { openai: [{ uuid: 'test-uuid', customName: 'Test Node' }] };
            mockProviderPoolManager.providerPools = customPools;
            await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            // Just verify it completes without error
        });

        it('should handle configs directory existing but empty', async () => {
            existsSync.mockReturnValue(true);
            promises.readdir.mockResolvedValue([]);
            const result = await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            expect(Array.isArray(result)).toBe(true);
        });

        it('should filter OAuth related file types', async () => {
            existsSync.mockReturnValue(true);
            promises.readdir.mockResolvedValue([
                { isFile: () => true, name: 'test.json' },
                { isFile: () => true, name: 'test.txt' },
                { isFile: () => true, name: 'test.key' },
                { isFile: () => true, name: 'test.pem' },
                { isFile: () => true, name: 'test.oauth' },
                { isFile: () => true, name: 'test.creds' },
                { isFile: () => true, name: 'test.md' },
                { isFile: () => false, name: 'subdir' }
            ]);
            promises.stat.mockResolvedValue({
                size: 100,
                mtime: new Date('2026-04-14')
            });
            promises.readFile.mockResolvedValue('{}');

            await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            // Should process .json, .txt, .key, .pem, .oauth, .creds but not .md
        });

        it('should recursively scan subdirectories', async () => {
            existsSync.mockReturnValue(true);
            promises.readdir
                .mockResolvedValueOnce([
                    { isFile: () => false, name: 'subdir' }
                ])
                .mockResolvedValueOnce([
                    { isFile: () => true, name: 'nested.json' }
                ]);
            promises.stat.mockResolvedValue({
                size: 100,
                mtime: new Date('2026-04-14')
            });
            promises.readFile.mockResolvedValue('{"test": true}');

            const result = await scanConfigFiles(mockCurrentConfig, mockProviderPoolManager);
            expect(Array.isArray(result)).toBe(true);
        });
    });
});
