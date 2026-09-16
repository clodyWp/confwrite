import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucket } from '../../src/scheduler/token-bucket.js';

describe('TokenBucket', () => {
  let bucket: TokenBucket;

  beforeEach(() => {
    bucket = new TokenBucket({
      capacity: 10,
      refillRate: 1, // 1 token per second
    });
  });

  describe('constructor', () => {
    it('initializes with full capacity', () => {
      expect(bucket.available()).toBe(10);
    });

    it('accepts custom initial tokens', () => {
      const b = new TokenBucket({ capacity: 10, refillRate: 1, initialTokens: 5 });
      expect(b.available()).toBe(5);
    });
  });

  describe('consume', () => {
    it('consumes tokens when available', () => {
      expect(bucket.consume(3)).toBe(true);
      expect(bucket.available()).toBe(7);
    });

    it('returns false when not enough tokens', () => {
      expect(bucket.consume(11)).toBe(false);
      expect(bucket.available()).toBe(10);
    });

    it('consumes exactly the requested amount', () => {
      bucket.consume(5);
      expect(bucket.available()).toBe(5);
      bucket.consume(5);
      expect(bucket.available()).toBe(0);
    });

    it('does not consume partial tokens', () => {
      bucket.consume(9);
      expect(bucket.available()).toBe(1);
      expect(bucket.consume(2)).toBe(false);
      expect(bucket.available()).toBe(1);
    });
  });

  describe('refill', () => {
    it('refills tokens based on elapsed time', () => {
      bucket.consume(10);
      expect(bucket.available()).toBe(0);

      // Simulate 5 seconds passing
      bucket.refill(Date.now() + 5000);
      expect(bucket.available()).toBe(5);
    });

    it('does not exceed capacity', () => {
      bucket.consume(5);
      expect(bucket.available()).toBe(5);

      // Simulate 100 seconds passing
      bucket.refill(Date.now() + 100000);
      expect(bucket.available()).toBe(10); // capped at capacity
    });

    it('handles fractional tokens correctly', () => {
      const b = new TokenBucket({ capacity: 10, refillRate: 0.5 }); // 0.5 tokens/sec
      b.consume(10);

      // 2 seconds = 1 token
      b.refill(Date.now() + 2000);
      expect(b.available()).toBe(1);
    });
  });

  describe('waitForToken', () => {
    it('returns immediately when token is available', async () => {
      const start = Date.now();
      await bucket.waitForToken(1);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(bucket.available()).toBe(9);
    });

    it('waits for token when bucket is empty', async () => {
      bucket.consume(10);
      expect(bucket.available()).toBe(0);

      const start = Date.now();
      await bucket.waitForToken(1, 2000); // 2s timeout
      const elapsed = Date.now() - start;
      
      // Should wait ~1 second for 1 token at rate 1/sec
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThan(1500);
    });

    it('throws on timeout when tokens never available', async () => {
      bucket.consume(10);
      
      await expect(
        bucket.waitForToken(5, 500) // Need 5 tokens, only 500ms timeout
      ).rejects.toThrow('timeout');
    });
  });

  describe('serialize/deserialize', () => {
    it('serializes state correctly', () => {
      bucket.consume(3);
      const state = bucket.serialize();
      
      expect(state.tokens).toBeCloseTo(7, 0); // timing may add fractional refill
      expect(state.capacity).toBe(10);
      expect(state.refillRate).toBe(1);
      expect(state.lastRefillAt).toBeDefined();
    });

    it('deserializes state correctly', () => {
      const state = {
        tokens: 5,
        capacity: 10,
        refillRate: 1,
        lastRefillAt: Date.now(), // 当前时间，不会触发 refill
      };
      
      const b = TokenBucket.deserialize(state);
      expect(b.available()).toBe(5);
    });

    it('round-trips correctly', () => {
      bucket.consume(4);
      const state = bucket.serialize();
      const restored = TokenBucket.deserialize(state);
      
      expect(restored.available()).toBe(bucket.available());
    });
  });
});
