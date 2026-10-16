import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { EventBus } from '../../src/logging/event-bus.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';

/**
 * Bug 1 回归测试：Writer validation_failed 时状态设置
 * 
 * 症状（E2E v9）：
 * - Writer 任务因字数超标失败（validation_failed）
 * - 章节状态从 pending 直接跳到 reviewed（跳过了 written）
 * - Phase 4a → 4b → 4c → 4d 瞬间完成（审阅被跳过）
 * - review 目录为空，没有审阅报告
 * - Fixer 收到 "[审阅报告缺失]" 的提示
 * 
 * 根因：
 * - updateChapterStatus() 在 validation_failed 时设置 status = 'reviewed'
 * - Phase 4a 出口条件允许 reviewed 状态通过
 * 
 * 修复：
 * - validation_failed 时设置 status = 'written'
 * - Phase 4a 出口条件不包含 reviewed
 * 
 * Spec: SM-19 - reviewed 状态只应该在 Phase 4b（审阅）之后出现
 */
describe('Bug 1: Writer validation_failed 状态设置 (SM-19)', () => {
  let tempDir: string;
  let eventBus: EventBus;
  let orchestrator: WritingOrchestrator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-test-'));
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tempDir, 'review'), { recursive: true });
    
    eventBus = new EventBus();
    orchestrator = new WritingOrchestrator(eventBus);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestState(): ProjectState {
    return {
      currentPhase: '4a',
      status: 'writing',
      round: 1,
      chapters: {
        ch001: {
          id: 'ch001',
          title: '测试章节',
          status: 'pending',
          round: 1,
          attempt: 0,
          consecutiveFailures: 0,
          maxRounds: 5,
          type: 'functional',
          wordBudget: { min: 5200, max: 7800 },
          importance: 3,
          description: '测试描述',
        },
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  describe('Writer validation_failed 处理', () => {
    it('SM-19: validation_failed 时状态应该为 written，不是 reviewed', () => {
      // 准备
      const state = createTestState();

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: '写作完成',
      };

      // 创建输出文件（validation_failed 意味着有输出但验证失败）
      writeFileSync(
        join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'),
        '# 测试内容\n\n这是测试内容。'
      );

      // 执行：处理 validation_failed
      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');

      // 验证：状态应该是 written，不是 reviewed
      expect(state.chapters.ch001.status).toBe('written');
      expect(state.chapters.ch001.status).not.toBe('reviewed');
    });

    it('SM-19: execution_failed + 有输出时状态应该为 completed（Bug 32 不变）', () => {
      const state = createTestState();

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: '写作完成但有问题',
      };

      // 创建输出文件
      writeFileSync(
        join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'),
        '# 测试内容'
      );

      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'execution_failed');

      expect(state.chapters.ch001.status).toBe('completed');
    });

    it('SM-19: execution_failed + 无输出时状态应该为 pending（重试）', () => {
      const state = createTestState();

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: '执行失败',
      };

      // 不创建输出文件

      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'execution_failed');

      // 无输出时应该保持可重试状态（当前代码设为 reviewed，但应该改为 pending）
      // 注意：当前代码在 execution_failed + 无输出时也设为 reviewed，这是 Bug 1 的一部分
      // 修复后应该改为 pending
      expect(state.chapters.ch001.status).toBe('pending');
    });

    it('SM-19: 连续失败 5 次时状态应该为 failed', () => {
      const state = createTestState();
      state.chapters.ch001.consecutiveFailures = 4; // 即将达到 5 次
      state.chapters.ch001.round = 1;

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: '执行失败',
      };

      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'execution_failed');

      expect(state.chapters.ch001.status).toBe('failed');
    });

    it('SM-19/SM-21: validation_failed 达到 maxRounds 时应该为 completed（有输出）', () => {
      const state = createTestState();
      state.chapters.ch001.round = 4;
      state.chapters.ch001.consecutiveFailures = 4; // SM-21: 用 consecutiveFailures 守护，入口递增后变为 5

      const task: Task = {
        id: 'write-ch001-r4',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: '写作完成但字数超标',
      };

      // 创建输出文件（round=4，SM-21: round 不递增，所以检查 v4）
      writeFileSync(
        join(tempDir, 'drafts', 'chapters', 'ch001-v4.md'),
        '# 测试内容'
      );

      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');

      // 达到 maxRounds 且有输出，应该为 completed
      expect(state.chapters.ch001.status).toBe('completed');
      expect(state.chapters.ch001.round).toBe(4); // SM-21: round 不递增
    });
  });
});
