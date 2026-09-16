import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryEngine } from '../../src/scheduler/retry.js';
import type { RetryConfig } from '../../src/scheduler/retry.js';

describe('RetryEngine', () => {
  const defaultConfig: RetryConfig = {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
    maxRetries: 3,
  };

  describe('shouldRetry', () => {
    it('returns true when attempts < maxRetries', () => {
      const engine = new RetryEngine(defaultConfig);
      expect(engine.shouldRetry(0)).toBe(true);
      expect(engine.shouldRetry(1)).toBe(true);
      expect(engine.shouldRetry(2)).toBe(true);
    });

    it('returns false when attempts >= maxRetries', () => {
      const engine = new RetryEngine(defaultConfig);
      expect(engine.shouldRetry(3)).toBe(false);
      expect(engine.shouldRetry(4)).toBe(false);
    });

    it('returns false when maxRetries is 0', () => {
      const engine = new RetryEngine({ ...defaultConfig, maxRetries: 0 });
      expect(engine.shouldRetry(0)).toBe(false);
    });

    it('returns true for any attempts when maxRetries is Infinity', () => {
      const engine = new RetryEngine({ ...defaultConfig, maxRetries: Infinity });
      expect(engine.shouldRetry(0)).toBe(true);
      expect(engine.shouldRetry(100)).toBe(true);
      expect(engine.shouldRetry(1000)).toBe(true);
    });
  });

  describe('getDelay', () => {
    it('returns baseDelay for attempt 0', () => {
      const engine = new RetryEngine(defaultConfig);
      expect(engine.getDelay(0)).toBe(1000);
    });

    it('applies exponential backoff', () => {
      const engine = new RetryEngine(defaultConfig);
      expect(engine.getDelay(0)).toBe(1000);
      expect(engine.getDelay(1)).toBe(2000);
      expect(engine.getDelay(2)).toBe(4000);
      expect(engine.getDelay(3)).toBe(8000);
    });

    it('caps at maxDelay', () => {
      const engine = new RetryEngine(defaultConfig);
      expect(engine.getDelay(10)).toBe(10000);
      expect(engine.getDelay(100)).toBe(10000);
    });

    it('handles custom multiplier', () => {
      const engine = new RetryEngine({ ...defaultConfig, multiplier: 3 });
      expect(engine.getDelay(0)).toBe(1000);
      expect(engine.getDelay(1)).toBe(3000);
      expect(engine.getDelay(2)).toBe(9000);
    });
  });

  describe('getDelay with jitter', () => {
    it('adds jitter when enabled', () => {
      const engine = new RetryEngine({ ...defaultConfig, jitter: true });
      const delay = engine.getDelay(0);
      // With jitter, delay should be between 500 and 1500 (1000 ± 50%)
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1500);
    });

    it('does not add jitter when disabled', () => {
      const engine = new RetryEngine({ ...defaultConfig, jitter: false });
      expect(engine.getDelay(0)).toBe(1000);
      expect(engine.getDelay(0)).toBe(1000);
    });
  });

  describe('wait', () => {
    it('waits for the calculated delay', async () => {
      const engine = new RetryEngine({ ...defaultConfig, baseDelayMs: 50 });
      const start = Date.now();
      await engine.wait(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(200);
    });
  });
});
