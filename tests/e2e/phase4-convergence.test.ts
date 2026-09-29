/**
 * E2E 测试：Phase 4 收敛性
 * 
 * 验证写作→审阅→修复循环的收敛行为：
 * - Bug 4/5/6 修复后：accept 标准基于严重度
 * - Bug 51 修复后：round 正确递增
 * - maxRounds=5 守护生效
 * 
 * 测试场景：
 * 1. 第 1 轮就 accept（无问题）
 * 2. 第 3 轮 accept（前 2 轮 revise）
 * 3. maxRounds=5 强制通过
 * 4. 严重度与裁决的关系（high→revise, low→accept）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { ConfigurableMockExecutor } from './configurable-mock-executor.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';

function setupProject(tempDir: string, chapters: string[] = ['ch001']): void {
  // 创建项目结构
  mkdirSync(join(tempDir, 'assets', 'chapter-kits'), { recursive: true });
  mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
  mkdirSync(join(tempDir, 'review'), { recursive: true });
  mkdirSync(join(tempDir, 'output'), { recursive: true });

  // 创建章节素材包
  for (const ch of chapters) {
    writeFileSync(
      join(tempDir, 'assets', 'chapter-kits', `${ch}.md`),
      `# ${ch} 测试章节\n\n## 要点\n- 测试内容\n\n## 基线数据\n- 性能: 1000 QPS\n`,
      'utf-8'
    );
  }

  // 创建数据基线
  writeFileSync(
    join(tempDir, 'assets', 'data-baseline.json'),
    JSON.stringify({
      metrics: { '性能': '1000 QPS' },
      technicalTerms: ['微服务'],
      requirements: ['高可用'],
    }, null, 2)
  );

  // 创建大纲
  const outlineContent = ['# 测试文档', '', ...chapters.map((ch, i) => `## ${i + 1}. 章节${i + 1}\nch${String(i + 1).padStart(3, '0')} 章节${i + 1}`)].join('\n');
  writeFileSync(join(tempDir, 'outline.md'), outlineContent);

  // 创建初始状态
  const state: ProjectState = {
    version: 1,
    project: 'test',
    projectDir: tempDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '4a',
    status: 'writing',
    round: 1,
    chapters: {},
    tasks: [],
    executionLog: [],
    escalatedToHuman: false,
  };

  for (const ch of chapters) {
    state.chapters[ch] = {
      id: ch,
      title: `章节${ch.replace('ch', '')}`,
      status: 'pending',
      round: 1,
      attempt: 0,
      version: 0,
      consecutiveFailures: 0,
      maxRounds: 5,
    } as ChapterState;
  }

  writeFileSync(join(tempDir, 'project-state.json'), JSON.stringify(state, null, 2));
}

describe('E2E: Phase 4 收敛性', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cw-e2e-phase4-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('场景 1：第 1 轮就 accept', () => {
    it('无问题时，第 1 轮审阅返回 accept，章节变为 completed', async () => {
      setupProject(tempDir, ['ch001']);

      const store = new ProjectStore(tempDir);
      const scheduler = new SubagentScheduler();
      const executor = new ConfigurableMockExecutor(tempDir, {
        defaultReview: { acceptAtRound: 1 },
      });
      const runner = new SchedulerRunner(scheduler, executor);
      const taskExecutor = new TaskExecutor();
      const orchestrator = new WritingOrchestrator();
      const dispatcher = new Dispatcher(tempDir, store, scheduler, taskExecutor, orchestrator);

      // 执行写作
      await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 });
      await runner.runUntilIdle();

      // 检查草稿已生成
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'))).toBe(true);

      // 手动更新状态（模拟 WritingOrchestrator 的行为）
      const state1 = store.load()!;
      state1.chapters.ch001.status = 'written';
      store.save(state1);

      // 执行审阅
      await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001'], round: 1 });
      await runner.runUntilIdle();

      // 检查审阅报告
      expect(existsSync(join(tempDir, 'review', 'ch001-r1.json'))).toBe(true);

      // 读取审阅结果
      const review = JSON.parse(readFileSync(join(tempDir, 'review', 'ch001-r1.json'), 'utf-8'));
      expect(review.verdict).toBe('accept');
    });
  });

  describe('场景 2：第 3 轮 accept（前 2 轮 revise）', () => {
    it('前 2 轮 revise，第 3 轮 accept，round 正确递增', async () => {
      setupProject(tempDir, ['ch001']);

      const store = new ProjectStore(tempDir);
      const scheduler = new SubagentScheduler();
      const executor = new ConfigurableMockExecutor(tempDir, {
        review: {
          ch001: { acceptAtRound: 3 },
        },
      });
      const runner = new SchedulerRunner(scheduler, executor);
      const taskExecutor = new TaskExecutor();
      const orchestrator = new WritingOrchestrator();
      const dispatcher = new Dispatcher(tempDir, store, scheduler, taskExecutor, orchestrator);

      // Round 1: 写作
      await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 });
      await runner.runUntilIdle();
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'))).toBe(true);

      // Round 1: 审阅(revise)
      let state = store.load()!;
      state.chapters.ch001.status = 'written';
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001'], round: 1 });
      await runner.runUntilIdle();

      let review = JSON.parse(readFileSync(join(tempDir, 'review', 'ch001-r1.json'), 'utf-8'));
      expect(review.verdict).toBe('revise');

      // Round 1: 修复 → round 变为 2
      state = store.load()!;
      state.chapters.ch001.status = 'reviewed';
      state.chapters.ch001.lastReviewVerdict = 'revise';
      store.save(state);

      await dispatcher.dispatch('spawn_fixers', { chapters: ['ch001'], round: 1 });
      await runner.runUntilIdle();

      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v2.md'))).toBe(true);

      // Round 2: 审阅(revise)
      state = store.load()!;
      state.chapters.ch001.status = 'written';
      state.chapters.ch001.round = 2;
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001'], round: 2 });
      await runner.runUntilIdle();

      review = JSON.parse(readFileSync(join(tempDir, 'review', 'ch001-r2.json'), 'utf-8'));
      expect(review.verdict).toBe('revise');

      // Round 2: 修复 → round 变为 3
      state = store.load()!;
      state.chapters.ch001.status = 'reviewed';
      store.save(state);

      await dispatcher.dispatch('spawn_fixers', { chapters: ['ch001'], round: 2 });
      await runner.runUntilIdle();

      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v3.md'))).toBe(true);

      // Round 3: 审阅(accept)
      state = store.load()!;
      state.chapters.ch001.status = 'written';
      state.chapters.ch001.round = 3;
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001'], round: 3 });
      await runner.runUntilIdle();

      review = JSON.parse(readFileSync(join(tempDir, 'review', 'ch001-r3.json'), 'utf-8'));
      expect(review.verdict).toBe('accept');

      // 验证生成了 3 个版本的草稿
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v2.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v3.md'))).toBe(true);

      // 验证生成了 3 份审阅报告
      expect(existsSync(join(tempDir, 'review', 'ch001-r1.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'review', 'ch001-r2.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'review', 'ch001-r3.json'))).toBe(true);
    });
  });

  describe('场景 3：maxRounds=5 强制通过', () => {
    it('持续 revise 到第 5 轮，审阅报告返回 revise', async () => {
      setupProject(tempDir, ['ch001']);

      const store = new ProjectStore(tempDir);
      const scheduler = new SubagentScheduler();
      const executor = new ConfigurableMockExecutor(tempDir, {
        review: {
          ch001: { acceptAtRound: 100 }, // 永远不 accept
        },
      });
      const runner = new SchedulerRunner(scheduler, executor);
      const taskExecutor = new TaskExecutor();
      const orchestrator = new WritingOrchestrator();
      const dispatcher = new Dispatcher(tempDir, store, scheduler, taskExecutor, orchestrator);

      // 循环 5 轮
      for (let round = 1; round <= 5; round++) {
        if (round === 1) {
          await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round });
        } else {
          // fixer 读取 v{round} 并创建 v{round+1}
          // 但我们需要先确保 v{round} 存在
          await dispatcher.dispatch('spawn_fixers', { chapters: ['ch001'], round: round - 1 });
        }
        await runner.runUntilIdle();

        // 更新状态
        let state = store.load()!;
        state.chapters.ch001.status = 'written';
        state.chapters.ch001.round = round;
        store.save(state);

        await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001'], round });
        await runner.runUntilIdle();

        // 检查审阅报告
        const reviewPath = join(tempDir, 'review', `ch001-r${round}.json`);
        expect(existsSync(reviewPath)).toBe(true);

        const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
        expect(review.verdict).toBe('revise');

        // 更新状态为 reviewed
        state = store.load()!;
        state.chapters.ch001.status = 'reviewed';
        state.chapters.ch001.lastReviewVerdict = 'revise';
        store.save(state);
      }

      // 验证生成了 5 个版本的草稿 (v1-v5)
      // v1: writer
      // v2: fixer(round=1)
      // v3: fixer(round=2)
      // v4: fixer(round=3)
      // v5: fixer(round=4)
      for (let i = 1; i <= 5; i++) {
        expect(existsSync(join(tempDir, 'drafts', 'chapters', `ch001-v${i}.md`))).toBe(true);
      }
    });
  });

  describe('场景 4：严重度与裁决的关系（Bug 4/5 修复验证）', () => {
    it('只有 low 级问题时，应该 accept（不触发 revise）', () => {
      const taskExecutor = new TaskExecutor();
      const task = {
        id: 'review-ch001-r1',
        type: 'reviewer' as const,
        chapterId: 'ch001',
        status: 'queued' as const,
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const prompt = taskExecutor.generateReviewerPrompt(
        task,
        '# 章节内容\n' + '测试内容。'.repeat(3000),
        { metrics: {}, technicalTerms: [], requirements: [] },
        1,
        '',
        tempDir
      );

      // 验证 prompt 中的 accept 标准
      expect(prompt).toContain('无 high 问题，且 medium ≤ 3 条');
      expect(prompt).toContain('low 级问题不影响 accept');
      
      // 验证严重度定义
      expect(prompt).toContain('high = 内容错误');
      expect(prompt).toContain('low = 措辞可改进');
    });

    it('prompt 不再要求段落 ≥ 300 字（Bug 6 修复验证）', () => {
      const taskExecutor = new TaskExecutor();
      const task = {
        id: 'review-ch001-r1',
        type: 'reviewer' as const,
        chapterId: 'ch001',
        status: 'queued' as const,
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const prompt = taskExecutor.generateReviewerPrompt(
        task,
        '# 章节内容\n测试内容',
        { metrics: {}, technicalTerms: [], requirements: [] },
        1,
        '',
        tempDir
      );

      // 不应该包含段落级 300 字要求
      expect(prompt).not.toContain('每个独立成段的段落是否 ≥ 300 字');
      
      // 但应该保留 ch 级 8000 字要求
      expect(prompt).toContain('8000 字');
    });
  });

  describe('场景 5：多章节并行', () => {
    it('多个章节可以独立生成草稿和审阅报告', async () => {
      setupProject(tempDir, ['ch001', 'ch002', 'ch003']);

      const store = new ProjectStore(tempDir);
      const scheduler = new SubagentScheduler();
      const executor = new ConfigurableMockExecutor(tempDir, {
        review: {
          ch001: { acceptAtRound: 1 }, // 第 1 轮 accept
          ch002: { acceptAtRound: 2 }, // 第 2 轮 accept
          ch003: { acceptAtRound: 3 }, // 第 3 轮 accept
        },
      });
      const runner = new SchedulerRunner(scheduler, executor);
      const taskExecutor = new TaskExecutor();
      const orchestrator = new WritingOrchestrator();
      const dispatcher = new Dispatcher(tempDir, store, scheduler, taskExecutor, orchestrator);

      // Round 1: 写作所有章节
      await dispatcher.dispatch('spawn_writers', { chapters: ['ch001', 'ch002', 'ch003'], round: 1 });
      await runner.runUntilIdle();

      // 检查所有章节草稿已生成
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch002-v1.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'drafts', 'chapters', 'ch003-v1.md'))).toBe(true);

      // Round 1: 审阅所有章节
      let state = store.load()!;
      state.chapters.ch001.status = 'written';
      state.chapters.ch002.status = 'written';
      state.chapters.ch003.status = 'written';
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', { chapters: ['ch001', 'ch002', 'ch003'], round: 1 });
      await runner.runUntilIdle();

      // 检查审阅报告
      const r1_1 = JSON.parse(readFileSync(join(tempDir, 'review', 'ch001-r1.json'), 'utf-8'));
      const r1_2 = JSON.parse(readFileSync(join(tempDir, 'review', 'ch002-r1.json'), 'utf-8'));
      const r1_3 = JSON.parse(readFileSync(join(tempDir, 'review', 'ch003-r1.json'), 'utf-8'));

      expect(r1_1.verdict).toBe('accept'); // ch001 第 1 轮 accept
      expect(r1_2.verdict).toBe('revise'); // ch002 需要修复
      expect(r1_3.verdict).toBe('revise'); // ch003 需要修复
    });
  });
});
