/**
 * WindowRateLimiter - 滑动窗口限流器测试
 * 
 * TDD: 先写测试，确认失败，再写实现
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WindowRateLimiter } from '../../src/scheduler/window-limiter.js';

describe('WindowRateLimiter', () => {
  describe('canSubmit', () => {
    it('初始状态可以提交', () => {
      const limiter = new WindowRateLimiter(5000, 3); // 5秒窗口，最多3个
      expect(limiter.canSubmit()).toBe(true);
    });

    it('达到配额后不能提交', () => {
      const limiter = new WindowRateLimiter(5000, 3);
      limiter.record();
      limiter.record();
      limiter.record();
      expect(limiter.canSubmit()).toBe(false);
    });

    it('未达配额时可以提交', () => {
      const limiter = new WindowRateLimiter(5000, 3);
      limiter.record();
      limiter.record();
      expect(limiter.canSubmit()).toBe(true);
    });
  });

  describe('record', () => {
    it('记录提交次数', () => {
      const limiter = new WindowRateLimiter(5000, 3);
      expect(limiter.countInWindow()).toBe(0);
      limiter.record();
      expect(limiter.countInWindow()).toBe(1);
      limiter.record();
      expect(limiter.countInWindow()).toBe(2);
    });
  });

  describe('窗口滑动', () => {
    it('旧记录滑出窗口后可以提交', async () => {
      const limiter = new WindowRateLimiter(100, 2); // 100ms 窗口
      limiter.record();
      limiter.record();
      expect(limiter.canSubmit()).toBe(false);
      
      // 等待窗口滑过
      await new Promise(r => setTimeout(r, 150));
      
      expect(limiter.canSubmit()).toBe(true);
    });

    it('countInWindow 正确计算窗口内数量', async () => {
      const limiter = new WindowRateLimiter(100, 5);
      limiter.record();
      limiter.record();
      limiter.record();
      expect(limiter.countInWindow()).toBe(3);
      
      await new Promise(r => setTimeout(r, 150));
      
      expect(limiter.countInWindow()).toBe(0);
    });
  });

  describe('waitForSlot', () => {
    it('有配额时立即返回', async () => {
      const limiter = new WindowRateLimiter(5000, 3);
      const start = Date.now();
      await limiter.waitForSlot();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it('无配额时等待直到有配额', async () => {
      const limiter = new WindowRateLimiter(100, 1); // 100ms 窗口，1个配额
      limiter.record(); // 用掉配额
      
      const start = Date.now();
      await limiter.waitForSlot();
      const elapsed = Date.now() - start;
      
      // 应该等待了约 100ms
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(200);
    });

    it('超时抛出错误', async () => {
      const limiter = new WindowRateLimiter(10000, 1); // 10秒窗口
      limiter.record();
      
      await expect(limiter.waitForSlot(100)).rejects.toThrow(/timeout/i);
    });
  });

  describe('禁用状态', () => {
    it('windowMs=0 时不限流', () => {
      const limiter = new WindowRateLimiter(0, 0); // 禁用
      expect(limiter.canSubmit()).toBe(true);
      limiter.record();
      limiter.record();
      limiter.record();
      expect(limiter.canSubmit()).toBe(true); // 始终可以
    });

    it('maxTasks=0 时不限流', () => {
      const limiter = new WindowRateLimiter(5000, 0); // 禁用
      expect(limiter.canSubmit()).toBe(true);
    });
  });
});
