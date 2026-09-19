import { describe, it, expect } from 'vitest';
import {
  resolveToolsForTask,
  resolveShellTool,
  BASE_TOOLS,
} from '../../src/scheduler/pi-executor.js';

/**
 * 工具最小权限（feat/tool-least-privilege）
 *
 * 设计意图：writer/fixer 不应拥有 shell —— 因为 shell 提供了
 * 「统计字数」这个廉价测量手段，而测量手段是病理性校验循环
 * （measure → adjust → measure → ...）得以自持的必要条件。
 * 移除它，循环在物理上无法成立。
 *
 * reviewer 保留 shell：度量（判断篇幅是否达标）本就是它的职责。
 */
describe('resolveShellTool — 平台解析', () => {
  it('Linux 使用 bash', () => {
    expect(resolveShellTool('linux')).toBe('bash');
  });

  it('macOS 使用 bash', () => {
    expect(resolveShellTool('darwin')).toBe('bash');
  });

  it('Windows 使用 powershell', () => {
    expect(resolveShellTool('win32')).toBe('powershell');
  });

  it('其他平台回退到 bash', () => {
    expect(resolveShellTool('freebsd')).toBe('bash');
  });
});

describe('resolveToolsForTask — 角色最小权限', () => {
  describe('writer 不得拥有 shell', () => {
    it('Linux 上不含 bash', () => {
      const tools = resolveToolsForTask('writer', { platform: 'linux' });
      expect(tools).not.toContain('bash');
    });

    it('Windows 上不含 powershell', () => {
      const tools = resolveToolsForTask('writer', { platform: 'win32' });
      expect(tools).not.toContain('powershell');
    });

    it('任何平台都不含任何 shell', () => {
      for (const p of ['linux', 'darwin', 'win32', 'freebsd']) {
        const tools = resolveToolsForTask('writer', { platform: p });
        expect(tools).not.toContain('bash');
        expect(tools).not.toContain('powershell');
      }
    });

    it('保留读写能力', () => {
      const tools = resolveToolsForTask('writer', { platform: 'linux' });
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).toContain('edit');
    });
  });

  describe('fixer 不得拥有 shell', () => {
    it('任何平台都不含 shell', () => {
      for (const p of ['linux', 'darwin', 'win32']) {
        const tools = resolveToolsForTask('fixer', { platform: p });
        expect(tools).not.toContain('bash');
        expect(tools).not.toContain('powershell');
      }
    });

    it('保留读写能力', () => {
      const tools = resolveToolsForTask('fixer', { platform: 'linux' });
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).toContain('edit');
    });
  });

  describe('reviewer 保留 shell（度量是其职责）', () => {
    it('Linux 上含 bash', () => {
      const tools = resolveToolsForTask('reviewer', { platform: 'linux' });
      expect(tools).toContain('bash');
      expect(tools).not.toContain('powershell');
    });

    it('Windows 上含 powershell 而非 bash', () => {
      const tools = resolveToolsForTask('reviewer', { platform: 'win32' });
      expect(tools).toContain('powershell');
      expect(tools).not.toContain('bash');
    });

    it('保留读写能力', () => {
      const tools = resolveToolsForTask('reviewer', { platform: 'linux' });
      expect(tools).toContain('read');
      expect(tools).toContain('write');
    });
  });

  describe('显式覆盖优先', () => {
    it('override 完全取代角色默认值', () => {
      const tools = resolveToolsForTask('writer', {
        platform: 'linux',
        override: ['read', 'bash'],
      });
      expect(tools).toEqual(['read', 'bash']);
    });

    it('override 为 reviewr 也可收紧权限', () => {
      const tools = resolveToolsForTask('reviewer', {
        platform: 'linux',
        override: ['read', 'write'],
      });
      expect(tools).toEqual(['read', 'write']);
    });
  });

  describe('未知/未实现的角色回退到最小权限（fail-safe）', () => {
    it('未知类型不含 shell', () => {
      const tools = resolveToolsForTask('totally-unknown', { platform: 'linux' });
      expect(tools).not.toContain('bash');
      expect(tools).not.toContain('powershell');
      expect(tools).toEqual(BASE_TOOLS);
    });

    it('已声明但未实现的角色同样不含 shell', () => {
      for (const t of ['researcher', 'planner', 'diagram']) {
        const tools = resolveToolsForTask(t, { platform: 'linux' });
        expect(tools).not.toContain('bash');
        expect(tools).not.toContain('powershell');
      }
    });
  });

  describe('不变量', () => {
    const ALL_TYPES = [
      'writer', 'reviewer', 'fixer',
      'researcher', 'planner', 'diagram',
      'unknown-type',
    ];

    it('每个角色都必须能读能写', () => {
      for (const t of ALL_TYPES) {
        const tools = resolveToolsForTask(t, { platform: 'linux' });
        expect(tools, `角色 ${t} 缺少 read`).toContain('read');
        expect(tools, `角色 ${t} 缺少 write`).toContain('write');
      }
    });

    it('除 reviewer 外，任何角色都不得拥有 shell', () => {
      for (const t of ALL_TYPES) {
        if (t === 'reviewer') continue;
        const tools = resolveToolsForTask(t, { platform: 'linux' });
        expect(tools, `角色 ${t} 不应有 bash`).not.toContain('bash');
      }
    });

    it('返回值不含重复项', () => {
      for (const t of ALL_TYPES) {
        const tools = resolveToolsForTask(t, { platform: 'linux' });
        expect(new Set(tools).size, `角色 ${t} 有重复工具`).toBe(tools.length);
      }
    });
  });
});
