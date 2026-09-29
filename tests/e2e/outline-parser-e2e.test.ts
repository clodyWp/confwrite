/**
 * E2E 测试：大纲解析边界情况
 * 
 * 回归防护：
 * - Bug 48: 多个同级 # 标题导致章节丢失
 * 
 * 测试场景：
 * - 多个 # 标题
 * - 混合 ## 和 ###
 * - 空章节
 * - 特殊字符标题
 * - 无 ch 标记
 */
import { describe, it, expect } from 'vitest';
import { OutlineParser } from '../../src/organize/outline-parser.js';

describe('E2E: 大纲解析边界情况', () => {
  describe('Bug 48 回归防护：多个同级 # 标题', () => {
    it('多个 # 标题不会丢失章节', () => {
      const content = `# 一、项目概述

## 1.1 背景
ch001 项目背景
ch002 需求分析

# 二、技术方案

## 2.1 架构设计
ch003 总体架构
ch004 详细设计

# 三、实施计划

## 3.1 时间线
ch005 里程碑
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(5);
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003', 'ch004', 'ch005']);
    });

    it('三个 # 标题也能正确解析', () => {
      const content = `# 第一部分

ch001 章节一
ch002 章节二

# 第二部分

ch003 章节三

# 第三部分

ch004 章节四
ch005 章节五
ch006 章节六
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(6);
    });

    it('# 标题下直接跟 ch 标记（无 ## 层级）', () => {
      const content = `# 概述

ch001 项目背景

# 技术

ch002 架构设计
ch003 数据库设计
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(3);
    });
  });

  describe('混合层级', () => {
    it('混合 ## 和 ### 层级', () => {
      const content = `# 技术方案

## 1. 概述
ch001 项目概述

## 2. 架构设计
### 2.1 总体架构
ch002 架构总览
### 2.2 详细设计
ch003 模块设计

## 3. 部署方案
ch004 部署架构
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(4);
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003', 'ch004']);
    });

    it('深层嵌套（#### 层级）', () => {
      const content = `# 文档

## 一级
### 二级
#### 三级
ch001 深层章节
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(1);
      expect(chapters[0].id).toBe('ch001');
    });
  });

  describe('特殊字符', () => {
    it('中文标题', () => {
      const content = `# 智慧园区综合管理平台

## 一、项目概述
ch001 项目背景与目标

## 二、技术方案
ch002 架构设计
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(2);
    });

    it('标题包含特殊字符（括号、冒号、破折号）', () => {
      const content = `# 技术方案（v2.0）

## 1. 概述：项目背景
ch001 项目概述

## 2. 架构 —— 总体设计
ch002 架构设计
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(2);
    });

    it('标题包含数字和点号', () => {
      const content = `# 1.0 版本文档

## 1.1 第一章
ch001 内容一

## 2.0 第二章
ch002 内容二
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(2);
    });
  });

  describe('边界情况', () => {
    it('空大纲', () => {
      const content = '';

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(0);
    });

    it('只有标题没有 ch 标记', () => {
      const content = `# 文档标题

## 第一章

## 第二章

## 第三章
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(0);
    });

    it('ch 标记格式变体', () => {
      const content = `# 文档

## 章节一
ch001 概述
ch002: 详细说明
ch003 - 带破折号
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      // 应该能识别各种 ch 标记格式
      expect(chapters.length).toBeGreaterThanOrEqual(1);
    });

    it('大量章节（压力测试）', () => {
      const lines = ['# 大文档', ''];
      for (let i = 1; i <= 100; i++) {
        lines.push(`## ${i}. 章节${i}`);
        lines.push(`ch${String(i).padStart(3, '0')} 内容${i}`);
      }
      const content = lines.join('\n');

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(100);
    });

    it('章节编号不连续', () => {
      const content = `# 文档

## 1. 概述
ch001 项目概述

## 5. 架构
ch005 架构设计

## 10. 部署
ch010 部署方案
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(3);
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch005', 'ch010']);
    });
  });

  describe('真实场景', () => {
    it('sylmerp2 风格大纲（230 章节，多个 # 标题）', () => {
      // 模拟 sylmerp2 项目的大纲结构
      const lines = ['# 企业资源管理系统技术方案', ''];
      
      // 10 个大部分，每部分 23 章
      const parts = ['项目概述', '需求分析', '架构设计', '功能模块', '数据库设计', 
                     '接口设计', '安全方案', '部署方案', '运维方案', '售后服务'];
      
      let chNum = 1;
      for (const part of parts) {
        lines.push(`# ${part}`);
        lines.push('');
        for (let i = 0; i < 23; i++) {
          lines.push(`## ${part}${i + 1}`);
          lines.push(`ch${String(chNum).padStart(3, '0')} ${part}详细内容${i + 1}`);
          chNum++;
        }
        lines.push('');
      }
      
      const content = lines.join('\n');

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      // 应该解析出所有 230 章
      expect(chapters).toHaveLength(230);
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[229].id).toBe('ch230');
    });
  });
});
