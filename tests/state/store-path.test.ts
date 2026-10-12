import { describe, it, expect, afterEach } from 'vitest';
import { ProjectStore } from '../../src/state/store.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('ProjectStore 路径', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('statePath 应该使用 path.join() 而非模板字符串', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'store-test-'));
    const store = new ProjectStore(tempDir);
    // statePath 应该等于 path.join 的结果
    const expected = join(tempDir, 'project-state.json');
    // 通过 getPath() 验证实际路径
    const actual = store.getPath();
    expect(actual).toBe(expected);
    // 不应有混合分隔符或双斜杠
    expect(actual).not.toContain('//');
  });

  it('getPath() 返回的路径与 path.join 一致（Windows 反斜杠）', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'store-path-test-'));
    const store = new ProjectStore(tempDir);
    const actual = store.getPath();
    const expected = join(tempDir, 'project-state.json');
    // 在 Windows 上 path.join 使用反斜杠，模板字符串会产生正斜杠
    // 修复后两者应完全一致
    expect(actual).toBe(expected);
  });
});
