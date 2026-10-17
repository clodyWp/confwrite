/**
 * SM-22: MockSubagentExecutor wordCountMode='severe' 超预算模式
 *
 * Spec: specs/dirty-mock-testing.md §4.4 (INV-WCM-1 ~ INV-WCM-4)
 *
 * 验证 MockSubagentExecutor 在 severe 模式下生成 ~12000 字草稿（超预算 50%）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import type { Task } from '../../src/scheduler/types.js';

function createWriterTask(chapterId = 'ch001', round = 1): Task {
  return {
    id: `write-${chapterId}-r${round}`,
    type: 'writer',
    chapterId,
    status: 'queued',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

/** Count Chinese characters (CJK Unified Ideographs) */
function countChinese(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

describe('SM-22: MockSubagentExecutor wordCountMode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sm22-mock-severe-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('INV-WCM-1: severe mode generates ~12000 Chinese characters', async () => {
    const executor = new MockSubagentExecutor(tmpDir, { wordCountMode: 'severe' });
    const task = createWriterTask();

    await executor.execute(task);

    const chineseCount = countChinese(task.result || '');
    // Target 12000, tolerance ±20% → [9600, 14400]
    expect(chineseCount).toBeGreaterThanOrEqual(10000);
    expect(chineseCount).toBeLessThanOrEqual(15000);
  });

  it('INV-WCM-1: severe mode draft file on disk matches ~12000 chars', async () => {
    const executor = new MockSubagentExecutor(tmpDir, { wordCountMode: 'severe' });
    const task = createWriterTask('ch042');

    await executor.execute(task);

    const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch042-v1.md');
    expect(existsSync(draftPath)).toBe(true);

    const fileContent = readFileSync(draftPath, 'utf-8');
    const chineseCount = countChinese(fileContent);
    expect(chineseCount).toBeGreaterThanOrEqual(10000);
  });

  it('INV-WCM-2: default mode (no wordCountMode) generates ~4000 chars', async () => {
    const executor = new MockSubagentExecutor(tmpDir);
    const task = createWriterTask();

    await executor.execute(task);

    const chineseCount = countChinese(task.result || '');
    // Default should be in the ~3000-5500 range
    expect(chineseCount).toBeGreaterThanOrEqual(3000);
    expect(chineseCount).toBeLessThanOrEqual(5500);
  });

  it('INV-WCM-2: under mode generates ~4000 chars (same as default)', async () => {
    const executor = new MockSubagentExecutor(tmpDir, { wordCountMode: 'under' });
    const task = createWriterTask();

    await executor.execute(task);

    const chineseCount = countChinese(task.result || '');
    expect(chineseCount).toBeGreaterThanOrEqual(3000);
    expect(chineseCount).toBeLessThanOrEqual(5500);
  });

  it('INV-WCM-3: severe mode does not affect reviewer output', async () => {
    const executor = new MockSubagentExecutor(tmpDir, { wordCountMode: 'severe' });
    const reviewTask: Task = {
      id: 'review-ch001-r1',
      type: 'reviewer',
      chapterId: 'ch001',
      status: 'queued',
      priority: 1,
      sequence: 1,
      attempt: 0,
      prompt: '',
      dependencies: [],
    };

    const result = await executor.execute(reviewTask);
    expect(result.success).toBe(true);

    // Reviewer should still produce valid JSON with decision
    const parsed = JSON.parse(reviewTask.result || '');
    expect(parsed.decision).toBe('accept');
  });

  it('INV-WCM-4: task.result matches file content in severe mode', async () => {
    const executor = new MockSubagentExecutor(tmpDir, { wordCountMode: 'severe' });
    const task = createWriterTask('ch099');

    await executor.execute(task);

    const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch099-v1.md');
    const fileContent = readFileSync(draftPath, 'utf-8');
    expect(task.result).toBe(fileContent);
  });
});
