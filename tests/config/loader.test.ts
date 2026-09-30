import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, mergeConfig, DEFAULT_CONFIG, type ConfWriteConfig } from '../../src/config/loader.js';

describe('Config Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `confwrite-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.writing.minChapterChars).toBe(8000);
      expect(DEFAULT_CONFIG.writing.maxRounds).toBe(5);
      expect(DEFAULT_CONFIG.review.acceptMediumMax).toBe(3);
      expect(DEFAULT_CONFIG.review.rejectHighMin).toBe(3);
      expect(DEFAULT_CONFIG.scheduler.maxConcurrency).toBe(1);
      expect(DEFAULT_CONFIG.scheduler.maxTurnsPerTask).toBe(40);
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no file exists', () => {
      const config = loadConfig(tempDir);
      expect(config.writing.minChapterChars).toBe(8000);
      expect(config.scheduler.maxConcurrency).toBe(1);
    });

    it('should load and merge config from file', () => {
      writeFileSync(join(tempDir, 'confwrite.config.json'), JSON.stringify({
        writing: { minChapterChars: 5000 },
        scheduler: { maxConcurrency: 3 }
      }));

      const config = loadConfig(tempDir);
      expect(config.writing.minChapterChars).toBe(5000);
      expect(config.writing.maxRounds).toBe(5); // default
      expect(config.scheduler.maxConcurrency).toBe(3);
    });

    it('should handle partial config sections', () => {
      writeFileSync(join(tempDir, 'confwrite.config.json'), JSON.stringify({
        writing: { minChapterChars: 6000 }
      }));

      const config = loadConfig(tempDir);
      expect(config.writing.minChapterChars).toBe(6000);
      expect(config.review.acceptMediumMax).toBe(3); // default
    });

    it('should ignore unknown fields', () => {
      writeFileSync(join(tempDir, 'confwrite.config.json'), JSON.stringify({
        writing: { minChapterChars: 5000, unknownField: 'ignored' },
        unknownSection: { foo: 'bar' }
      }));

      const config = loadConfig(tempDir);
      expect(config.writing.minChapterChars).toBe(5000);
      expect((config as any).unknownSection).toBeUndefined();
    });

    it('should throw on invalid config file', () => {
      writeFileSync(join(tempDir, 'confwrite.config.json'), 'invalid json');
      
      expect(() => loadConfig(tempDir)).toThrow();
    });

    it('should validate config values', () => {
      writeFileSync(join(tempDir, 'confwrite.config.json'), JSON.stringify({
        writing: { minChapterChars: -100 } // invalid: negative
      }));

      expect(() => loadConfig(tempDir)).toThrow();
    });
  });

  describe('mergeConfig', () => {
    it('should deep merge config objects', () => {
      const base: ConfWriteConfig = { ...DEFAULT_CONFIG };
      const override: Partial<ConfWriteConfig> = {
        writing: { minChapterChars: 5000 }
      };

      const merged = mergeConfig(base, override);
      expect(merged.writing.minChapterChars).toBe(5000);
      expect(merged.writing.maxRounds).toBe(5);
    });

    it('should not mutate original config', () => {
      const base: ConfWriteConfig = { ...DEFAULT_CONFIG };
      const override: Partial<ConfWriteConfig> = {
        writing: { minChapterChars: 5000 }
      };

      mergeConfig(base, override);
      expect(base.writing.minChapterChars).toBe(8000);
    });
  });
});
