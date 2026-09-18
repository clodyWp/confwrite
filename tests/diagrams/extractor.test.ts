/**
 * Tests for diagram extractor
 * 
 * 支持 4 种输入格式：
 * 1. diagram-start/end 标记（语义标记）
 * 2. Mermaid 语法
 * 3. YAML 结构
 * 4. 步骤描述
 * 5. ASCII art
 */
import { describe, it, expect } from 'vitest';
import {
  extractDiagrams,
  detectFormat,
  type DiagramBlock,
  type DiagramFormat,
} from '../../src/diagrams/extractor.js';

describe('DiagramExtractor', () => {
  describe('extractDiagrams', () => {
    it('extracts diagram-start blocks', () => {
      const content = `
# 系统架构

本系统采用三层架构设计。

<!-- diagram-start
type: architecture
title: 系统整体架构
description: |
  三层架构：
  - 客户端层：Web 浏览器、移动端 App
  - 服务层：API Gateway、用户服务
  - 数据层：MySQL、Redis
  连接关系：
  - 客户端 → API Gateway（HTTP）
  - API Gateway → 微服务（gRPC）
diagram-end -->

从架构图可以看出，系统采用了分层设计...
`;
      const blocks = extractDiagrams(content, 'ch01');
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('architecture');
      expect(blocks[0].title).toBe('系统整体架构');
      expect(blocks[0].chapterId).toBe('ch01');
      expect(blocks[0].index).toBe(0);
      expect(blocks[0].description).toContain('三层架构');
    });

    it('extracts multiple diagram blocks', () => {
      const content = `
# 章节内容

<!-- diagram-start
type: flow
title: 流程图 1
description: |
  步骤 A → 步骤 B → 步骤 C
diagram-end -->

中间文字...

<!-- diagram-start
type: architecture
title: 架构图 2
description: |
  模块 A + 模块 B
diagram-end -->
`;
      const blocks = extractDiagrams(content, 'ch02');
      
      expect(blocks).toHaveLength(2);
      expect(blocks[0].title).toBe('流程图 1');
      expect(blocks[0].index).toBe(0);
      expect(blocks[1].title).toBe('架构图 2');
      expect(blocks[1].index).toBe(1);
    });

    it('returns empty array when no diagrams', () => {
      const content = `
# 普通章节

这段文字没有任何图表。
`;
      const blocks = extractDiagrams(content, 'ch03');
      expect(blocks).toHaveLength(0);
    });

    it('handles missing optional fields', () => {
      const content = `
<!-- diagram-start
description: |
  简单的描述
diagram-end -->
`;
      const blocks = extractDiagrams(content, 'ch04');
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('diagram'); // 默认值
      expect(blocks[0].title).toBe('图表'); // 默认值
    });
  });

  describe('detectFormat', () => {
    it('detects mermaid format', () => {
      expect(detectFormat('[A] --> [B]')).toBe('mermaid');
      expect(detectFormat('[客户端] --> [服务器]')).toBe('mermaid');
      expect(detectFormat('graph TD\n  A --> B')).toBe('mermaid');
      expect(detectFormat('subgraph 服务层')).toBe('mermaid');
    });

    it('detects yaml format', () => {
      expect(detectFormat('layout:\n  - layer: 应用层')).toBe('yaml');
      expect(detectFormat('items:\n  - 节点A')).toBe('yaml');
      expect(detectFormat('steps:\n  - 第一步')).toBe('yaml');
    });

    it('detects steps format', () => {
      expect(detectFormat('1. 步骤A → 步骤B')).toBe('steps');
      expect(detectFormat('1. 上传 → 2. 验证 → 3. 存储')).toBe('steps');
    });

    it('detects ascii format', () => {
      expect(detectFormat('┌─────────┐\n│  模块A  │\n└─────────┘')).toBe('ascii');
      expect(detectFormat('┌───┐ │ 文本 │ └───┘')).toBe('ascii');
    });

    it('returns unknown for unrecognized format', () => {
      expect(detectFormat('这是一段普通文字')).toBe('unknown');
      expect(detectFormat('模块A 连接到 模块B')).toBe('unknown');
    });
  });

  describe('DiagramBlock structure', () => {
    it('has all required fields', () => {
      const content = `
<!-- diagram-start
type: flow
title: 测试图表
description: |
  测试描述
diagram-end -->
`;
      const blocks = extractDiagrams(content, 'ch01');
      const block = blocks[0];
      
      expect(block).toHaveProperty('chapterId');
      expect(block).toHaveProperty('index');
      expect(block).toHaveProperty('type');
      expect(block).toHaveProperty('title');
      expect(block).toHaveProperty('description');
      expect(block).toHaveProperty('rawContent');
      expect(block).toHaveProperty('format');
    });
  });
});
