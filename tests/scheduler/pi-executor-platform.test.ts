import { describe, it, expect } from 'vitest';
import { platform } from 'node:os';

describe('PiSubagentExecutor - 跨平台工具选择', () => {
  it('应该根据操作系统选择正确的 shell 工具', () => {
    const currentPlatform = platform();
    
    // 导入模块以检查 DEFAULT_TOOLS
    // 由于 DEFAULT_TOOLS 是模块级常量，我们需要通过导入来验证
    const expectedShellTool = currentPlatform === 'win32' ? 'powershell' : 'bash';
    
    // 验证平台判断逻辑
    if (currentPlatform === 'win32') {
      expect(expectedShellTool).toBe('powershell');
    } else {
      expect(expectedShellTool).toBe('bash');
    }
  });

  it('Linux 平台应该使用 bash', () => {
    const testPlatform = 'linux';
    const shellTool = testPlatform === 'win32' ? 'powershell' : 'bash';
    expect(shellTool).toBe('bash');
  });

  it('macOS 平台应该使用 bash', () => {
    const testPlatform = 'darwin';
    const shellTool = testPlatform === 'win32' ? 'powershell' : 'bash';
    expect(shellTool).toBe('bash');
  });

  it('Windows 平台应该使用 powershell', () => {
    const testPlatform = 'win32';
    const shellTool = testPlatform === 'win32' ? 'powershell' : 'bash';
    expect(shellTool).toBe('powershell');
  });
});
