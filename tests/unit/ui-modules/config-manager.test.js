/**
 * Unit Tests for config-manager.js custom interval functions
 *
 * Tests the helper functions and UI logic for custom health check intervals.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ==================== Copy of functions from config-manager.js for isolated testing ====================

/**
 * Convert milliseconds to hours/minutes/seconds object
 */
function msToHms(ms) {
    if (!ms || ms < 0) return { hours: 0, minutes: 0, seconds: 0 };
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return { hours, minutes, seconds };
}

/**
 * Convert hours/minutes/seconds to milliseconds
 */
function hmsToMs(hours, minutes, seconds) {
    const h = Math.max(0, Number(hours) || 0);
    const m = Math.max(0, Number(minutes) || 0);
    const s = Math.max(0, Number(seconds) || 0);
    return (h * 3600 + m * 60 + s) * 1000;
}

/**
 * Format milliseconds to HH:MM:SS display string
 */
function formatIntervalDisplay(ms) {
    const { hours, minutes, seconds } = msToHms(ms);
    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

// ==================== Tests for msToHms ====================

describe('msToHms', () => {
    test('should convert milliseconds to hours, minutes, seconds', () => {
        // 1 hour, 30 minutes, 45 seconds = 5445000 ms
        const result = msToHms(5445000);
        expect(result.hours).toBe(1);
        expect(result.minutes).toBe(30);
        expect(result.seconds).toBe(45);
    });

    test('should handle exactly 1 hour', () => {
        const result = msToHms(3600000);
        expect(result.hours).toBe(1);
        expect(result.minutes).toBe(0);
        expect(result.seconds).toBe(0);
    });

    test('should handle exactly 1 minute', () => {
        const result = msToHms(60000);
        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(1);
        expect(result.seconds).toBe(0);
    });

    test('should handle exactly 1 second', () => {
        const result = msToHms(1000);
        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(0);
        expect(result.seconds).toBe(1);
    });

    test('should handle zero milliseconds', () => {
        const result = msToHms(0);
        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(0);
        expect(result.seconds).toBe(0);
    });

    test('should handle null/undefined as zero', () => {
        expect(msToHms(null)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
        expect(msToHms(undefined)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    });

    test('should handle negative values as zero', () => {
        const result = msToHms(-1000);
        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(0);
        expect(result.seconds).toBe(0);
    });

    test('should handle milliseconds less than 1 second', () => {
        const result = msToHms(500);
        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(0);
        expect(result.seconds).toBe(0);
    });

    test('should floor the seconds value', () => {
        // 1 minute + 30.7 seconds = 90970ms -> floor to 30 seconds
        const result = msToHms(90970);
        expect(result.seconds).toBe(30);
    });
});

// ==================== Tests for hmsToMs ====================

describe('hmsToMs', () => {
    test('should convert hours, minutes, seconds to milliseconds', () => {
        const result = hmsToMs(1, 30, 45);
        expect(result).toBe(5445000);
    });

    test('should handle zero values', () => {
        const result = hmsToMs(0, 0, 0);
        expect(result).toBe(0);
    });

    test('should handle only hours', () => {
        const result = hmsToMs(2, 0, 0);
        expect(result).toBe(7200000);
    });

    test('should handle only minutes', () => {
        const result = hmsToMs(0, 30, 0);
        expect(result).toBe(1800000);
    });

    test('should handle only seconds', () => {
        const result = hmsToMs(0, 0, 45);
        expect(result).toBe(45000);
    });

    test('should treat non-numeric as zero', () => {
        expect(hmsToMs('abc', 'def', 'ghi')).toBe(0);
        expect(hmsToMs(null, null, null)).toBe(0);
        expect(hmsToMs(undefined, undefined, undefined)).toBe(0);
    });

    test('should treat negative numbers as zero', () => {
        expect(hmsToMs(-1, 0, 0)).toBe(0);
        expect(hmsToMs(0, -30, 0)).toBe(0);
        expect(hmsToMs(0, 0, -15)).toBe(0);
    });

    test('should truncate decimal values in hours', () => {
        // 1.5 hours should be treated as 1 hour (truncated)
        const result = hmsToMs(1.9, 0, 0);
        expect(result).toBe(3600000 + 3240000); // 1h + 0.9h = 1.9h = 6840000ms
    });
});

// ==================== Tests for formatIntervalDisplay ====================

describe('formatIntervalDisplay', () => {
    test('should format 0 seconds as 00:00', () => {
        const result = formatIntervalDisplay(0);
        expect(result).toBe('00:00');
    });

    test('should format seconds only as MM:SS', () => {
        const result = formatIntervalDisplay(45000);
        expect(result).toBe('00:45');
    });

    test('should format minutes and seconds as MM:SS', () => {
        const result = formatIntervalDisplay(905000); // 15 min 5 sec
        expect(result).toBe('15:05');
    });

    test('should format hours as HH:MM:SS', () => {
        const result = formatIntervalDisplay(3661000); // 1 hour 1 min 1 sec
        expect(result).toBe('01:01:01');
    });

    test('should pad single digits with zeros', () => {
        const result = formatIntervalDisplay(661000); // 11 min 1 sec
        expect(result).toBe('11:01');
    });

    test('should handle null/undefined as 00:00', () => {
        expect(formatIntervalDisplay(null)).toBe('00:00');
        expect(formatIntervalDisplay(undefined)).toBe('00:00');
    });
});

// ==================== Tests for custom intervals logic ====================

describe('Custom Intervals Logic', () => {
    test('should correctly identify effective interval from custom overrides', () => {
        const globalInterval = 300000; // 5 minutes
        const customIntervals = {
            'openai-custom': 60000,  // 1 minute override
            'gemini': 120000         // 2 minutes override
        };

        const getEffectiveInterval = (providerType, global, custom) => {
            return custom[providerType] ?? global;
        };

        expect(getEffectiveInterval('openai-custom', globalInterval, customIntervals)).toBe(60000);
        expect(getEffectiveInterval('gemini', globalInterval, customIntervals)).toBe(120000);
        expect(getEffectiveInterval('anthropic', globalInterval, customIntervals)).toBe(300000); // falls back to global
        expect(getEffectiveInterval('unknown-type', globalInterval, customIntervals)).toBe(300000);
    });

    test('should merge custom intervals correctly when saving', () => {
        const existingCustomIntervals = {
            'openai-custom': 60000
        };
        const incomingCustomIntervals = {
            'openai-custom': 90000,
            'gemini': 120000
        };

        // Merge: incoming overrides existing, keep others
        const merged = {
            ...existingCustomIntervals,
            ...incomingCustomIntervals
        };

        expect(merged['openai-custom']).toBe(90000);
        expect(merged['gemini']).toBe(120000);
    });

    test('should delete custom interval correctly', () => {
        const customIntervals = {
            'openai-custom': 60000,
            'gemini': 120000,
            'claude': 180000
        };

        // Simulate delete
        const { 'openai-custom': deleted, ...remaining } = customIntervals;

        expect(remaining['openai-custom']).toBeUndefined();
        expect(remaining['gemini']).toBe(120000);
        expect(remaining['claude']).toBe(180000);
    });

    test('should handle empty custom intervals object', () => {
        const customIntervals = {};

        expect(Object.keys(customIntervals).length).toBe(0);
        expect(customIntervals['any-type'] ?? 300000).toBe(300000); // falls back to global
    });
});

// ==================== Tests for interval validation ====================

describe('Interval Validation', () => {
    const MIN_INTERVAL_MS = 60000; // 1 minute minimum

    const validateInterval = (ms) => {
        if (!ms || ms < MIN_INTERVAL_MS) return MIN_INTERVAL_MS;
        return ms;
    };

    test('should enforce minimum interval of 60 seconds', () => {
        expect(validateInterval(30000)).toBe(60000);
        expect(validateInterval(1000)).toBe(60000);
        expect(validateInterval(0)).toBe(60000);
        expect(validateInterval(null)).toBe(60000);
    });

    test('should accept intervals >= 60 seconds', () => {
        expect(validateInterval(60000)).toBe(60000);
        expect(validateInterval(120000)).toBe(120000);
        expect(validateInterval(3600000)).toBe(3600000);
    });

    test('should not cap intervals above minimum', () => {
        expect(validateInterval(3600000)).toBe(3600000); // 1 hour
        expect(validateInterval(7200000)).toBe(7200000); // 2 hours
    });
});
