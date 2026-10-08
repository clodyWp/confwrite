import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ChapterState } from '../../src/state/schema.js';
import type { ProjectState } from '../../src/state/schema.js';

describe('ChapterState Extension', () => {
  describe('新增字段验证', () => {
    it('应该接受包含所有新字段的完整章节状态', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        // 新增字段
        type: 'overview',
        wordBudget: { min: 5000, max: 8000 },
        importance: 3,
        description: '本章介绍项目背景和目标',
        style: 'overview'
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该接受不包含新字段的章节状态（向后兼容）', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该验证type字段为字符串', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        type: 'architecture'
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该验证wordBudget字段结构', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        wordBudget: { min: 10000, max: 15000 }
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该验证importance字段为1-5的数字', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        importance: 5
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该验证description字段为字符串', () => {
      const chapter = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        description: '本章介绍项目背景和目标'
      };

      const isValid = Value.Check(ChapterState, chapter);
      expect(isValid).toBe(true);
    });

    it('应该验证style字段为可选字符串', () => {
      const chapterWithStyle = {
        id: 'ch001',
        title: '项目概述',
        status: 'pending' as const,
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        style: 'functional'
      };

      const isValid = Value.Check(ChapterState, chapterWithStyle);
      expect(isValid).toBe(true);
    });
  });

  describe('ProjectState集成', () => {
    it('应该接受包含扩展字段的章节的ProjectState', () => {
      const state: ProjectState = {
        version: 1,
        project: 'test-project',
        projectDir: '/tmp/test',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        currentPhase: '0a',
        status: 'init',
        chapters: {
          'ch001': {
            id: 'ch001',
            title: '项目概述',
            status: 'pending',
            version: 0,
            round: 1,
            attempt: 0,
            consecutiveFailures: 0,
            maxRounds: 5,
            type: 'overview',
            wordBudget: { min: 5000, max: 8000 },
            importance: 3,
            description: '本章介绍项目背景和目标'
          },
          'ch002': {
            id: 'ch002',
            title: '需求分析',
            status: 'pending',
            version: 0,
            round: 1,
            attempt: 0,
            consecutiveFailures: 0,
            maxRounds: 5,
            type: 'requirements',
            wordBudget: { min: 8000, max: 12000 },
            importance: 4,
            description: '本章分析系统需求'
          }
        },
        round: 1
      };

      // 验证字段存在
      expect(state.chapters['ch001'].type).toBe('overview');
      expect(state.chapters['ch001'].wordBudget).toEqual({ min: 5000, max: 8000 });
      expect(state.chapters['ch001'].importance).toBe(3);
      expect(state.chapters['ch001'].description).toBe('本章介绍项目背景和目标');
      
      expect(state.chapters['ch002'].type).toBe('requirements');
      expect(state.chapters['ch002'].wordBudget).toEqual({ min: 8000, max: 12000 });
      expect(state.chapters['ch002'].importance).toBe(4);
      expect(state.chapters['ch002'].description).toBe('本章分析系统需求');
    });
  });
});
