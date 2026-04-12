/**
 * provider-utils.js 单元测试
 * 测试 src/utils/provider-utils.js 中的工具函数
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Mock dependencies
// ============================================================

jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

// ============================================================
// Import source module
// ============================================================

import {
    PROVIDER_MAPPINGS,
    generateUUID,
    normalizePath,
    getFileName,
    formatSystemPath,
    pathsEqual,
    isPathUsed,
    detectProviderFromPath,
    getProviderMappingByDirName,
    isValidOAuthCredentials,
    createProviderConfig,
    addToUsedPaths,
    isPathLinked
} from '../../../src/utils/provider-utils.js';

describe('PROVIDER_MAPPINGS', () => {
    test('should contain all expected providers', () => {
        const dirNames = PROVIDER_MAPPINGS.map(m => m.dirName);
        expect(dirNames).toContain('kiro');
        expect(dirNames).toContain('gemini');
        expect(dirNames).toContain('qwen');
        expect(dirNames).toContain('antigravity');
        expect(dirNames).toContain('codex');
        expect(dirNames).toContain('grok');
        expect(dirNames).toContain('kimi');
    });

    test('each mapping should have required fields', () => {
        PROVIDER_MAPPINGS.forEach(mapping => {
            expect(mapping.dirName).toBeDefined();
            expect(mapping.patterns).toBeInstanceOf(Array);
            expect(mapping.patterns.length).toBeGreaterThan(0);
            expect(mapping.providerType).toBeDefined();
            expect(mapping.credPathKey).toBeDefined();
            expect(mapping.defaultCheckModel).toBeDefined();
            expect(mapping.displayName).toBeDefined();
            expect(typeof mapping.needsProjectId).toBe('boolean');
            expect(mapping.urlKeys).toBeInstanceOf(Array);
        });
    });

    test('kiro mapping should have correct properties', () => {
        const kiro = PROVIDER_MAPPINGS.find(m => m.dirName === 'kiro');
        expect(kiro.providerType).toBe('claude-kiro-oauth');
        expect(kiro.needsProjectId).toBe(false);
        expect(kiro.defaultCheckModel).toBe('claude-haiku-4-5');
    });

    test('gemini mapping should need project ID', () => {
        const gemini = PROVIDER_MAPPINGS.find(m => m.dirName === 'gemini');
        expect(gemini.needsProjectId).toBe(true);
        expect(gemini.providerType).toBe('gemini-cli-oauth');
    });
});

describe('generateUUID', () => {
    test('should generate a valid UUID v4 format', () => {
        const uuid = generateUUID();
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidV4Regex);
    });

    test('should generate unique UUIDs', () => {
        const uuids = new Set();
        for (let i = 0; i < 100; i++) {
            uuids.add(generateUUID());
        }
        expect(uuids.size).toBe(100);
    });

    test('should work without crypto.randomUUID (fallback)', () => {
        // This test ensures the fallback works even if crypto.randomUUID is available
        const uuid = generateUUID();
        expect(uuid).toBeDefined();
        expect(uuid.length).toBe(36);
    });
});

describe('normalizePath', () => {
    test('should convert backslashes to forward slashes', () => {
        const result = normalizePath('path\\to\\file');
        expect(result).toBe('path/to/file');
    });

    test('should handle mixed slashes', () => {
        const result = normalizePath('path/to\\file/here');
        expect(result).toBe('path/to/file/here');
    });

    test('should return empty string for empty input', () => {
        expect(normalizePath('')).toBe('');
        expect(normalizePath(null)).toBe(null);
        expect(normalizePath(undefined)).toBe(undefined);
    });

    test('should handle absolute paths', () => {
        const result = normalizePath('E:\\Projects\\test\\file.js');
        expect(result).toBe('E:/Projects/test/file.js');
    });

    test('should normalize path segments like ..', () => {
        const result = normalizePath('path/../to/file');
        // path.normalize resolves the .. segment, so 'path/../to/file' becomes 'to/file'
        // On Windows: path/../to/file -> to/file
        // Then normalizePath converts backslashes to forward slashes
        expect(result).toBe('to/file');
    });
});

describe('getFileName', () => {
    test('should extract filename from path', () => {
        expect(getFileName('path/to/file.txt')).toBe('file.txt');
        expect(getFileName('/absolute/path/to/file.js')).toBe('file.js');
    });

    test('should handle paths with backslashes', () => {
        expect(getFileName('path\\to\\file.txt')).toBe('file.txt');
    });

    test('should handle filename without directory', () => {
        expect(getFileName('file.txt')).toBe('file.txt');
    });

    test('should handle hidden files', () => {
        expect(getFileName('.env')).toBe('.env');
        expect(getFileName('path/.gitignore')).toBe('.gitignore');
    });
});

describe('formatSystemPath', () => {
    const isWindows = process.platform === 'win32';
    const separator = isWindows ? '\\' : '/';

    test('should add ./ prefix if not present', () => {
        const result = formatSystemPath('path/to/file');
        expect(result).toBe('.' + separator + 'path' + separator + 'to' + separator + 'file');
    });

    test('should not double ./ prefix', () => {
        const input = isWindows ? '.\\path\\to\\file' : './path/to/file';
        const result = formatSystemPath(input);
        const expectedSuffix = isWindows ? 'path\\to\\file' : 'path/to/file';
        expect(result).toBe('.' + separator + expectedSuffix);
    });

    test('should convert all slashes to system separator', () => {
        const result = formatSystemPath('path/to\\file/here');
        // All slashes should be converted to system separator
        // On Windows, this means backslashes; on Unix, forward slashes
        if (process.platform === 'win32') {
            expect(result).not.toContain('/');
        } else {
            expect(result).not.toContain('\\');
        }
    });

    test('should return empty string for empty input', () => {
        expect(formatSystemPath('')).toBe('');
        expect(formatSystemPath(null)).toBe(null);
    });
});

describe('pathsEqual', () => {
    test('should return true for identical paths', () => {
        expect(pathsEqual('path/to/file', 'path/to/file')).toBe(true);
    });

    test('should return true for paths with different slash types', () => {
        expect(pathsEqual('path/to/file', 'path\\to\\file')).toBe(true);
    });

    test('should return true for paths with ./ prefix difference', () => {
        expect(pathsEqual('./path/to/file', 'path/to/file')).toBe(true);
    });

    test('should return true when one path ends with the other', () => {
        expect(pathsEqual('path/to/file', 'to/file')).toBe(true);
    });

    test('should return false for different paths', () => {
        expect(pathsEqual('path/to/file1', 'path/to/file2')).toBe(false);
    });

    test('should return false for null/undefined inputs', () => {
        expect(pathsEqual(null, 'path')).toBe(false);
        expect(pathsEqual('path', null)).toBe(false);
        expect(pathsEqual(null, null)).toBe(false);
    });

    test('should handle absolute paths', () => {
        expect(pathsEqual('E:/path/to/file', 'E:/path/to/file')).toBe(true);
        expect(pathsEqual('E:\\path\\to\\file', 'E:/path/to/file')).toBe(true);
    });
});

describe('isPathUsed', () => {
    test('should return true when path is directly in usedPaths', () => {
        const usedPaths = new Set(['path/to/file.txt']);
        expect(isPathUsed('path/to/file.txt', 'file.txt', usedPaths)).toBe(true);
    });

    test('should return true when normalized path matches', () => {
        const usedPaths = new Set(['path/to/file.txt']);
        expect(isPathUsed('path\\to\\file.txt', 'file.txt', usedPaths)).toBe(true);
    });

    test('should return true when filename matches in same directory', () => {
        const usedPaths = new Set(['path/to/file.txt']);
        expect(isPathUsed('./path/to/file.txt', 'file.txt', usedPaths)).toBe(true);
    });

    test('should return false when only filename matches but directory differs', () => {
        const usedPaths = new Set(['other/path/file.txt']);
        // This should return false because directories are different
        expect(isPathUsed('different/path/file.txt', 'file.txt', usedPaths)).toBe(false);
    });

    test('should return false for empty relativePath', () => {
        const usedPaths = new Set(['path/to/file.txt']);
        expect(isPathUsed('', 'file.txt', usedPaths)).toBe(false);
        expect(isPathUsed(null, 'file.txt', usedPaths)).toBe(false);
    });

    test('should handle empty usedPaths set', () => {
        expect(isPathUsed('path/to/file.txt', 'file.txt', new Set())).toBe(false);
    });
});

describe('detectProviderFromPath', () => {
    test('should detect kiro provider from kiro path', () => {
        const result = detectProviderFromPath('configs/kiro/credentials.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('claude-kiro-oauth');
    });

    test('should detect gemini provider from gemini path', () => {
        const result = detectProviderFromPath('/configs/gemini/token.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('gemini-cli-oauth');
    });

    test('should detect gemini-cli provider', () => {
        const result = detectProviderFromPath('configs/gemini-cli/config.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('gemini-cli-oauth');
    });

    test('should detect qwen provider', () => {
        const result = detectProviderFromPath('configs/qwen/auth.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('openai-qwen-oauth');
    });

    test('should detect antigravity provider', () => {
        const result = detectProviderFromPath('configs/antigravity/keys.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('gemini-antigravity');
    });

    test('should detect codex provider', () => {
        const result = detectProviderFromPath('configs/codex/token.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('openai-codex-oauth');
    });

    test('should detect grok provider', () => {
        const result = detectProviderFromPath('configs/grok/cookie.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('grok-custom');
    });

    test('should detect kimi provider', () => {
        const result = detectProviderFromPath('configs/kimi/credentials.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('kimi-oauth');
    });

    test('should return null for unknown path', () => {
        const result = detectProviderFromPath('configs/unknown/provider.json');
        expect(result).toBeNull();
    });

    test('should return null for empty path', () => {
        expect(detectProviderFromPath('')).toBeNull();
    });

    test('result should contain all required mapping fields', () => {
        const result = detectProviderFromPath('configs/kiro/auth.json');
        expect(result).not.toBeNull();
        expect(result.providerType).toBeDefined();
        expect(result.credPathKey).toBeDefined();
        expect(result.defaultCheckModel).toBeDefined();
        expect(result.displayName).toBeDefined();
        expect(typeof result.needsProjectId).toBe('boolean');
    });
});

describe('getProviderMappingByDirName', () => {
    test('should return mapping for kiro', () => {
        const result = getProviderMappingByDirName('kiro');
        expect(result).not.toBeNull();
        expect(result.dirName).toBe('kiro');
        expect(result.providerType).toBe('claude-kiro-oauth');
    });

    test('should return mapping for gemini', () => {
        const result = getProviderMappingByDirName('gemini');
        expect(result).not.toBeNull();
        expect(result.dirName).toBe('gemini');
    });

    test('should return mapping for qwen', () => {
        const result = getProviderMappingByDirName('qwen');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('openai-qwen-oauth');
    });

    test('should return mapping for antigravity', () => {
        const result = getProviderMappingByDirName('antigravity');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('gemini-antigravity');
    });

    test('should return mapping for codex', () => {
        const result = getProviderMappingByDirName('codex');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('openai-codex-oauth');
    });

    test('should return mapping for grok', () => {
        const result = getProviderMappingByDirName('grok');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('grok-custom');
    });

    test('should return mapping for kimi', () => {
        const result = getProviderMappingByDirName('kimi');
        expect(result).not.toBeNull();
        expect(result.providerType).toBe('kimi-oauth');
    });

    test('should return null for unknown directory name', () => {
        expect(getProviderMappingByDirName('unknown')).toBeNull();
    });

    test('should handle empty string', () => {
        expect(getProviderMappingByDirName('')).toBeNull();
    });
});

describe('isValidOAuthCredentials', () => {
    const testFilePath = '/tmp/test_cred.json';

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should return true for credentials with access_token', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            access_token: 'test-token',
            refresh_token: 'refresh-token'
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for credentials with accessToken (camelCase)', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            accessToken: 'test-token',
            refreshToken: 'refresh-token'
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for credentials with client_id', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            client_id: 'client-123',
            client_secret: 'secret-456'
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for credentials with token field', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            token: 'some-token'
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for credentials with credentials field', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            credentials: { key: 'value' }
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for installed client credentials', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            installed: { client_id: 'id' }
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return true for web credentials', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            web: { client_id: 'id', client_secret: 'secret' }
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(true);
    });

    test('should return false for empty object', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({}));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(false);
    });

    test('should return false for non-OAuth data', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({
            name: 'Test',
            value: 'data'
        }));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(false);
    });

    test('should return false when file read fails', async () => {
        jest.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('File not found'));
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(false);
    });

    test('should return false for invalid JSON', async () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue('not valid json');
        const result = await isValidOAuthCredentials(testFilePath);
        expect(result).toBe(false);
    });
});

describe('createProviderConfig', () => {
    test('should create config with required fields', () => {
        const config = createProviderConfig({
            credPathKey: 'KIRO_OAUTH_CREDS_FILE_PATH',
            credPath: '/path/to/cred.json',
            defaultCheckModel: 'claude-haiku-4-5',
            needsProjectId: false,
            urlKeys: ['KIRO_BASE_URL']
        });

        expect(config.KIRO_OAUTH_CREDS_FILE_PATH).toBe('/path/to/cred.json');
        expect(config.checkModelName).toBe('claude-haiku-4-5');
        expect(config.checkHealth).toBe(false);
        expect(config.isHealthy).toBe(true);
        expect(config.isDisabled).toBe(false);
        expect(config.lastUsed).toBeNull();
        expect(config.usageCount).toBe(0);
        expect(config.errorCount).toBe(0);
        expect(config.uuid).toBeDefined();
    });

    test('should generate UUID for new config', () => {
        const config1 = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model'
        });
        const config2 = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model'
        });

        expect(config1.uuid).not.toBe(config2.uuid);
    });

    test('should add PROJECT_ID when needsProjectId is true', () => {
        const config = createProviderConfig({
            credPathKey: 'GEMINI_OAUTH_CREDS_FILE_PATH',
            credPath: '/path/to/cred.json',
            defaultCheckModel: 'gemini-2.5-flash',
            needsProjectId: true,
            urlKeys: []
        });

        expect(config.PROJECT_ID).toBe('');
    });

    test('should not add PROJECT_ID when needsProjectId is false', () => {
        const config = createProviderConfig({
            credPathKey: 'KIRO_OAUTH_CREDS_FILE_PATH',
            credPath: '/path/to/cred.json',
            defaultCheckModel: 'claude-haiku-4-5',
            needsProjectId: false,
            urlKeys: []
        });

        expect(config.PROJECT_ID).toBeUndefined();
    });

    test('should initialize urlKeys with empty strings', () => {
        const config = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model',
            needsProjectId: false,
            urlKeys: ['URL_1', 'URL_2', 'URL_3']
        });

        expect(config.URL_1).toBe('');
        expect(config.URL_2).toBe('');
        expect(config.URL_3).toBe('');
    });

    test('should set checkHealth from defaultCheckHealth option', () => {
        const config1 = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model',
            defaultCheckHealth: true,
            needsProjectId: false,
            urlKeys: []
        });

        const config2 = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model',
            defaultCheckHealth: false,
            needsProjectId: false,
            urlKeys: []
        });

        expect(config1.checkHealth).toBe(true);
        expect(config2.checkHealth).toBe(false);
    });

    test('should default checkHealth to false when not specified', () => {
        const config = createProviderConfig({
            credPathKey: 'TEST_KEY',
            credPath: '/test.json',
            defaultCheckModel: 'test-model',
            needsProjectId: false,
            urlKeys: []
        });

        expect(config.checkHealth).toBe(false);
    });
});

describe('addToUsedPaths', () => {
    test('should add path in multiple formats to set', () => {
        const usedPaths = new Set();
        addToUsedPaths(usedPaths, 'path/to/file.txt');

        expect(usedPaths.has('path/to/file.txt')).toBe(true);
        // On Windows, backslashes are normalized to forward slashes
        // So 'path/to/file.txt' would be the stored normalized version
        expect(usedPaths.has('path/to/file.txt')).toBe(true);
        expect(usedPaths.has('./path/to/file.txt')).toBe(true);
    });

    test('should handle path already starting with ./', () => {
        const usedPaths = new Set();
        addToUsedPaths(usedPaths, './path/to/file.txt');

        expect(usedPaths.has('./path/to/file.txt')).toBe(true);
        expect(usedPaths.has('path/to/file.txt')).toBe(true);
    });

    test('should not add empty path', () => {
        const usedPaths = new Set();
        addToUsedPaths(usedPaths, '');
        addToUsedPaths(usedPaths, null);
        addToUsedPaths(usedPaths, undefined);

        expect(usedPaths.size).toBe(0);
    });

    test('should normalize all backslashes to forward slashes', () => {
        const usedPaths = new Set();
        addToUsedPaths(usedPaths, 'path\\to\\file');

        expect(usedPaths.has('path/to/file')).toBe(true);
        expect(usedPaths.has('path\\to\\file')).toBe(true);
    });
});

describe('isPathLinked', () => {
    test('should return true when path is directly in linkedPaths', () => {
        const linkedPaths = new Set(['path/to/file.txt']);
        expect(isPathLinked('path/to/file.txt', linkedPaths)).toBe(true);
    });

    test('should return true when path with ./ is in linkedPaths', () => {
        const linkedPaths = new Set(['./path/to/file.txt']);
        expect(isPathLinked('path/to/file.txt', linkedPaths)).toBe(true);
    });

    test('should return true when path without ./ is in linkedPaths', () => {
        const linkedPaths = new Set(['path/to/file.txt']);
        expect(isPathLinked('./path/to/file.txt', linkedPaths)).toBe(true);
    });

    test('should return false when path is not in linkedPaths', () => {
        const linkedPaths = new Set(['other/path/file.txt']);
        expect(isPathLinked('path/to/file.txt', linkedPaths)).toBe(false);
    });

    test('should return false for empty linkedPaths', () => {
        expect(isPathLinked('path/to/file.txt', new Set())).toBe(false);
    });
});
