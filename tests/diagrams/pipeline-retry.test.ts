/**
 * Tests for diagram pipeline retry mechanism (P5-5)
 *
 * 验证图表生成失败时的自动重试行为：
 * - 首次失败、重试成功 → retried++, generated++, failed 不变
 * - 首次失败、重试也失败 → failed++, generated 不变
 * - maxRetries=0 → 不重试，直接计入 failed
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  DiagramPipeline,
  type PipelineOptions,
  type PipelineResult,
} from '../../src/diagrams/pipeline.js';
import type { DiagramBlock } from '../../src/diagrams/extractor.js';

const TEST_DIR = join(process.cwd(), '.test-pipeline-retry');

/**
 * 可控制失败行为的测试用 Pipeline 子类
 *
 * 通过 override processDiagram 来模拟首次失败/重试成功等场景。
 */
class ControllablePipeline extends DiagramPipeline {
  /** 每个 diagramId 的失败次数计数器 */
  private failCounts = new Map<string, number>();
  /** 哪些 diagramId 在第几次尝试时应该失败 */
  private failUntil: Map<string, number>;

  constructor(projectDir: string, failUntil: Map<string, number>) {
    super(projectDir);
    this.failUntil = failUntil;
  }

  protected async processDiagram(
    block: DiagramBlock,
    diagramId: string,
    figuresDir: string,
    options: PipelineOptions,
    result: PipelineResult,
  ): Promise<void> {
    const currentFails = this.failCounts.get(diagramId) ?? 0;
    const shouldFailUntil = this.failUntil.get(diagramId) ?? 0;

    if (currentFails < shouldFailUntil) {
      this.failCounts.set(diagramId, currentFails + 1);
      throw new Error(`Simulated failure for ${diagramId} (attempt ${currentFails + 1})`);
    }

    // 调用父类的真实实现
    return super.processDiagram(block, diagramId, figuresDir, options, result);
  }
}

describe('DiagramPipeline retry mechanism (P5-5)', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });

    // 创建默认风格配置
    writeFileSync(
      join(TEST_DIR, 'assets', 'diagram-style.json'),
      JSON.stringify({
        colorScheme: 'warm',
        nodeShape: 'rounded',
        layoutDirection: 'top-to-bottom',
        fontSize: 'normal',
        customColors: null,
      })
    );
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  const SIMPLE_CHAPTER = `
<!-- diagram-start
type: flow
title: 流程图
description: |
  A → B
diagram-end -->
`;

  it('retried=0, generated=1 when diagram succeeds on first attempt', async () => {
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);

    const pipeline = new DiagramPipeline(TEST_DIR);
    const result = await pipeline.run();

    expect(result.total).toBe(1);
    expect(result.generated).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('retry succeeds: retried=1, generated=1, failed=0', async () => {
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);

    // 第一次尝试失败，第二次成功
    const failUntil = new Map([['ch01-fig1', 1]]);
    const pipeline = new ControllablePipeline(TEST_DIR, failUntil);
    const result = await pipeline.run();

    expect(result.total).toBe(1);
    expect(result.generated).toBe(1);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('retry also fails: failed=1, generated=0, retried=0', async () => {
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);

    // 前 5 次都失败（远超 maxRetries=1 的重试次数）
    const failUntil = new Map([['ch01-fig1', 5]]);
    const pipeline = new ControllablePipeline(TEST_DIR, failUntil);
    const result = await pipeline.run();

    expect(result.total).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].diagramId).toBe('ch01-fig1');
  });

  it('maxRetries=0 means no retry: immediate fail', async () => {
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);

    // 第一次就失败，但 maxRetries=0 不重试
    const failUntil = new Map([['ch01-fig1', 1]]);
    const pipeline = new ControllablePipeline(TEST_DIR, failUntil);
    const result = await pipeline.run({ maxRetries: 0 });

    expect(result.total).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('mixed results: one succeeds, one retries, one fails', async () => {
    // 两章，各一张图
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch02-v1.md'), SIMPLE_CHAPTER);
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch03-v1.md'), SIMPLE_CHAPTER);

    // ch01-fig1: 首次成功
    // ch02-fig1: 首次失败，重试成功
    // ch03-fig1: 首次和重试都失败
    const failUntil = new Map([
      ['ch02-fig1', 1],  // 失败 1 次后成功
      ['ch03-fig1', 5],  // 失败 5 次（远超重试次数）
    ]);
    const pipeline = new ControllablePipeline(TEST_DIR, failUntil);
    const result = await pipeline.run();

    expect(result.total).toBe(3);
    expect(result.generated).toBe(2);  // ch01 + ch02
    expect(result.retried).toBe(1);    // ch02
    expect(result.failed).toBe(1);     // ch03
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].diagramId).toBe('ch03-fig1');
  });

  it('error message contains last failure reason (not first)', async () => {
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), SIMPLE_CHAPTER);

    // 总是失败，验证错误信息来自最后一次尝试
    const failUntil = new Map([['ch01-fig1', 5]]);
    const pipeline = new ControllablePipeline(TEST_DIR, failUntil);
    const result = await pipeline.run();

    expect(result.errors).toHaveLength(1);
    // 错误信息应该包含 "attempt 2"（第二次尝试的失败信息，即最后一次）
    expect(result.errors[0].error).toContain('attempt 2');
  });
});
