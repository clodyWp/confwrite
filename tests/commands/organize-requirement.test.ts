import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { organizeMaterials } from '../../src/commands/organize.js';

describe('organize command - requirement map integration', () => {
  const testDir = join(process.cwd(), '.test-organize-integration');
  const inputsDir = join(testDir, 'inputs');
  const referenceDir = join(testDir, 'reference_material');
  const assetsDir = join(testDir, 'assets');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(inputsDir, { recursive: true });
    mkdirSync(referenceDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate requirement-map.json when outline has requirementSource', async () => {
    // 创建需求文档
    const requirementsContent = `# 项目需求文档

## 1. 项目概述

### 1.1 项目背景

本项目旨在建设一个资产管理系统，实现资产全生命周期管理。

### 1.2 项目目标

提高资产管理效率，降低运营成本。

## 2. 功能需求

### 2.1 计划管理

实现计划单快速编制，提供单据查询、变更调整、版本管控。
`;

    writeFileSync(join(inputsDir, 'requirements.md'), requirementsContent, 'utf-8');

    // 创建参考资料
    writeFileSync(
      join(referenceDir, 'reference.md'),
      '# 参考资料\n\n这是一些领域知识。',
      'utf-8'
    );

    // 创建大纲（包含需求来源）
    const outlineContent = `# 测试文档

ch001 项目背景
需求来源: §1.1
本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字
本节涵盖项目背景相关内容。

ch002 计划管理
需求来源: §2.1
本章类型: functional。重要度: 4/5。
字数预算: 5000-8000字
本节涵盖计划管理相关内容。
`;

    writeFileSync(join(testDir, 'outline.md'), outlineContent, 'utf-8');

    // 运行 organize
    const result = await organizeMaterials(testDir);

    // 验证 requirement-map.json 已生成
    const mapPath = join(assetsDir, 'requirement-map.json');
    expect(existsSync(mapPath)).toBe(true);

    const requirementMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
    expect(requirementMap['ch001']).toBeDefined();
    expect(requirementMap['ch001'].sections).toContain('1.1');
    expect(requirementMap['ch001'].content).toContain('资产管理系统');

    expect(requirementMap['ch002']).toBeDefined();
    expect(requirementMap['ch002'].sections).toContain('2.1');
    expect(requirementMap['ch002'].content).toContain('计划单快速编制');
  });

  it('should inject requirement content into material kits', async () => {
    // 创建需求文档
    const requirementsContent = `# 需求文档

## 1. 概述

### 1.1 背景

测试背景内容...
`;

    writeFileSync(join(inputsDir, 'requirements.md'), requirementsContent, 'utf-8');

    // 创建参考资料
    writeFileSync(
      join(referenceDir, 'reference.md'),
      '# 参考资料\n\n领域知识。',
      'utf-8'
    );

    // 创建大纲
    const outlineContent = `# 测试文档

ch001 背景
需求来源: §1.1
本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字
本节涵盖背景相关内容。
`;

    writeFileSync(join(testDir, 'outline.md'), outlineContent, 'utf-8');

    // 运行 organize
    await organizeMaterials(testDir);

    // 验证素材包包含需求内容
    const kitPath = join(assetsDir, 'chapter-kits', 'ch001.md');
    expect(existsSync(kitPath)).toBe(true);

    const kitContent = readFileSync(kitPath, 'utf-8');
    expect(kitContent).toContain('需求要点');
    expect(kitContent).toContain('测试背景内容');
  });
});
