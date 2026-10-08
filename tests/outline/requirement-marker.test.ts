import { describe, it, expect } from 'vitest';
import { RequirementMarker } from '../../src/outline/requirement-marker.js';
import type { Requirement } from '../../src/outline/types.js';

describe('RequirementMarker', () => {
  describe('generateMarkerPrompt', () => {
    it('应该生成需求标记提示', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
          assignedChapter: 'ch004',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          category: 'functional',
          assignedChapter: 'ch004',
        },
      ];

      const prompt = RequirementMarker.generateMarkerPrompt(requirements, 'ch004');

      expect(prompt).toContain('需求标记');
      expect(prompt).toContain('REQ-001');
      expect(prompt).toContain('REQ-002');
      expect(prompt).toContain('用户登录');
      expect(prompt).toContain('数据导出');
    });

    it('应该包含标记格式说明', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];

      const prompt = RequirementMarker.generateMarkerPrompt(requirements, 'ch004');

      expect(prompt).toContain('<!-- requirement: REQ-001 -->');
      expect(prompt).toContain('标记格式');
    });

    it('应该在需求列表为空时返回空字符串', () => {
      const prompt = RequirementMarker.generateMarkerPrompt([], 'ch004');
      expect(prompt).toBe('');
    });

    it('应该只包含分配到当前章节的需求', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          assignedChapter: 'ch005',
        },
      ];

      const prompt = RequirementMarker.generateMarkerPrompt(requirements, 'ch004');

      expect(prompt).toContain('REQ-001');
      expect(prompt).not.toContain('REQ-002');
    });
  });

  describe('parseMarkers', () => {
    it('应该解析内容中的需求标记', () => {
      const content = `
# 用户登录功能

<!-- requirement: REQ-001 -->
本节实现用户登录功能，包括用户名密码登录和单点登录。

## 功能描述

<!-- requirement: REQ-002 -->
数据导出功能支持Excel和PDF格式。
`;

      const markers = RequirementMarker.parseMarkers(content);

      expect(markers.length).toBe(2);
      expect(markers[0].requirementId).toBe('REQ-001');
      expect(markers[0].lineNumber).toBeGreaterThan(0);
      expect(markers[1].requirementId).toBe('REQ-002');
    });

    it('应该在没有标记时返回空数组', () => {
      const content = `
# 用户登录功能

本节实现用户登录功能。
`;

      const markers = RequirementMarker.parseMarkers(content);

      expect(markers.length).toBe(0);
    });
  });

  describe('checkCoverage', () => {
    it('应该检查需求覆盖情况', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];

      const content = `
# 用户登录功能

<!-- requirement: REQ-001 -->
本节实现用户登录功能。
`;

      const coverage = RequirementMarker.checkCoverage(requirements, content, 'ch004');

      expect(coverage.totalRequirements).toBe(2);
      expect(coverage.coveredRequirements).toBe(1);
      expect(coverage.uncoveredRequirements.length).toBe(1);
      expect(coverage.uncoveredRequirements[0]).toBe('REQ-002');
    });

    it('应该在所有需求都被覆盖时返回成功', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];

      const content = `
# 用户登录功能

<!-- requirement: REQ-001 -->
本节实现用户登录功能。
`;

      const coverage = RequirementMarker.checkCoverage(requirements, content, 'ch004');

      expect(coverage.isComplete).toBe(true);
      expect(coverage.uncoveredRequirements.length).toBe(0);
    });
  });
});
