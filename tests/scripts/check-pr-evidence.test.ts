import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const validBugFix = `## 变更类型
- [x] Bug 修复

## 缺陷修复证据
- 症状与复现：输入 X 时输出 Y。
- 根因证据：状态同步保留了旧值。
- 回归测试：新增章节同步测试，修复前失败。
- 验证命令与结果：npm test，通过。
`;

function runChecker(body: string) {
  const directory = mkdtempSync(resolve(tmpdir(), 'confwrite-pr-evidence-'));
  const eventPath = resolve(directory, 'event.json');
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/check-pr-evidence.js');

  try {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { body } }), 'utf8');
    return spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('validatePrBody', () => {
  it('accepts a bug fix with concrete evidence fields', () => {
    expect(runChecker(validBugFix).status).toBe(0);
  });

  it('rejects a bug fix that omits reproducible evidence', () => {
    const body = validBugFix.replace('- 症状与复现：输入 X 时输出 Y。', '- 症状与复现：');
    const result = runChecker(body);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('缺少有效内容：症状与复现');
  });

  it('rejects N/A for required bug-fix evidence', () => {
    const body = validBugFix.replace(
      '- 根因证据：状态同步保留了旧值。',
      '- 根因证据：不适用',
    );
    const result = runChecker(body);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Bug 修复必须填写：根因证据');
  });

  it('allows non-bug changes to mark bug-specific fields as not applicable', () => {
    const body = `## 变更类型
- [x] 文档

## 缺陷修复证据
- 症状与复现：不适用
- 根因证据：不适用
- 回归测试：不适用
- 验证命令与结果：npm run docs:check，通过。
`;
    expect(runChecker(body).status).toBe(0);
  });
});
