import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { ConfWriteConfig } from '../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../src/config/loader.js';
import type { Task } from '../../src/scheduler/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-output-validator-soft-gate-test-'));
}

describe('OutputValidator - Soft Gate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    // 创建必要的目录结构
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validate with soft gate', () => {
    it('应该在字数达到硬门控时accept', () => {
      const config: ConfWriteConfig = {
        ...DEFAULT_CONFIG,
        writing: {
          ...DEFAULT_CONFIG.writing,
          minChapterChars: 8000,
          minChapterCharsTolerance: 0.1,
        },
      };
      
      const validator = new OutputValidator(tempDir, config);
      const content = 'a'.repeat(8500); // 超过硬门控
      
      // 创建草稿文件
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), content, 'utf-8');
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true);
    });

    it('应该在字数达到软门控但未达硬门控时accept', () => {
      const config: ConfWriteConfig = {
        ...DEFAULT_CONFIG,
        writing: {
          ...DEFAULT_CONFIG.writing,
          minChapterChars: 8000,
          minChapterCharsTolerance: 0.1,
        },
      };
      
      const validator = new OutputValidator(tempDir, config);
      const content = 'a'.repeat(7500); // 达到软门控（7200），未达硬门控（8000）
      
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), content, 'utf-8');
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true);
    });

    it('应该在字数未达到软门控时reject', () => {
      const config: ConfWriteConfig = {
        ...DEFAULT_CONFIG,
        writing: {
          ...DEFAULT_CONFIG.writing,
          minChapterChars: 8000,
          minChapterCharsTolerance: 0.1,
        },
      };
      
      const validator = new OutputValidator(tempDir, config);
      const content = 'a'.repeat(6000); // 未达到软门控（7200）
      
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), content, 'utf-8');
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('字数不足');
    });

    it('应该使用配置的容差计算软门控', () => {
      const config: ConfWriteConfig = {
        ...DEFAULT_CONFIG,
        writing: {
          ...DEFAULT_CONFIG.writing,
          minChapterChars: 10000,
          minChapterCharsTolerance: 0.2, // 20%容差
        },
      };
      
      const validator = new OutputValidator(tempDir, config);
      const content = 'a'.repeat(8500); // 软门控=8000，硬门控=10000
      
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), content, 'utf-8');
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true); // 8500 >= 8000（软门控）
    });

    it('应该在容差为0时软门控等于硬门控', () => {
      const config: ConfWriteConfig = {
        ...DEFAULT_CONFIG,
        writing: {
          ...DEFAULT_CONFIG.writing,
          minChapterChars: 8000,
          minChapterCharsTolerance: 0,
        },
      };
      
      const validator = new OutputValidator(tempDir, config);
      const content = 'a'.repeat(7999); // 未达到硬门控
      
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), content, 'utf-8');
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
    });
  });
});
