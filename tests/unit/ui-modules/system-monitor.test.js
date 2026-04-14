/**
 * System Monitor - Unit Tests
 * Tests src/ui-modules/system-monitor.js
 */

// Mock dependencies first
jest.mock('../../../src/utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Import after mocking
import { getSystemCpuUsagePercent, getProcessCpuUsagePercent, getCpuUsagePercent } from '../../../src/ui-modules/system-monitor.js';

describe('system-monitor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getSystemCpuUsagePercent', () => {
        it('should return CPU usage percentage string on first call', () => {
            const result = getSystemCpuUsagePercent();
            // First call should initialize and return a percentage
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });

        it('should return valid percentage string on subsequent calls', () => {
            // First call initializes previousCpuInfo
            getSystemCpuUsagePercent();
            // Second call should have previous data to compare
            const result = getSystemCpuUsagePercent();
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });
    });

    describe('getProcessCpuUsagePercent', () => {
        it('should return 0.0% when pid is not provided', () => {
            const result = getProcessCpuUsagePercent(null);
            expect(result).toBe('0.0%');
        });

        it('should return 0.0% when pid is undefined', () => {
            const result = getProcessCpuUsagePercent(undefined);
            expect(result).toBe('0.0%');
        });

        it('should return valid percentage string for current process', () => {
            const result = getProcessCpuUsagePercent(process.pid);
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });

        it('should return 0.0% for non-existent process', () => {
            const result = getProcessCpuUsagePercent(999999);
            expect(result).toBe('0.0%');
        });

        it('should handle zero pid gracefully', () => {
            const result = getProcessCpuUsagePercent(0);
            expect(result).toBe('0.0%');
        });
    });

    describe('getCpuUsagePercent', () => {
        it('should return system CPU when no pid provided', () => {
            const result = getCpuUsagePercent();
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });

        it('should return process CPU when pid provided', () => {
            const result = getCpuUsagePercent(process.pid);
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });

        it('should return system CPU when null pid provided', () => {
            const result = getCpuUsagePercent(null);
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d+\.\d+%$/);
        });
    });
});
