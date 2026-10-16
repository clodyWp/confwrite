import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AGENTS.md §3.9 PR 工作流', () => {
  const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');

  it('应包含 Issue 创建步骤', () => {
    expect(agentsMd).toContain('**创建 Issue**');
    expect(agentsMd).toContain('gh issue create');
  });

  it('应包含 6 个标准流程步骤', () => {
    // 匹配步骤编号：1. 2. 3. 4. 5. 6.
    const steps = agentsMd.match(/\d+\.\s+\*\*[^*]+\*\*/g) || [];
    const workflowSteps = steps.filter(s => 
      s.includes('创建 Issue') ||
      s.includes('创建分支') ||
      s.includes('SDD 阶段') ||
      s.includes('PR 上迭代') ||
      s.includes('ready for review') ||
      s.includes('合并')
    );
    expect(workflowSteps.length).toBe(6);
  });

  it('正确模式应包含 Issue 步骤', () => {
    const correctPattern = agentsMd.match(/\*\*正确模式\*\*：([\s\S]*?)(?=\n\*\*|$)/);
    expect(correctPattern).toBeTruthy();
    expect(correctPattern![1]).toContain('创建 Issue');
  });
});
