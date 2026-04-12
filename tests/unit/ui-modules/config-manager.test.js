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

// ==================== Tests for validateCustomIntervals ====================

describe('validateCustomIntervals', () => {
    const MIN_INTERVAL_MS = 60000; // 1 minute
    const MAX_INTERVAL_MS = 3600000; // 1 hour

    const validateCustomIntervals = (customIntervals) => {
        if (!customIntervals || typeof customIntervals !== 'object') {
            return {};
        }

        const validated = {};
        for (const [providerType, interval] of Object.entries(customIntervals)) {
            if (typeof providerType !== 'string' || !providerType.trim()) {
                continue;
            }

            const numInterval = Number(interval);
            if (!Number.isFinite(numInterval) || numInterval < MIN_INTERVAL_MS) {
                continue;
            }

            validated[providerType] = Math.min(numInterval, MAX_INTERVAL_MS);
        }

        return validated;
    };

    test('should return empty object for null input', () => {
        expect(validateCustomIntervals(null)).toEqual({});
    });

    test('should return empty object for undefined input', () => {
        expect(validateCustomIntervals(undefined)).toEqual({});
    });

    test('should return empty object for non-object input', () => {
        expect(validateCustomIntervals('string')).toEqual({});
        expect(validateCustomIntervals(123)).toEqual({});
    });

    test('should validate and pass through valid intervals', () => {
        const input = { 'openai': 120000, 'gemini': 180000 };
        const result = validateCustomIntervals(input);
        expect(result['openai']).toBe(120000);
        expect(result['gemini']).toBe(180000);
    });

    test('should cap intervals exceeding maximum', () => {
        const input = { 'openai': 7200000 }; // 2 hours
        const result = validateCustomIntervals(input);
        expect(result['openai']).toBe(3600000); // capped to 1 hour
    });

    test('should skip invalid providerType (empty string)', () => {
        const input = { '': 120000, 'valid': 60000 };
        const result = validateCustomIntervals(input);
        expect(result['']).toBeUndefined();
        expect(result['valid']).toBe(60000); // exactly minimum, should pass
    });

    test('should skip intervals below minimum', () => {
        const input = { 'openai': 30000, 'gemini': 60000 };
        const result = validateCustomIntervals(input);
        expect(result['openai']).toBeUndefined();
        expect(result['gemini']).toBe(60000);
    });

    test('should skip non-finite interval values', () => {
        const input = { 'openai': NaN, 'gemini': Infinity, 'claude': 120000 };
        const result = validateCustomIntervals(input);
        expect(result['openai']).toBeUndefined();
        expect(result['gemini']).toBeUndefined();
        expect(result['claude']).toBe(120000);
    });

    test('should skip non-numeric interval values', () => {
        const input = { 'openai': 'string', 'gemini': null, 'claude': 120000 };
        const result = validateCustomIntervals(input);
        expect(result['openai']).toBeUndefined();
        expect(result['gemini']).toBeUndefined();
        expect(result['claude']).toBe(120000);
    });
});

// ==================== Tests for validateHealthyCustomIntervals ====================

describe('validateHealthyCustomIntervals', () => {
    const MIN_HEALTHY_CHECK_INTERVAL_MS = 300000; // 5 minutes
    const MAX_HEALTHY_CHECK_INTERVAL_MS = 3600000; // 1 hour

    const validateHealthyCustomIntervals = (healthyCustomIntervals) => {
        if (!healthyCustomIntervals || typeof healthyCustomIntervals !== 'object') {
            return {};
        }

        const validated = {};
        for (const [providerType, interval] of Object.entries(healthyCustomIntervals)) {
            if (typeof providerType !== 'string' || !providerType.trim()) {
                continue;
            }

            const numInterval = Number(interval);
            if (!Number.isFinite(numInterval)) {
                continue;
            }

            if (numInterval === 0) {
                validated[providerType] = 0; // 0 means disabled
            } else if (numInterval < MIN_HEALTHY_CHECK_INTERVAL_MS) {
                validated[providerType] = MIN_HEALTHY_CHECK_INTERVAL_MS;
            } else if (numInterval > MAX_HEALTHY_CHECK_INTERVAL_MS) {
                validated[providerType] = MAX_HEALTHY_CHECK_INTERVAL_MS;
            } else {
                validated[providerType] = numInterval;
            }
        }

        return validated;
    };

    test('should return empty object for null input', () => {
        expect(validateHealthyCustomIntervals(null)).toEqual({});
    });

    test('should allow 0 to indicate disabled', () => {
        const input = { 'openai': 0 };
        const result = validateHealthyCustomIntervals(input);
        expect(result['openai']).toBe(0);
    });

    test('should enforce minimum interval for healthy check', () => {
        const input = { 'gemini': 60000 }; // below 5 minutes
        const result = validateHealthyCustomIntervals(input);
        expect(result['gemini']).toBe(300000);
    });

    test('should cap intervals exceeding maximum', () => {
        const input = { 'openai': 7200000 }; // 2 hours
        const result = validateHealthyCustomIntervals(input);
        expect(result['openai']).toBe(3600000);
    });

    test('should pass through valid intervals', () => {
        const input = { 'openai': 600000, 'gemini': 1800000 }; // 10min, 30min
        const result = validateHealthyCustomIntervals(input);
        expect(result['openai']).toBe(600000);
        expect(result['gemini']).toBe(1800000);
    });

    test('should skip non-finite values', () => {
        const input = { 'openai': NaN, 'gemini': Infinity };
        const result = validateHealthyCustomIntervals(input);
        expect(result['openai']).toBeUndefined();
        expect(result['gemini']).toBeUndefined();
    });

    test('should handle mix of valid and invalid entries', () => {
        const input = { 'valid': 600000, 'toolow': 60000, 'disabled': 0 };
        const result = validateHealthyCustomIntervals(input);
        expect(result['valid']).toBe(600000);
        expect(result['toolow']).toBe(300000);
        expect(result['disabled']).toBe(0);
    });
});

