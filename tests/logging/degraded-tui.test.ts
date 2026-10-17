import { describe, it, expect } from 'vitest';
import { Logger } from '../../src/logging/logger.js';

/**
 * SM-22/SM-23: WriteLoopResult.degraded 降级可见
 * 
 * 当 WriteLoopResult.degraded.length > 0 时，TUI 必须打印降级警告，
 * 让用户知道哪些章节是降级完成（非实际审阅通过）。
 */
describe('Degraded TUI Warning (SM-22, SM-23)', () => {
  describe('Logger.formatDegradedWarning', () => {
    it('should return warning message when degraded chapters exist', () => {
      const degraded = [
        { chapterId: 'ch001', reason: 'exceeded_max_rounds' },
        { chapterId: 'ch002', reason: 'consecutive_failures' },
      ];

      const result = Logger.formatDegradedWarning(degraded);

      expect(result).not.toBeNull();
      expect(result!.message).toContain('⚠️');
      expect(result!.message).toContain('2');
      expect(result!.message).toContain('ch001');
      expect(result!.message).toContain('ch002');
      expect(result!.message).toContain('降级完成');
      expect(result!.level).toBe('warning');
    });

    it('should return null when degraded array is empty', () => {
      const result = Logger.formatDegradedWarning([]);

      expect(result).toBeNull();
    });

    it('should include reason for each degraded chapter', () => {
      const degraded = [
        { chapterId: 'ch010', reason: 'exceeded_max_rounds' },
      ];

      const result = Logger.formatDegradedWarning(degraded);

      expect(result).not.toBeNull();
      expect(result!.message).toContain('exceeded_max_rounds');
    });

    it('should handle single degraded chapter', () => {
      const degraded = [
        { chapterId: 'ch005', reason: 'no_output' },
      ];

      const result = Logger.formatDegradedWarning(degraded);

      expect(result).not.toBeNull();
      expect(result!.message).toContain('1');
      expect(result!.message).toContain('ch005');
      expect(result!.message).toContain('no_output');
    });
  });
});
