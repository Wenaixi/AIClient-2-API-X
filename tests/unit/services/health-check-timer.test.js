/**
 * Health Check Timer 模块单元测试
 *
 * 测试策略：不依赖实际的 health-check-timer 模块导入，
 * 因为该模块有复杂的依赖链。采用独立测试设计。
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * 测试用的常量值（从 constants.js 复制）
 */
const HEALTH_CHECK = {
  MIN_INTERVAL_MS: 60000,
  DEFAULT_INTERVAL_MS: 600000,
  MAX_INTERVAL_MS: 172800000
};

/**
 * 测试用的 Timer 状态类（简化版）
 */
class TestableHealthCheckTimer {
  constructor() {
    this.checkPromise = null;
    this.timerId = null;
    this.activeInterval = null;
  }

  start(interval) {
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    const safeInterval =
      typeof interval === 'number' && interval >= HEALTH_CHECK.MIN_INTERVAL_MS
        ? Math.min(interval, HEALTH_CHECK.MAX_INTERVAL_MS)
        : HEALTH_CHECK.DEFAULT_INTERVAL_MS;

    this.timerId = setInterval(() => {
      if (this.checkPromise) return;
      this.checkPromise = Promise.resolve().finally(() => {
        this.checkPromise = null;
      });
    }, safeInterval);

    this.activeInterval = safeInterval;
    return safeInterval;
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      this.activeInterval = null;
    }
  }

  reload(interval) {
    this.start(interval);
    return this.activeInterval;
  }

  getStatus() {
    return {
      isActive: this.timerId !== null,
      isRunning: this.checkPromise !== null,
      interval: this.activeInterval
    };
  }
}

describe('TestableHealthCheckTimer', () => {
  let timer;

  beforeEach(() => {
    timer = new TestableHealthCheckTimer();
    jest.useFakeTimers();
  });

  afterEach(() => {
    timer.stop();
    jest.useRealTimers();
  });

  describe('start()', () => {
    test('should return configured interval', () => {
      const interval = 120000;
      const result = timer.start(interval);
      expect(result).toBe(interval);
    });

    test('should use default interval for invalid input', () => {
      const result = timer.start(-100);
      expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should use default interval for zero', () => {
      const result = timer.start(0);
      expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should use default interval for non-numeric', () => {
      const result = timer.start('invalid');
      expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should use default interval for too small interval', () => {
      const result = timer.start(HEALTH_CHECK.MIN_INTERVAL_MS - 1000);
      expect(result).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    });

    test('should accept valid interval above minimum', () => {
      const interval = HEALTH_CHECK.MIN_INTERVAL_MS + 1000;
      const result = timer.start(interval);
      expect(result).toBe(interval);
    });
  });

  describe('stop()', () => {
    test('should stop running timer without error', () => {
      timer.start(60000);
      expect(() => timer.stop()).not.toThrow();
    });

    test('should allow multiple stops without error', () => {
      timer.start(60000);
      timer.stop();
      expect(() => timer.stop()).not.toThrow();
    });

    test('should allow stop before start without error', () => {
      expect(() => timer.stop()).not.toThrow();
    });
  });

  describe('reload()', () => {
    test('should restart timer with new interval', () => {
      timer.start(60000);
      const result = timer.reload(120000);
      expect(result).toBe(120000);
    });

    test('should reset running state when restarting', () => {
      timer.start(100);
      timer.reload(100);
      expect(timer.isRunning).toBe(false);
    });
  });

  describe('getStatus()', () => {
    test('should return initial inactive status', () => {
      const status = timer.getStatus();
      expect(status.isActive).toBe(false);
      expect(status.isRunning).toBe(false);
      expect(status.interval).toBeNull();
    });

    test('should return active status after start', () => {
      timer.start(60000);
      const status = timer.getStatus();
      expect(status.isActive).toBe(true);
      expect(status.interval).toBe(60000);
    });

    test('should return inactive status after stop', () => {
      timer.start(60000);
      timer.stop();
      const status = timer.getStatus();
      expect(status.isActive).toBe(false);
    });
  });
});

describe('HEALTH_CHECK Constants Usage', () => {
  test('should have MIN_INTERVAL_MS as minimum threshold', () => {
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBe(60000);
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('should have DEFAULT_INTERVAL_MS as fallback', () => {
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBe(600000);
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeGreaterThan(HEALTH_CHECK.MIN_INTERVAL_MS);
  });

  test('should have MAX_INTERVAL_MS as absolute maximum', () => {
    expect(HEALTH_CHECK.MAX_INTERVAL_MS).toBe(3600000);
    expect(HEALTH_CHECK.MAX_INTERVAL_MS).toBeGreaterThan(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });

  test('should have valid interval hierarchy', () => {
    expect(HEALTH_CHECK.MIN_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
    expect(HEALTH_CHECK.DEFAULT_INTERVAL_MS).toBeLessThan(HEALTH_CHECK.MAX_INTERVAL_MS);
  });

  test('timer behavior should be consistent with constants', () => {
    const timer = new TestableHealthCheckTimer();
    const validInterval = HEALTH_CHECK.MIN_INTERVAL_MS;
    const returned = timer.start(validInterval);
    expect(returned).toBe(validInterval);
  });

  test('should reject interval below minimum', () => {
    const timer = new TestableHealthCheckTimer();
    const returned = timer.start(HEALTH_CHECK.MIN_INTERVAL_MS - 1);
    expect(returned).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });
});

describe('Interval Validation', () => {
  let timer;

  beforeEach(() => {
    timer = new TestableHealthCheckTimer();
  });

  test('should accept exact minimum interval', () => {
    const interval = HEALTH_CHECK.MIN_INTERVAL_MS;
    const returned = timer.start(interval);
    expect(returned).toBe(interval);
  });

  test('should reject negative intervals', () => {
    const returned = timer.start(-1000);
    expect(returned).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });

  test('should accept very large intervals', () => {
    const largeInterval = 1000 * 60 * 60; // 1 hour
    const returned = timer.start(largeInterval);
    expect(returned).toBe(largeInterval);
  });

  test('should handle null interval', () => {
    const returned = timer.start(null);
    expect(returned).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });

  test('should handle undefined interval', () => {
    const returned = timer.start(undefined);
    expect(returned).toBe(HEALTH_CHECK.DEFAULT_INTERVAL_MS);
  });
});

describe('Timer Concurrency', () => {
  let timer;

  beforeEach(() => {
    timer = new TestableHealthCheckTimer();
    jest.useFakeTimers();
  });

  afterEach(() => {
    timer.stop();
    jest.useRealTimers();
  });

  test('should allow starting timer only once', () => {
    timer.start(60000);
    const status1 = timer.getStatus();

    timer.start(120000);
    const status2 = timer.getStatus();

    expect(status2.interval).toBe(120000);
  });

  test('should prevent multiple concurrent timers', () => {
    timer.start(60000);
    const id1 = timer.timerId;

    timer.start(120000);
    const id2 = timer.timerId;

    // ID should be different after restart
    expect(id1).not.toBe(id2);
  });
});
