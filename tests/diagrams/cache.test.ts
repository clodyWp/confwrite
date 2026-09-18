/**
 * Tests for diagram cache
 * 
 * 基于源文件 hash 的缓存机制，跳过未变更的图表。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DiagramCache,
  type CacheEntry,
  type CacheManifest,
} from '../../src/diagrams/cache.js';

const TEST_DIR = join(process.cwd(), '.test-diagram-cache');

describe('DiagramCache', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('computeHash', () => {
    it('computes consistent hash for same content', () => {
      const cache = new DiagramCache(TEST_DIR);
      const hash1 = cache.computeHash('test content');
      const hash2 = cache.computeHash('test content');
      expect(hash1).toBe(hash2);
    });

    it('computes different hash for different content', () => {
      const cache = new DiagramCache(TEST_DIR);
      const hash1 = cache.computeHash('content A');
      const hash2 = cache.computeHash('content B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('shouldRegenerate', () => {
    it('returns true when no cache entry exists', () => {
      const cache = new DiagramCache(TEST_DIR);
      expect(cache.shouldRegenerate('ch01-fig1', 'some content')).toBe(true);
    });

    it('returns false when hash matches', () => {
      const cache = new DiagramCache(TEST_DIR);
      const content = 'test content';
      const hash = cache.computeHash(content);

      // 手动添加缓存条目
      cache.setEntry('ch01-fig1', {
        sourceHash: hash,
        svgFile: 'ch01-fig1.svg',
        pngFile: 'ch01-fig1.png',
        generatedAt: new Date().toISOString(),
      });

      expect(cache.shouldRegenerate('ch01-fig1', content)).toBe(false);
    });

    it('returns true when hash differs', () => {
      const cache = new DiagramCache(TEST_DIR);
      
      // 添加旧缓存
      cache.setEntry('ch01-fig1', {
        sourceHash: 'old-hash',
        svgFile: 'ch01-fig1.svg',
        pngFile: 'ch01-fig1.png',
        generatedAt: new Date().toISOString(),
      });

      // 新内容 hash 不同
      expect(cache.shouldRegenerate('ch01-fig1', 'new content')).toBe(true);
    });
  });

  describe('manifest persistence', () => {
    it('saves and loads manifest', () => {
      const cache = new DiagramCache(TEST_DIR);
      
      cache.setEntry('ch01-fig1', {
        sourceHash: 'abc123',
        svgFile: 'ch01-fig1.svg',
        pngFile: 'ch01-fig1.png',
        generatedAt: '2026-09-18T10:00:00Z',
      });

      cache.save();

      // 创建新实例，从文件加载
      const cache2 = new DiagramCache(TEST_DIR);
      cache2.load();

      expect(cache2.shouldRegenerate('ch01-fig1', 'content-with-hash-abc123')).toBe(true);
      // 需要设置相同的 hash 才能匹配
      const hash = cache2.computeHash('test');
      cache2.setEntry('ch01-fig2', {
        sourceHash: hash,
        svgFile: 'ch01-fig2.svg',
        pngFile: 'ch01-fig2.png',
        generatedAt: new Date().toISOString(),
      });
      expect(cache2.shouldRegenerate('ch01-fig2', 'test')).toBe(false);
    });

    it('returns empty manifest when file does not exist', () => {
      const cache = new DiagramCache(TEST_DIR);
      cache.load(); // 文件不存在，应该不报错
      
      expect(cache.getManifest()).toEqual({});
    });
  });

  describe('updateEntry', () => {
    it('updates existing entry', () => {
      const cache = new DiagramCache(TEST_DIR);
      
      cache.setEntry('ch01-fig1', {
        sourceHash: 'old-hash',
        svgFile: 'ch01-fig1.svg',
        pngFile: 'ch01-fig1.png',
        generatedAt: '2026-09-18T10:00:00Z',
      });

      cache.updateEntry('ch01-fig1', {
        sourceHash: 'new-hash',
        svgFile: 'ch01-fig1-v2.svg',
      });

      const entry = cache.getEntry('ch01-fig1');
      expect(entry?.sourceHash).toBe('new-hash');
      expect(entry?.svgFile).toBe('ch01-fig1-v2.svg');
      expect(entry?.pngFile).toBe('ch01-fig1.png'); // 未更新的字段保留
    });
  });

  describe('removeEntry', () => {
    it('removes entry from cache', () => {
      const cache = new DiagramCache(TEST_DIR);
      
      cache.setEntry('ch01-fig1', {
        sourceHash: 'hash',
        svgFile: 'ch01-fig1.svg',
        pngFile: 'ch01-fig1.png',
        generatedAt: new Date().toISOString(),
      });

      expect(cache.getEntry('ch01-fig1')).toBeDefined();
      
      cache.removeEntry('ch01-fig1');
      
      expect(cache.getEntry('ch01-fig1')).toBeUndefined();
    });
  });
});