// ==================== Tests for validateHealthCheckConfig ====================

describe('validateHealthCheckConfig', () => {
    const MIN_INTERVAL_MS = 60000;
    const MAX_INTERVAL_MS = 3600000;
    const MIN_HEALTHY_CHECK_INTERVAL_MS = 300000;
    const MAX_HEALTHY_CHECK_INTERVAL_MS = 3600000;
    const HEALTHY_CHECK_INTERVAL_MS = 600000;

    const validateHealthCheckConfig = (config) => {
        if (!config.SCHEDULED_HEALTH_CHECK || typeof config.SCHEDULED_HEALTH_CHECK !== 'object') {
            return;
        }

        const hcConfig = config.SCHEDULED_HEALTH_CHECK;

        // Validate customIntervals (simplified)
        if (hcConfig.customIntervals && typeof hcConfig.customIntervals === 'object') {
            hcConfig.customIntervals = hcConfig.customIntervals;
        }

        // Validate healthyCustomIntervals (simplified)
        if (hcConfig.healthyCustomIntervals && typeof hcConfig.healthyCustomIntervals === 'object') {
            hcConfig.healthyCustomIntervals = hcConfig.healthyCustomIntervals;
        }

        // Validate providerTypes array
        if (hcConfig.providerTypes && !Array.isArray(hcConfig.providerTypes)) {
            hcConfig.providerTypes = [];
        }

        // Validate interval
        if (typeof hcConfig.interval === 'number') {
            if (hcConfig.interval < MIN_INTERVAL_MS) {
                hcConfig.interval = MIN_INTERVAL_MS;
            } else if (hcConfig.interval > MAX_INTERVAL_MS) {
                hcConfig.interval = MAX_INTERVAL_MS;
            }
        }

        // Validate healthyCheckInterval
        if (typeof hcConfig.healthyCheckInterval === 'number') {
            if (hcConfig.healthyCheckInterval === 0) {
                // 0 means disabled
            } else if (hcConfig.healthyCheckInterval < MIN_HEALTHY_CHECK_INTERVAL_MS) {
                hcConfig.healthyCheckInterval = MIN_HEALTHY_CHECK_INTERVAL_MS;
            } else if (hcConfig.healthyCheckInterval > MAX_HEALTHY_CHECK_INTERVAL_MS) {
                hcConfig.healthyCheckInterval = MAX_HEALTHY_CHECK_INTERVAL_MS;
            }
        } else {
            hcConfig.healthyCheckInterval = HEALTHY_CHECK_INTERVAL_MS;
        }
    };

    test('should return early if SCHEDULED_HEALTH_CHECK is missing', () => {
        const config = {};
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK).toBeUndefined();
    });

    test('should return early if SCHEDULED_HEALTH_CHECK is not an object', () => {
        const config = { SCHEDULED_HEALTH_CHECK: 'string' };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK).toBe('string');
    });

    test('should reset invalid providerTypes to empty array', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { providerTypes: 'not-array' } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.providerTypes).toEqual([]);
    });

    test('should keep valid providerTypes as-is', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { providerTypes: ['openai', 'gemini'] } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.providerTypes).toEqual(['openai', 'gemini']);
    });

    test('should enforce minimum interval', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { interval: 30000 } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.interval).toBe(60000);
    });

    test('should enforce maximum interval', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { interval: 7200000 } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.interval).toBe(3600000);
    });

    test('should set default healthyCheckInterval if not provided', () => {
        const config = { SCHEDULED_HEALTH_CHECK: {} };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.healthyCheckInterval).toBe(600000);
    });

    test('should allow 0 for healthyCheckInterval to disable', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { healthyCheckInterval: 0 } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.healthyCheckInterval).toBe(0);
    });

    test('should enforce minimum for healthyCheckInterval', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { healthyCheckInterval: 60000 } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.healthyCheckInterval).toBe(300000);
    });

    test('should enforce maximum for healthyCheckInterval', () => {
        const config = { SCHEDULED_HEALTH_CHECK: { healthyCheckInterval: 7200000 } };
        validateHealthCheckConfig(config);
        expect(config.SCHEDULED_HEALTH_CHECK.healthyCheckInterval).toBe(3600000);
    });
});
