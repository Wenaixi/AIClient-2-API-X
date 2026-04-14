/**
 * Upload Config API - Unit Tests
 * Tests src/ui-modules/upload-config-api.js
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock logger first
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('upload-config-api', () => {
    let mockReq;
    let mockRes;
    let mockCurrentConfig;
    let mockProviderPoolManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = {};
        mockRes = {
            writeHead: jest.fn(),
            end: jest.fn()
        };
        mockCurrentConfig = {
            GEMINI_OAUTH_CREDS_FILE_PATH: 'configs/gemini/creds.json',
            KIRO_OAUTH_CREDS_FILE_PATH: 'configs/kiro/creds.json',
            providerPools: {}
        };
        mockProviderPoolManager = {
            providerPools: {}
        };
    });

    describe('basic function existence', () => {
        it('should export handleGetUploadConfigs function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleGetUploadConfigs).toBe('function');
        });

        it('should export handleViewConfigFile function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleViewConfigFile).toBe('function');
        });

        it('should export handleDownloadConfigFile function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleDownloadConfigFile).toBe('function');
        });

        it('should export handleDeleteConfigFile function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleDeleteConfigFile).toBe('function');
        });

        it('should export handleDownloadAllConfigs function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleDownloadAllConfigs).toBe('function');
        });

        it('should export handleDeleteUnboundConfigs function', async () => {
            const module = await import('../../../src/ui-modules/upload-config-api.js');
            expect(typeof module.handleDeleteUnboundConfigs).toBe('function');
        });
    });
});
