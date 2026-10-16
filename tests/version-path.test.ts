import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Issue #143: getConfWriteVersion 路径错误', () => {
  it('应该返回实际版本号，而不是 "unknown"', async () => {
    // 动态导入，因为 getConfWriteVersion 当前未导出
    const indexModule = await import('../src/index.js');
    
    // 如果函数未导出，这个测试会失败，证明我们需要先导出它
    if (!('getConfWriteVersion' in indexModule)) {
      throw new Error('getConfWriteVersion 未导出，无法测试');
    }
    
    const version = (indexModule as any).getConfWriteVersion();
    
    // 不应该返回 'unknown'
    expect(version).not.toBe('unknown');
    
    // 应该符合 semver 格式（如 0.29.0）
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('应该与 package.json 中的版本一致', async () => {
    const indexModule = await import('../src/index.js');
    
    if (!('getConfWriteVersion' in indexModule)) {
      throw new Error('getConfWriteVersion 未导出，无法测试');
    }
    
    const packagePath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    
    const version = (indexModule as any).getConfWriteVersion();
    expect(version).toBe(pkg.version);
  });
});
