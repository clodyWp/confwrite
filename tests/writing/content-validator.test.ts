/**
 * ContentValidator - 内容深度验证器测试
 * 
 * TDD: 先写测试，确认失败，再写实现
 * 
 * 验证 Writer 输出是否符合：
 * 1. 每个子节（## 或 ### 下）整体 ≥ 5000 字
 * 2. 图表前后有描述/总结段落
 * （段落级 300 字检查已移除，见 Bug 4/5/6 修复）
 */
import { describe, it, expect } from 'vitest';
import { ContentValidator, type ValidationResult } from '../../src/writing/content-validator.js';

describe('ContentValidator', () => {
  describe('validateSectionLength', () => {
    it('子节 ≥ 5000 字时通过', () => {
      // 生成多个段落，每个段落用空行分隔，总字数超过 5000
      const para1 = '这是一段很长的内容，用于测试子节长度验证功能，需要生成足够多的文字。'.repeat(200);
      const para2 = '这是另一段内容，继续填充文字以满足字数要求，确保超过5000字。'.repeat(200);
      const content = `# 章节标题

## 子节1

${para1}

${para2}
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.sectionLengthValid).toBe(true);
    });

    it('子节 < 5000 字时失败', () => {
      const content = `# 章节标题

## 子节1

这是很短的内容。
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.sectionLengthValid).toBe(false);
      expect(result.shortSections.length).toBeGreaterThan(0);
    });
  });

  describe('paragraphLengthValid (Bug 4/5/6 fix)', () => {
    it('始终为 true，不再检查段落级 300 字', () => {
      const content = `# 章节标题

## 子节1

这是短段落。

这也是短段落。
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.paragraphLengthValid).toBe(true);
      expect(result.shortParagraphs).toEqual([]);
    });
  });

  describe('validateDiagramFormat', () => {
    it('图表前后有描述/总结时通过', () => {
      // 图表前的描述段落（直接是长段落，不要有短段落）
      const beforeText = '这是一段描述性文字，用于说明图表的内容和背景，展示系统架构的设计理念，下面就是架构图。'.repeat(10);
      // 图表后的总结段落
      const afterText = '从图中可以看出，这是一个简单的流程，展示了系统各组件之间的关系，总结了架构的优势和特点。'.repeat(10);
      const content = `# 章节标题

## 子节1

${beforeText}

<!-- diagram-start
type: flow
title: 流程图
containers:
  - id: c1
    label: 主流程
    nodes: [a, b]
nodes:
  - id: a
    label: 开始
    container: c1
  - id: b
    label: 结束
    container: c1
edges:
  - from: a
    to: b
diagram-end -->

${afterText}
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.diagramFormatValid).toBe(true);
    });

    it('mermaid 代码块直接报错（已废弃）', () => {
    const validator = new ContentValidator();
    const result = validator.validate('# 标题\n\n\`\`\`mermaid\ngraph TD\n    A --> B\n\`\`\`\n');
    expect(result.diagramFormatValid).toBe(false);
    expect(result.diagramIssues.some(i => i.issue.includes('mermaid'))).toBe(true);
  });

  it('图表前没有描述时失败', () => {
      const content = `# 章节标题

## 子节1

<!-- diagram-start
type: flow
title: 流程图
containers:
  - id: c1
    label: 主流程
    nodes: [a, b]
nodes:
  - id: a
    label: 开始
    container: c1
  - id: b
    label: 结束
    container: c1
edges:
  - from: a
    to: b
diagram-end -->
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.diagramFormatValid).toBe(false);
      expect(result.diagramIssues.length).toBeGreaterThan(0);
    });
  });

  describe('validate (综合)', () => {
    it('返回完整验证结果', () => {
      const content = `# 章节标题

## 子节1

短内容。
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      
      expect(result).toHaveProperty('sectionLengthValid');
      expect(result).toHaveProperty('paragraphLengthValid');
      expect(result).toHaveProperty('diagramFormatValid');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('shortSections');
      expect(result).toHaveProperty('shortParagraphs');
      expect(result).toHaveProperty('diagramIssues');
    });

    it('所有内容符合要求时 isValid 为 true', () => {
      // 生成足够长的段落，超过 5000 字
      // 段落级 300 字检查已移除，短段落不影响 isValid
      const para1 = '这是一段足够长的描述性文字，用于填充内容并满足长度要求，需要生成足够多的文字。'.repeat(200);
      const para2 = '这是另一段足够长的内容，继续填充文字以满足所有验证要求。'.repeat(200);
      const content = `# 章节标题

## 子节1

${para1}

${para2}
`;
      const validator = new ContentValidator();
      const result = validator.validate(content);
      expect(result.isValid).toBe(true);
      expect(result.paragraphLengthValid).toBe(true);
    });
  });
});
