/**
 * Tests for image path adjuster
 * 
 * 处理 Markdown 中图片引用的相对路径。
 * 方案 B：在组装/定稿阶段集中替换。
 */
import { describe, it, expect } from 'vitest';
import {
  adjustImagePaths,
  type PathAdjustOptions,
} from '../../src/diagrams/path-adjuster.js';

describe('PathAdjuster', () => {
  describe('adjustImagePaths', () => {
    it('adjusts relative paths from drafts to assembly', () => {
      const content = `
# 章节内容

![架构图](../../figures/ch01-fig1.png)

更多文字...

![流程图](../../figures/ch01-fig2.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('../figures/ch01-fig1.png');
      expect(result).toContain('../figures/ch01-fig2.png');
      expect(result).not.toContain('../../figures');
    });

    it('adjusts relative paths from assembly to output', () => {
      const content = `
# 组装文档

![架构图](../figures/ch01-fig1.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'assembly',
        toDir: 'output',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      // output 和 assembly 同级，路径应该保持 ../figures
      expect(result).toContain('../figures/ch01-fig1.png');
    });

    it('handles absolute figure paths', () => {
      const content = `
# 章节内容

![架构图](figures/ch01-fig1.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('../figures/ch01-fig1.png');
    });

    it('preserves non-figure paths', () => {
      const content = `
# 章节内容

![外部图片](https://example.com/image.png)

![本地非图表](../assets/photo.jpg)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('https://example.com/image.png');
      expect(result).toContain('../assets/photo.jpg');
    });

    it('handles multiple images in same line', () => {
      const content = `
对比：![旧架构](../../figures/old.png) vs ![新架构](../../figures/new.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('../figures/old.png');
      expect(result).toContain('../figures/new.png');
    });

    it('handles images with Chinese alt text', () => {
      const content = `
![系统整体架构图](../../figures/ch01-fig1.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('![系统整体架构图](../figures/ch01-fig1.png)');
    });

    it('returns unchanged content when no images', () => {
      const content = `
# 纯文字章节

这段文字没有任何图片。
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toBe(content);
    });

    it('handles deeply nested paths', () => {
      const content = `
![图片](../../../../figures/ch01-fig1.png)
`;
      const options: PathAdjustOptions = {
        fromDir: 'drafts/chapters',
        toDir: 'assembly',
        figuresDir: 'figures',
      };

      const result = adjustImagePaths(content, options);

      expect(result).toContain('../figures/ch01-fig1.png');
    });
  });
});
