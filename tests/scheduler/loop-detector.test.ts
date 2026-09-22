import { describe, it, expect } from 'vitest';
import { LoopDetector } from '../../src/scheduler/loop-detector.js';

describe('LoopDetector', () => {
  it('should start with empty state', () => {
    const detector = new LoopDetector();
    const result = detector.record('bash', 'ls -la');
    expect(result.consecutiveCount).toBe(1);
    expect(result.isLoop).toBe(false);
    expect(result.isWarning).toBe(false);
    expect(result.isTerminated).toBe(false);
  });

  it('should detect consecutive same tool calls', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'ls -la');
    const result2 = detector.record('bash', 'ls -la');
    expect(result2.consecutiveCount).toBe(2);
    expect(result2.isLoop).toBe(false);
    
    const result3 = detector.record('bash', 'ls -la');
    expect(result3.consecutiveCount).toBe(3);
    expect(result3.isLoop).toBe(true);
    expect(result3.isWarning).toBe(true);
    expect(result3.isTerminated).toBe(false);
  });

  it('should trigger warning at threshold 3', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'python3 -c "count words"');
    detector.record('bash', 'python3 -c "count words"');
    const result = detector.record('bash', 'python3 -c "count words"');
    
    expect(result.consecutiveCount).toBe(3);
    expect(result.isWarning).toBe(true);
    expect(result.isTerminated).toBe(false);
  });

  it('should trigger termination at threshold 5', () => {
    const detector = new LoopDetector();
    
    for (let i = 0; i < 4; i++) {
      detector.record('bash', 'python3 -c "count words"');
    }
    const result = detector.record('bash', 'python3 -c "count words"');
    
    expect(result.consecutiveCount).toBe(5);
    expect(result.isWarning).toBe(false); // 只在第 3 次时警告
    expect(result.isTerminated).toBe(true);
  });

  it('should reset count when tool changes', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'ls -la');
    detector.record('bash', 'ls -la');
    const result = detector.record('read', '/path/to/file');
    
    expect(result.consecutiveCount).toBe(1);
    expect(result.isLoop).toBe(false);
  });

  it('should reset count when command changes', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'ls -la');
    detector.record('bash', 'ls -la');
    const result = detector.record('bash', 'cat file.txt');
    
    expect(result.consecutiveCount).toBe(1);
    expect(result.isLoop).toBe(false);
  });

  it('should only compare first 100 characters of command', () => {
    const detector = new LoopDetector();
    
    const longCommand1 = 'python3 -c "' + 'x'.repeat(150) + '"';
    const longCommand2 = 'python3 -c "' + 'x'.repeat(150) + 'y"';
    
    detector.record('bash', longCommand1);
    detector.record('bash', longCommand1);
    const result = detector.record('bash', longCommand2);
    
    // 前 100 字符相同，应该被检测为循环
    expect(result.consecutiveCount).toBe(3);
    expect(result.isLoop).toBe(true);
  });

  it('should handle commands without prefix', () => {
    const detector = new LoopDetector();
    
    detector.record('bash');
    detector.record('bash');
    const result = detector.record('bash');
    
    expect(result.consecutiveCount).toBe(3);
    expect(result.isLoop).toBe(true);
  });

  it('should reset state', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'ls -la');
    detector.record('bash', 'ls -la');
    detector.reset();
    
    const result = detector.record('bash', 'ls -la');
    expect(result.consecutiveCount).toBe(1);
  });

  it('should keep only last 5 calls in history', () => {
    const detector = new LoopDetector();
    
    // 记录 6 次不同的调用
    detector.record('bash', 'cmd1');
    detector.record('bash', 'cmd2');
    detector.record('bash', 'cmd3');
    detector.record('bash', 'cmd4');
    detector.record('bash', 'cmd5');
    detector.record('bash', 'cmd6');
    
    // 现在再记录 cmd1，不应该被检测为循环
    const result = detector.record('bash', 'cmd1');
    expect(result.consecutiveCount).toBe(1);
  });

  it('should detect loop even after different calls', () => {
    const detector = new LoopDetector();
    
    detector.record('bash', 'cmd1');
    detector.record('bash', 'cmd2');
    detector.record('bash', 'cmd3');
    detector.record('bash', 'ls -la');
    detector.record('bash', 'ls -la');
    const result = detector.record('bash', 'ls -la');
    
    expect(result.consecutiveCount).toBe(3);
    expect(result.isLoop).toBe(true);
  });
});
