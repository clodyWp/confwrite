import { describe, it, expect } from 'vitest';
import { platform } from 'node:os';
import { resolveShellTool, DEFAULT_TOOLS } from '../../src/scheduler/pi-executor.js';

/**
 * 跨平台 shell 选择
 *
 * 注意：本文件此前是一个「假测试」——它把三元表达式复制进测试体，
 * 然后断言自己那份副本，完全不接触源码。源码即使在 Linux 上返回
 * powershell 它也会通过。现改为调用真实导出的 resolveShellTool。
 */
describe('resolveShellTool', () => {
  it('win32 → powershell（bash 在 Windows 上有路径转义问题）', () => {
    expect(resolveShellTool('win32')).toBe('powershell');
  });

  it('linux → bash', () => {
    expect(resolveShellTool('linux')).toBe('bash');
  });

  it('darwin → bash', () => {
    expect(resolveShellTool('darwin')).toBe('bash');
  });

  it('未知平台回退到 bash', () => {
    expect(resolveShellTool('freebsd')).toBe('bash');
    expect(resolveShellTool('unknown-platform')).toBe('bash');
  });

  it('只对 win32 特殊处理，其他一律 bash', () => {
    const platforms = ['linux', 'darwin', 'freebsd', 'openbsd', 'sunos', 'aix', 'android'];
    for (const p of platforms) {
      expect(resolveShellTool(p)).toBe('bash');
    }
  });
});

describe('DEFAULT_TOOLS', () => {
  it('包含基础文件工具', () => {
    for (const t of ['read', 'write', 'edit']) {
      expect(DEFAULT_TOOLS).toContain(t);
    }
  });

  it('包含当前平台的 shell 工具', () => {
    expect(DEFAULT_TOOLS).toContain(resolveShellTool(platform()));
  });

  it('不含另一平台的 shell 工具', () => {
    const wrong = platform() === 'win32' ? 'bash' : 'powershell';
    expect(DEFAULT_TOOLS).not.toContain(wrong);
  });

  it('恰好 4 个工具，无重复', () => {
    expect(DEFAULT_TOOLS).toHaveLength(4);
    expect(new Set(DEFAULT_TOOLS).size).toBe(DEFAULT_TOOLS.length);
  });
});
