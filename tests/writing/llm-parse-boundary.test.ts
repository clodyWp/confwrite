/**
 * LLM 输出解析边界测试
 * 
 * Issue #91: LLM 解析边界测试
 * Spec: specs/llm-parse-boundary.md
 * 
 * 测试所有解析 LLM 输出的 JSON 解析路径的边界行为。
 * 
 * 涉及的解析入口：
 * - E1: OutputValidator.tryFixJSON() — Reviewer 输出的 JSON 文件
 * - E2: TaskExecutor.parseReviewDecision() — Reviewer 输出文本
 * - E3: WritingOrchestrator.parseReviewResult() — Reviewer JSON 文件 + task.result
 * - E4: LLMPlanner.parseResponse() / extractJSON() — LLM 大纲规划响应
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { LLMPlanner } from '../../src/outline/llm-planner.js';
import type { Task } from '../../src/scheduler/types.js';

function createTask(type: 'writer' | 'reviewer' | 'fixer', chapterId = 'ch001', round = 1): Task {
  return {
    id: `${type === 'writer' ? 'write' : type === 'reviewer' ? 'review' : 'fix'}-${chapterId}-r${round}`,
    type,
    chapterId,
    status: 'queued',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

describe('LLM Parse Boundary (Issue #91)', () => {
  let tmpDir: string;
  let validator: OutputValidator;
  let taskExecutor: TaskExecutor;
  let orchestrator: WritingOrchestrator;
  let llmPlanner: LLMPlanner;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'llm-parse-boundary-'));
    validator = new OutputValidator(tmpDir);
    taskExecutor = new TaskExecutor(undefined, tmpDir);
    orchestrator = new WritingOrchestrator();
    llmPlanner = new LLMPlanner();
    
    mkdirSync(join(tmpDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tmpDir, 'review'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // INV-PB-1: 空 JSON 对象
  // ============================================================
  describe('INV-PB-1: 空 JSON 对象', () => {
    it('E1: tryFixJSON returns {} for empty object, verdict validation fails', () => {
      // 写入空 JSON 对象到 review 文件
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '{}', 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 解析成功返回 {}，但 verdict 缺失
      expect(result.errors.some(e => e.includes('verdict'))).toBe(true);
    });

    it('E1: tryFixJSON handles {"verdict":""} — verdict validation fails', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '{"verdict":""}', 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // verdict 为空字符串，不合法
      expect(result.errors.some(e => e.includes('verdict'))).toBe(true);
    });

    it('E2: parseReviewDecision returns default revise for empty object', () => {
      const decision = taskExecutor.parseReviewDecision('{}');
      
      // verdict 缺失 → 默认 revise
      expect(decision.decision).toBe('revise');
    });

    it('E2: parseReviewDecision returns default revise for {"verdict":""}', () => {
      const decision = taskExecutor.parseReviewDecision('{"verdict":""}');
      
      // verdict 为空字符串，falsy → 默认 revise
      expect(decision.decision).toBe('revise');
    });

    it('E3: parseReviewResult with empty JSON file → default revise', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '{}', 'utf-8');
      
      const state = { phase: 'writing', chapters: { ch001: { id: 'ch001', status: 'written', round: 1, attempt: 0, consecutiveFailures: 0, maxRounds: 5 } } } as any;
      const task = createTask('reviewer');
      task.result = '{}';
      
      orchestrator.updateChapterStatus(state, task, 'success', tmpDir);
      
      // verdict 缺失 → 默认 revise → 章节进入 reviewed（需要修复）
      expect(state.chapters['ch001'].lastReviewVerdict).toBe('revise');
    });

    it('no uncaught exceptions for empty JSON inputs', () => {
      // E1
      expect(() => {
        const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
        writeFileSync(reviewPath, '{}', 'utf-8');
        const task = createTask('reviewer');
        validator.validate(task, 1);
      }).not.toThrow();
      
      // E2
      expect(() => taskExecutor.parseReviewDecision('{}')).not.toThrow();
    });
  });

  // ============================================================
  // INV-PB-2: 嵌套 JSON（Markdown 代码块包裹）
  // ============================================================
  describe('INV-PB-2: 嵌套 JSON（代码块包裹）', () => {
    it('E2: parseReviewDecision extracts JSON from markdown code block', () => {
      const reviewOutput = '以下是审阅结果：\n```json\n{"verdict":"accept","scores":{"accuracy":8,"consistency":9,"clarity":8,"depth":7,"quality":8}}\n```\n希望有帮助';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // 正则提取最外层 {...}，解析成功
      expect(decision.decision).toBe('accept');
    });

    it('E2: parseReviewDecision handles JSON wrapped in text without code block', () => {
      const reviewOutput = '审阅完成。{"verdict":"revise","scores":{"accuracy":6}} 请修改。';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // 正则提取 {...}
      expect(decision.decision).toBe('revise');
    });

    it('E4: LLMPlanner.parseResponse extracts JSON from code block', () => {
      const response = '以下是大纲规划结果：\n```json\n[{"id":"ch001","title":"概述","type":"overview","description":"系统概述"}]\n```\n';
      
      const chapters = llmPlanner.parseResponse(response, {
        wordBudget: { min: 5000, max: 8000 },
      });
      
      expect(chapters).toHaveLength(1);
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[0].title).toBe('概述');
    });

    it('E4: LLMPlanner.parseResponse handles direct JSON array', () => {
      const response = '[{"id":"ch001","title":"概述","type":"overview","description":"系统概述"},{"id":"ch002","title":"架构","type":"architecture","description":"系统架构"}]';
      
      const chapters = llmPlanner.parseResponse(response, {
        wordBudget: { min: 5000, max: 8000 },
      });
      
      expect(chapters).toHaveLength(2);
    });
  });

  // ============================================================
  // INV-PB-3: 特殊字符（中文引号、转义字符、Unicode）
  // ============================================================
  describe('INV-PB-3: 特殊字符', () => {
    it('E1: tryFixJSON removes Chinese quotes and parses successfully', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      // 中文引号在字符串值内
      const content = '{"verdict":"accept","summary":"他说\u201c你好\u201d"}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 移除中文引号后解析成功
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });

    it('E2: parseReviewDecision handles escape characters natively', () => {
      const reviewOutput = '{"verdict":"accept","summary":"包含\\n换行和\\t制表符"}';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // JSON.parse 原生处理转义字符
      expect(decision.decision).toBe('accept');
    });

    it('E2: parseReviewDecision handles CJK characters', () => {
      const reviewOutput = '{"verdict":"accept","summary":"内容质量很好，结构清晰，数据准确"}';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      expect(decision.decision).toBe('accept');
    });

    it('E2: parseReviewDecision handles emoji', () => {
      const reviewOutput = '{"verdict":"accept","summary":"Great work! 👍🎉"}';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      expect(decision.decision).toBe('accept');
    });
  });

  // ============================================================
  // INV-PB-4: 超大 JSON（>100KB）
  // ============================================================
  describe('INV-PB-4: 超大 JSON', () => {
    it('E2: parseReviewDecision handles 100KB+ JSON without crash', () => {
      // 构造含 1000 个 issues 条目的 JSON 字符串
      const issues = [];
      for (let i = 0; i < 1000; i++) {
        issues.push({
          severity: 'low',
          description: `问题 ${i}: 这是一个较长的描述，用于测试大 JSON 解析性能。包含中文、English、和特殊字符！@#$%^&*()`,
          location: `section-${i % 10}.${i % 5}`,
          suggestion: `建议 ${i}: 改进此处内容的深度和广度，补充更多示例和对比分析。`,
        });
      }
      
      const largeJson = JSON.stringify({
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 9, clarity: 8, depth: 7, quality: 8 },
        issues,
        summary: '总体评价',
      });
      
      // 验证 JSON 大小 > 100KB
      expect(largeJson.length).toBeGreaterThan(100 * 1024);
      
      const startTime = Date.now();
      const decision = taskExecutor.parseReviewDecision(largeJson);
      const elapsed = Date.now() - startTime;
      
      // 不崩溃，解析正确
      expect(decision.decision).toBe('accept');
      // 解析时间 < 1s
      expect(elapsed).toBeLessThan(1000);
    });

    it('E1: tryFixJSON handles 100KB+ JSON file', () => {
      const issues = [];
      for (let i = 0; i < 1000; i++) {
        issues.push({
          severity: 'low',
          description: `问题 ${i}: 描述内容`.repeat(5),
        });
      }
      
      const largeJson = JSON.stringify({
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 9, clarity: 8, depth: 7, quality: 8 },
        issues,
      });
      
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, largeJson, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // 不崩溃，verdict 合法
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });
  });

  // ============================================================
  // INV-PB-5: JSON 数组（而非对象）
  // ============================================================
  describe('INV-PB-5: JSON 数组', () => {
    it('E1: tryFixJSON returns array, verdict validation fails', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '[{"verdict":"accept"}]', 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 返回数组，parsed.verdict 为 undefined → verdict 校验失败
      expect(result.errors.some(e => e.includes('verdict'))).toBe(true);
    });

    it('E2: parseReviewDecision handles array input without crash', () => {
      const reviewOutput = '[{"verdict":"accept"},{"verdict":"reject"}]';
      
      // 不抛异常
      expect(() => taskExecutor.parseReviewDecision(reviewOutput)).not.toThrow();
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      // 贪婪正则匹配从第一个 { 到最后一个 } → JSON.parse 失败 → fallback 到文本
      expect(decision.decision).toBeDefined();
      expect(['accept', 'reject', 'revise']).toContain(decision.decision);
    });

    it('E4: LLMPlanner.parseResponse handles array input correctly', () => {
      const response = '[{"id":"ch001","title":"概述","type":"overview","description":"系统概述"}]';
      
      const chapters = llmPlanner.parseResponse(response, {
        wordBudget: { min: 5000, max: 8000 },
      });
      
      // 数组路径正常处理
      expect(chapters).toHaveLength(1);
      expect(chapters[0].title).toBe('概述');
    });

    it('E4: LLMPlanner.parseResponse throws for non-array JSON', () => {
      const response = '{"chapters": [{"id":"ch001","title":"概述","type":"overview"}]}';
      
      // 非数组 → 抛出异常
      expect(() => llmPlanner.parseResponse(response, {
        wordBudget: { min: 5000, max: 8000 },
      })).toThrow(/not an array/);
    });
  });

  // ============================================================
  // INV-PB-6: 完全非 JSON 文本
  // ============================================================
  describe('INV-PB-6: 完全非 JSON 文本', () => {
    it('E1: tryFixJSON throws for pure text, caught as validation error', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '我认为这章写得不错', 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 所有修复步骤失败 → 抛出错误 → 被 validateReviewerOutput 捕获
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('JSON'))).toBe(true);
    });

    it('E2: parseReviewDecision falls back to text regex for pure text', () => {
      const reviewOutput = '我认为这章写得不错';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // 文本正则未匹配 → 返回默认 revise
      expect(decision.decision).toBe('revise');
    });

    it('E2: parseReviewDecision extracts decision from text with verdict keyword', () => {
      const reviewOutput = '审阅完成，verdict: accept，内容质量达标';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // 文本正则匹配 verdict: accept
      expect(decision.decision).toBe('accept');
    });

    it('E3: parseReviewResult with pure text file → default revise', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      writeFileSync(reviewPath, '这不是 JSON', 'utf-8');
      
      const state = { phase: 'writing', chapters: { ch001: { id: 'ch001', status: 'written', round: 1, attempt: 0, consecutiveFailures: 0, maxRounds: 5 } } } as any;
      const task = createTask('reviewer');
      task.result = '这不是 JSON';
      
      orchestrator.updateChapterStatus(state, task, 'success', tmpDir);
      
      // JSON 解析失败 → fallback 文本解析 → 最终默认 revise
      expect(state.chapters['ch001'].lastReviewVerdict).toBe('revise');
    });

    it('E4: LLMPlanner.parseResponse throws for pure text', () => {
      const response = '这是一段纯文本，没有 JSON 结构';
      
      expect(() => llmPlanner.parseResponse(response, {
        wordBudget: { min: 5000, max: 8000 },
      })).toThrow(/not contain valid JSON/);
    });

    it('no uncaught exceptions for pure text inputs', () => {
      // E2
      expect(() => taskExecutor.parseReviewDecision('纯文本')).not.toThrow();
    });
  });

  // ============================================================
  // INV-PB-7: JSON 注释（// 和 /* */）
  // ============================================================
  describe('INV-PB-7: JSON 注释', () => {
    it('E1: tryFixJSON removes // comments and parses', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = '{"verdict":"accept" // 这是注释\n}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 步骤 2 移除注释后解析成功
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });

    it('E1: tryFixJSON removes /* */ comments and parses', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = '{"verdict":"accept" /* 多行注释 */}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });

    it('E2: parseReviewDecision fails with comments (known degradation)', () => {
      const reviewOutput = '{"verdict":"accept" /* ok */}';
      
      // E2 不处理注释 → JSON.parse 失败 → fallback 到文本解析
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      
      // 文本正则可能匹配到 accept（因为文本中包含 accept）
      // 或者返回默认 revise
      expect(['accept', 'revise']).toContain(decision.decision);
    });
  });

  // ============================================================
  // 边界情况矩阵补充
  // ============================================================
  describe('边界情况补充', () => {
    it('E2: parseReviewDecision handles null/undefined-like input', () => {
      // 空字符串
      const decision1 = taskExecutor.parseReviewDecision('');
      expect(decision1.decision).toBe('revise');
      
      // 只有空白字符
      const decision2 = taskExecutor.parseReviewDecision('   \n\t  ');
      expect(decision2.decision).toBe('revise');
    });

    it('E1: tryFixJSON handles nested JSON objects correctly', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = '{"verdict":"accept","scores":{"accuracy":{"value":8,"weight":0.2}}}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });

    it('E2: parseReviewDecision handles JSON with nested objects', () => {
      const reviewOutput = '{"verdict":"accept","scores":{"accuracy":8,"consistency":{"score":9,"notes":"good"}}}';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      expect(decision.decision).toBe('accept');
    });

    it('E1: tryFixJSON handles unbalanced braces (cannot fix)', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = '{"verdict":"accept","scores":{';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // 无法修复 → valid=false
      expect(result.valid).toBe(false);
    });

    it('E1: tryFixJSON handles single quotes (cannot fix directly)', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = "{'verdict':'accept'}";
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // 单引号不是标准 JSON，tryFixJSON 不处理 → 验证失败
      expect(result.valid).toBe(false);
    });

    it('E1: tryFixJSON handles trailing comma (cannot fix directly)', () => {
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const content = '{"verdict":"accept",}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // 尾逗号不是标准 JSON，tryFixJSON 不处理 → 验证失败
      expect(result.valid).toBe(false);
    });
  });
});
