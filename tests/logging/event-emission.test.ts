/**
 * SM-17: 关键状态变化必须 emit 事件
 * 
 * 验证以下事件在对应状态变化时被正确 emit：
 * - phase.transition: 阶段转换时
 * - chapter.status: 章节状态变化时
 * - chapter.failed: 章节失败时
 * - round.exceeded: 轮次超限时
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventBus } from '../../src/logging/event-bus.js';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';
import type {
  PhaseTransitionEvent,
  ChapterStatusChangeEvent,
  ChapterFailedEvent,
  RoundExceededEvent,
} from '../../src/logging/types.js';

// 临时目录管理
const TEST_DIR = join(process.cwd(), 'tests', 'tmp', 'event-emission');

function setupProjectDir(): string {
  const dir = join(TEST_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'drafts', 'chapters'), { recursive: true });
  return dir;
}

function createMinimalState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    project: 'test-project',
    currentPhase: '0a',
    status: 'init',
    round: 1,
    lastUpdated: new Date().toISOString(),
    chapters: {
      ch001: {
        id: 'ch001',
        title: '测试章节',
        status: 'pending',
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
      },
    },
    ...overrides,
  } as ProjectState;
}

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: 'write-ch001-r1',
    type: 'writer',
    chapterId: 'ch001',
    priority: 1,
    sequence: 1,
    status: 'queued',
    attempt: 0,
    prompt: '',
    dependencies: [],
    ...overrides,
  };
}

describe('SM-17: 关键状态变化必须 emit 事件', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = setupProjectDir();
  });

  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('phase.transition 事件', () => {
    it('在阶段转换时 emit phase.transition 事件', async () => {
      // 准备：创建 state 并写入磁盘
      const store = new ProjectStore(projectDir);
      const state = createMinimalState({ currentPhase: '1', status: 'init' });
      // 创建 requirements.json 使 Phase 1 出口条件成立
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(join(assetsDir, 'requirements.json'), JSON.stringify([{ id: 'req1', text: 'test' }]));
      store.save(state);

      // 创建带 EventBus 的状态机
      const eventBus = new EventBus();
      const events: PhaseTransitionEvent[] = [];
      eventBus.subscribe('phase.transition', (e) => events.push(e));

      const machine = new StateMachine(projectDir, eventBus);

      // 执行 tick — Phase 1 出口条件满足时应跳转到 Phase 2
      await machine.tick();

      // 验证：应该收到 phase.transition 事件
      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0];
      expect(event.type).toBe('phase.transition');
      expect(event.from).toBe('1');
      expect(event.to).toBe('2');
      expect(event.phaseName).toBeTruthy();
      expect(event.reason).toBeTruthy();
    });

    it('phase.transition 事件包含章节统计', async () => {
      const store = new ProjectStore(projectDir);
      const state = createMinimalState({
        currentPhase: '1',
        status: 'init',
        chapters: {
          ch001: { id: 'ch001', title: 'Ch1', status: 'completed', round: 1, attempt: 0, consecutiveFailures: 0, maxRounds: 5 },
          ch002: { id: 'ch002', title: 'Ch2', status: 'failed', round: 2, attempt: 0, consecutiveFailures: 0, maxRounds: 5 },
        },
      });
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(join(assetsDir, 'requirements.json'), JSON.stringify([{ id: 'req1', text: 'test' }]));
      store.save(state);

      const eventBus = new EventBus();
      const events: PhaseTransitionEvent[] = [];
      eventBus.subscribe('phase.transition', (e) => events.push(e));

      const machine = new StateMachine(projectDir, eventBus);
      await machine.tick();

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].stats).toBeDefined();
      expect(events[0].stats?.completedChapters).toBe(1);
      expect(events[0].stats?.failedChapters).toBe(1);
    });

    it('无 EventBus 时不报错（向后兼容）', async () => {
      const store = new ProjectStore(projectDir);
      const state = createMinimalState({ currentPhase: '1', status: 'init' });
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(join(assetsDir, 'requirements.json'), JSON.stringify([{ id: 'req1', text: 'test' }]));
      store.save(state);

      // 不传 EventBus
      const machine = new StateMachine(projectDir);
      const result = await machine.tick();

      // 不应报错，正常执行
      expect('blocked' in result ? result.blocked : false).toBe(false);
    });
  });

  describe('chapter.status 事件', () => {
    it('在章节状态变化时 emit chapter.status 事件', () => {
      const eventBus = new EventBus();
      const events: ChapterStatusChangeEvent[] = [];
      eventBus.subscribe('chapter.status', (e) => events.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      const task = createTask();

      // Writer 成功 → pending → written
      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('chapter.status');
      expect(events[0].chapterId).toBe('ch001');
      expect(events[0].from).toBe('pending');
      expect(events[0].to).toBe('written');
    });

    it('状态未变化时不 emit 事件', () => {
      const eventBus = new EventBus();
      const events: ChapterStatusChangeEvent[] = [];
      eventBus.subscribe('chapter.status', (e) => events.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      // 章节没有 chapterId 对应的任务
      const task = createTask({ chapterId: 'nonexistent' });

      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      expect(events.length).toBe(0);
    });

    it('reviewer accept 导致 completed 时 emit 事件', () => {
      const eventBus = new EventBus();
      const events: ChapterStatusChangeEvent[] = [];
      eventBus.subscribe('chapter.status', (e) => events.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.status = 'written';

      const task = createTask({ type: 'reviewer', id: 'review-ch001-r1' });
      // 模拟 reviewer 返回 accept
      task.result = JSON.stringify({ verdict: 'accept', confidence: 0.9, reasons: ['good'] });

      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      expect(events.length).toBe(1);
      expect(events[0].from).toBe('written');
      expect(events[0].to).toBe('completed');
    });
  });

  describe('chapter.failed 事件', () => {
    it('章节连续失败 5 次且无产物时 emit chapter.failed', () => {
      const eventBus = new EventBus();
      const failedEvents: ChapterFailedEvent[] = [];
      eventBus.subscribe('chapter.failed', (e) => failedEvents.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.consecutiveFailures = 4; // 第 5 次失败
      const task = createTask();

      orchestrator.updateChapterStatus(state, task, 'failed', projectDir);

      // 应该 emit chapter.failed
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].chapterId).toBe('ch001');
      expect(failedEvents[0].finalAction).toBe('failed');
    });

    it('validation_failed 且超过 maxRounds 时 emit chapter.failed (SM-21)', () => {
      const eventBus = new EventBus();
      const failedEvents: ChapterFailedEvent[] = [];
      eventBus.subscribe('chapter.failed', (e) => failedEvents.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.round = 4; // SM-21: round 不递增，保持为 4
      state.chapters.ch001.consecutiveFailures = 4; // 入口递增后变为 5 >= maxRounds
      state.chapters.ch001.maxRounds = 5;
      const task = createTask();

      orchestrator.updateChapterStatus(state, task, 'failed', projectDir, 'validation_failed');

      // SM-21: consecutiveFailures 达到 maxRounds(5)，且无产物 → failed
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].failureReason).toBe('exceeded_max_rounds_validation');
    });
  });

  describe('round.exceeded 事件', () => {
    it('reviewer 审阅时 round >= maxRounds 且有产物时 emit round.exceeded', () => {
      const eventBus = new EventBus();
      const exceededEvents: RoundExceededEvent[] = [];
      eventBus.subscribe('round.exceeded', (e) => exceededEvents.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.status = 'written';
      state.chapters.ch001.round = 5;
      state.chapters.ch001.maxRounds = 5;

      // 创建产物文件
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      writeFileSync(join(draftsDir, 'ch001-v5.md'), '# 测试内容\n\n这是一段测试内容。');

      const task = createTask({ type: 'reviewer', id: 'review-ch001-r5' });
      task.result = JSON.stringify({ verdict: 'revise', confidence: 0.5, reasons: ['needs work'] });

      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      // round(5) >= maxRounds(5) 且有产物 → completed + round.exceeded
      expect(exceededEvents.length).toBe(1);
      expect(exceededEvents[0].chapterId).toBe('ch001');
      expect(exceededEvents[0].currentRound).toBe(5);
      expect(exceededEvents[0].maxRounds).toBe(5);
      expect(exceededEvents[0].hasOutput).toBe(true);
      expect(exceededEvents[0].finalAction).toBe('completed');
    });

    it('reviewer 审阅时 round >= maxRounds 且无产物时 emit round.exceeded', () => {
      const eventBus = new EventBus();
      const exceededEvents: RoundExceededEvent[] = [];
      eventBus.subscribe('round.exceeded', (e) => exceededEvents.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.status = 'written';
      state.chapters.ch001.round = 5;
      state.chapters.ch001.maxRounds = 5;

      // 不创建产物文件
      const task = createTask({ type: 'reviewer', id: 'review-ch001-r5' });
      task.result = JSON.stringify({ verdict: 'revise', confidence: 0.5, reasons: ['needs work'] });

      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      expect(exceededEvents.length).toBe(1);
      expect(exceededEvents[0].hasOutput).toBe(false);
      expect(exceededEvents[0].finalAction).toBe('failed');
    });

    it('fixer 成功后 round >= maxRounds 时 emit round.exceeded', () => {
      const eventBus = new EventBus();
      const exceededEvents: RoundExceededEvent[] = [];
      eventBus.subscribe('round.exceeded', (e) => exceededEvents.push(e));

      const orchestrator = new WritingOrchestrator(eventBus);
      const state = createMinimalState();
      state.chapters.ch001.status = 'reviewed';
      state.chapters.ch001.lastReviewVerdict = 'revise';
      state.chapters.ch001.round = 4; // fixer 成功后 round 递增到 5
      state.chapters.ch001.maxRounds = 5;

      const task = createTask({ type: 'fixer', id: 'fix-ch001-r4', attempt: 1 });

      orchestrator.updateChapterStatus(state, task, 'success', projectDir);

      // round 递增到 5 >= maxRounds(5)
      expect(exceededEvents.length).toBe(1);
      expect(exceededEvents[0].currentRound).toBe(5);
      expect(exceededEvents[0].finalAction).toBe('completed');
    });
  });

  describe('向后兼容', () => {
    it('WritingOrchestrator 不传 EventBus 时不报错', () => {
      const orchestrator = new WritingOrchestrator();
      const state = createMinimalState();
      const task = createTask();

      // 不应报错
      expect(() => {
        orchestrator.updateChapterStatus(state, task, 'success', projectDir);
      }).not.toThrow();
    });
  });
});
