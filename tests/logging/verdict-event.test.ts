/**
 * VC-2: diag.verdict 事件测试
 * 
 * 验证 verdict 被修正时发射 diag.verdict 事件
 * 
 * @see specs/verdict-consistency.md VC-2
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from '../../src/logging/event-bus.js';
import type { DiagVerdictEvent } from '../../src/logging/types.js';

describe('VC-2: diag.verdict 事件', () => {
  let eventBus: EventBus;
  let events: DiagVerdictEvent[];

  beforeEach(() => {
    eventBus = new EventBus();
    events = [];
    eventBus.subscribe('diag.verdict', (e) => events.push(e));
  });

  describe('事件发射', () => {
    it('verdict 被修正时发射 diag.verdict 事件', () => {
      // When: verdict 从 accept 被修正为 revise
      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch001',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: '审阅报告中发现字数问题',
        timestamp: new Date().toISOString(),
      });

      // Then: 收到事件
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('diag.verdict');
      expect(events[0].chapterId).toBe('ch001');
      expect(events[0].round).toBe(1);
      expect(events[0].originalVerdict).toBe('accept');
      expect(events[0].correctedVerdict).toBe('revise');
      expect(events[0].reason).toContain('字数');
    });

    it('事件包含 round 信息', () => {
      // When: round=3 时 verdict 被修正
      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch002',
        round: 3,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: '独立验证发现字数超标',
        timestamp: new Date().toISOString(),
      });

      // Then: round 正确
      expect(events[0].round).toBe(3);
    });

    it('事件包含修正原因', () => {
      // When: 修正原因包含多个因素
      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch003',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: '审阅报告中发现字数问题; 独立验证发现字数超标',
        timestamp: new Date().toISOString(),
      });

      // Then: reason 包含所有因素
      expect(events[0].reason).toContain('审阅报告');
      expect(events[0].reason).toContain('独立验证');
    });

    it('事件包含 timestamp', () => {
      // When: 发射事件
      const now = new Date().toISOString();
      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch004',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: 'test',
        timestamp: now,
      });

      // Then: timestamp 存在
      expect(events[0].timestamp).toBe(now);
    });

    it('可选字段 issuesCount 和 wordCountIssues', () => {
      // When: 事件包含可选字段
      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch005',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: 'test',
        issuesCount: 3,
        wordCountIssues: 2,
        timestamp: new Date().toISOString(),
      });

      // Then: 可选字段正确
      expect(events[0].issuesCount).toBe(3);
      expect(events[0].wordCountIssues).toBe(2);
    });
  });

  describe('事件订阅', () => {
    it('多个订阅者都能收到事件', () => {
      const events2: DiagVerdictEvent[] = [];
      eventBus.subscribe('diag.verdict', (e) => events2.push(e));

      eventBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch006',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: 'test',
        timestamp: new Date().toISOString(),
      });

      expect(events.length).toBe(1);
      expect(events2.length).toBe(1);
    });

    it('取消订阅后不再收到事件', () => {
      // 创建新的 eventBus 避免 beforeEach 的订阅干扰
      const localBus = new EventBus();
      const localEvents: DiagVerdictEvent[] = [];
      const unsubscribe = localBus.subscribe('diag.verdict', (e) => localEvents.push(e));
      
      // 第一次发射
      localBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch007',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: 'test',
        timestamp: new Date().toISOString(),
      });
      expect(localEvents.length).toBe(1);

      // 取消订阅
      unsubscribe();

      // 第二次发射
      localBus.emit({
        type: 'diag.verdict',
        chapterId: 'ch008',
        round: 1,
        originalVerdict: 'accept',
        correctedVerdict: 'revise',
        reason: 'test',
        timestamp: new Date().toISOString(),
      });
      
      // 不应收到第二次事件
      expect(localEvents.length).toBe(1);
    });
  });
});
