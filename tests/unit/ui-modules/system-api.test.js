import os from 'os';

// Mock os module
jest.mock('os', () => ({
    cpus: jest.fn(() => [
        { times: { idle: 100, user: 50, sys: 30, irq: 0 } },
        { times: { idle: 200, user: 100, sys: 60, irq: 0 } }
    ]),
    totalmem: jest.fn(() => 16000000000),
    freemem: jest.fn(() => 8000000000),
    platform: jest.fn(() => 'win32'),
    arch: jest.fn(() => 'x64'),
    release: jest.fn(() => '10.0.26200'),
    type: jest.fn(() => 'Windows_NT'),
    hostname: jest.fn(() => 'TEST-HOSTNAME')
}));

// Mock child_process
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn()
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    basename: jest.fn((p) => p.split('/').pop())
}));

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    currentLogFile: '/path/to/log.log',
    clearTodayLog: jest.fn()
}));

// Mock event-broadcast
jest.mock('../../../src/ui-modules/event-broadcast.js', () => ({
    broadcastEvent: jest.fn()
}));

// Mock system-monitor
jest.mock('../../../src/ui-modules/system-monitor.js', () => ({
    getCpuUsagePercent: jest.fn(() => '25.0%')
}));

import { existsSync, readFileSync } from 'fs';
import { handleGetSystem, handleDownloadTodayLog, handleClearTodayLog, handleHealthCheck, handleGetServiceMode, handleRestartService } from '../../../src/ui-modules/system-api.js';
import logger from '../../../src/utils/logger.js';
import { broadcastEvent } from '../../../src/ui-modules/event-broadcast.js';

describe('system-api', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = {};
        mockRes = {
            writeHead: jest.fn(),
            end: jest.fn()
        };
    });

    describe('handleHealthCheck', () => {
        it('should return ok status', async () => {
            const result = await handleHealthCheck(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"status":"ok"'));
        });
    });

    describe('handleGetServiceMode', () => {
        it('should return standalone mode when not worker', async () => {
            delete process.env.IS_WORKER_PROCESS;
            const result = await handleGetServiceMode(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"mode":"standalone"'));
        });

        it('should return worker mode when IS_WORKER_PROCESS is true', async () => {
            process.env.IS_WORKER_PROCESS = 'true';
            process.env.MASTER_PORT = '3100';
            const result = await handleGetServiceMode(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"mode":"worker"'));
            delete process.env.IS_WORKER_PROCESS;
            delete process.env.MASTER_PORT;
        });
    });

    describe('handleGetSystem', () => {
        it('should return system info when VERSION file exists', async () => {
            existsSync.mockReturnValue(true);
            readFileSync.mockReturnValue('1.0.0');
            delete process.env.IS_WORKER_PROCESS;

            const result = await handleGetSystem(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"appVersion":"1.0.0"'));
        });

        it('should return unknown version when VERSION file does not exist', async () => {
            existsSync.mockReturnValue(false);
            delete process.env.IS_WORKER_PROCESS;

            const result = await handleGetSystem(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"appVersion":"unknown"'));
        });
    });

    describe('handleDownloadTodayLog', () => {
        it('should return 404 when log file does not exist', async () => {
            logger.currentLogFile = null;

            const result = await handleDownloadTodayLog(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
        });
    });

    describe('handleClearTodayLog', () => {
        it('should clear log and broadcast event', async () => {
            logger.clearTodayLog = jest.fn(() => true);

            const result = await handleClearTodayLog(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        });

        it('should return 500 when clear fails', async () => {
            logger.clearTodayLog = jest.fn(() => false);

            const result = await handleClearTodayLog(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
        });
    });

    describe('handleRestartService', () => {
        it('should return 400 in standalone mode without process.send', async () => {
            delete process.env.IS_WORKER_PROCESS;

            const result = await handleRestartService(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
            expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"mode":"standalone"'));
        });

        it('should handle worker mode restart request', async () => {
            process.env.IS_WORKER_PROCESS = 'true';

            const mockProcess = {
                send: jest.fn(),
                pid: 1234
            };

            // Mock the process global
            const originalProcess = global.process;
            global.process = { ...originalProcess, send: mockProcess.send, pid: 1234, env: { IS_WORKER_PROCESS: 'true' } };

            const result = await handleRestartService(mockReq, mockRes);
            expect(result).toBe(true);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });

            global.process = originalProcess;
            delete process.env.IS_WORKER_PROCESS;
        });
    });
});
