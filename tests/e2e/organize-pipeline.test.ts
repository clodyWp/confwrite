import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';
import { organizeMaterials } from '../../src/commands/organize.js';

describe('End-to-End: Init + Organize', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-e2e-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full pipeline: init project -> add materials -> organize', async () => {
    // Step 1: Initialize project
    const initResult = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    expect(initResult.success).toBe(true);
    const projectDir = join(tempDir, 'projects', 'test-project');

    // Step 2: Add sample materials
    const referenceDir = join(projectDir, 'reference_material');
    
    writeFileSync(
      join(referenceDir, 'api-spec.md'),
      `# API 规范文档

## 概述
本文档定义了系统的 API 接口规范。

## 性能指标
- 系统可用性: 99.99%
- 响应时间: < 100ms
- 并发用户数: 10000

## 接口定义
### 用户接口
- POST /api/users - 创建用户
- GET /api/users/:id - 获取用户信息
- PUT /api/users/:id - 更新用户信息

### 数据接口
- GET /api/data - 获取数据列表
- POST /api/data - 创建数据记录
`,
      'utf-8'
    );

    writeFileSync(
      join(referenceDir, 'architecture.md'),
      `# 系统架构设计

## 技术栈
- 前端: React + TypeScript
- 后端: Node.js + Express
- 数据库: PostgreSQL
- 缓存: Redis
- 消息队列: RabbitMQ

## 微服务架构
系统采用微服务架构，包含以下服务：
1. 用户服务 (User Service)
2. 数据服务 (Data Service)
3. 通知服务 (Notification Service)
4. 认证服务 (Auth Service)

## 部署要求
- 必须支持 Kubernetes 部署
- 需要实现自动扩缩容
- 数据存储容量 10TB
`,
      'utf-8'
    );

    writeFileSync(
      join(referenceDir, 'business-requirements.md'),
      `# 业务需求文档

## 项目背景
项目启动时间：2024年1月，预计2024年12月完成

## 核心需求
1. 系统必须支持多租户架构
2. 需要实现细粒度的权限控制
3. 必须支持实时数据同步
4. 需要满足等保三级安全要求

## 用户角色
- 系统管理员
- 部门管理员
- 普通用户
- 审计员

## 业务流程
用户注册 -> 身份验证 -> 权限分配 -> 业务操作 -> 审计日志
`,
      'utf-8'
    );

    // Step 3: Create outline
    writeFileSync(
      join(projectDir, 'outline.md'),
      `# 系统技术方案

## 1. 项目概述
ch001 1.1 项目背景与目标
ch002 1.2 系统范围与边界

## 2. 架构设计
ch003 2.1 整体架构
ch004 2.2 微服务划分
ch005 2.3 技术选型

## 3. 详细设计
ch006 3.1 用户服务设计
ch007 3.2 数据服务设计
ch008 3.3 通知服务设计

## 4. 部署方案
ch009 4.1 Kubernetes 部署架构
ch010 4.2 监控与告警

## 5. 安全设计
ch011 5.1 认证与授权
ch012 5.2 数据安全
`,
      'utf-8'
    );

    // Step 4: Organize materials
    const organizeResult = await organizeMaterials(projectDir);

    // Verify scan results
    expect(organizeResult.scanStats.total).toBe(3);
    expect(organizeResult.conversionStats.success).toBe(3);

    // Verify index
    expect(organizeResult.indexData.totalFiles).toBe(3);
    expect(organizeResult.indexData.categories.length).toBeGreaterThan(0);

    // Verify baseline extraction
    expect(organizeResult.baseline.sourceFiles).toBe(3);
    expect(Object.keys(organizeResult.baseline.metrics).length).toBeGreaterThan(0);
    expect(organizeResult.baseline.technicalTerms.length).toBeGreaterThan(0);

    // Verify chapter mappings
    expect(organizeResult.chapterMappings.length).toBe(12); // ch001-ch012

    // Verify chapter kits
    expect(organizeResult.kitStats.total).toBe(12);
    expect(organizeResult.kitStats.success).toBe(12);

    // Verify generated files
    expect(existsSync(join(projectDir, 'assets/indexes/index.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets/data-baseline.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets/references-index.md'))).toBe(true);

    // Verify chapter kit content
    for (let i = 1; i <= 12; i++) {
      const chapterId = `ch${String(i).padStart(3, '0')}`;
      const kitPath = join(projectDir, 'assets/chapter-kits', `${chapterId}.md`);
      expect(existsSync(kitPath)).toBe(true);

      const kitContent = readFileSync(kitPath, 'utf-8');
      expect(kitContent).toContain(chapterId);
      expect(kitContent).toContain('## 章节信息');
      expect(kitContent).toContain('## 写作提示');
    }

    // Verify index content
    const indexContent = JSON.parse(
      readFileSync(join(projectDir, 'assets/indexes/index.json'), 'utf-8')
    );
    expect(indexContent.totalFiles).toBe(3);
    expect(indexContent.files.length).toBe(3);

    // Verify baseline content
    const baselineContent = JSON.parse(
      readFileSync(join(projectDir, 'assets/data-baseline.json'), 'utf-8')
    );
    expect(baselineContent.sourceFiles).toBe(3);
    expect(baselineContent.technicalTerms).toContain('Kubernetes');
    expect(baselineContent.technicalTerms).toContain('PostgreSQL');
    expect(baselineContent.technicalTerms).toContain('Redis');

    // Verify references index
    const referencesIndex = readFileSync(
      join(projectDir, 'assets/references-index.md'),
      'utf-8'
    );
    expect(referencesIndex).toContain('# 参考资料索引');
    expect(referencesIndex).toContain('api-spec.md');
    expect(referencesIndex).toContain('architecture.md');
    expect(referencesIndex).toContain('business-requirements.md');
  });

  it('handles project with no materials gracefully', async () => {
    // Initialize project without adding materials
    const initResult = initProject({
      slug: 'empty-project',
      workspaceDir: tempDir,
    });

    expect(initResult.success).toBe(true);
    const projectDir = join(tempDir, 'projects', 'empty-project');

    // Organize should succeed with empty results
    const organizeResult = await organizeMaterials(projectDir);

    expect(organizeResult.scanStats.total).toBe(0);
    expect(organizeResult.indexData.totalFiles).toBe(0);
    expect(organizeResult.chapterMappings.length).toBe(0);
    expect(organizeResult.kitStats.total).toBe(0);
  });

  it('handles project with materials but no outline', async () => {
    // Initialize project
    const initResult = initProject({
      slug: 'no-outline-project',
      workspaceDir: tempDir,
    });

    expect(initResult.success).toBe(true);
    const projectDir = join(tempDir, 'projects', 'no-outline-project');

    // Add materials
    writeFileSync(
      join(projectDir, 'reference_material', 'doc.md'),
      '# 测试文档\n\n这是一份测试文档。\n',
      'utf-8'
    );

    // Organize should still work (no outline to remove)
    const organizeResult = await organizeMaterials(projectDir);

    expect(organizeResult.scanStats.total).toBe(1);
    expect(organizeResult.indexData.totalFiles).toBe(1);
    expect(organizeResult.chapterMappings.length).toBe(0); // No outline, no mappings
    expect(organizeResult.kitStats.total).toBe(0);
  });

  it('preserves data consistency across multiple organizes', async () => {
    // Initialize project
    const initResult = initProject({
      slug: 'consistency-project',
      workspaceDir: tempDir,
    });

    expect(initResult.success).toBe(true);
    const projectDir = join(tempDir, 'projects', 'consistency-project');

    // Add materials
    writeFileSync(
      join(projectDir, 'reference_material', 'spec.md'),
      '# 规格说明\n\n性能指标: 99.9% 可用性\n',
      'utf-8'
    );

    // First organize
    const result1 = await organizeMaterials(projectDir);

    // Second organize (should produce same results)
    const result2 = await organizeMaterials(projectDir);

    expect(result1.scanStats.total).toBe(result2.scanStats.total);
    expect(result1.indexData.totalFiles).toBe(result2.indexData.totalFiles);
    expect(result1.baseline.sourceFiles).toBe(result2.baseline.sourceFiles);
    expect(result1.chapterMappings.length).toBe(result2.chapterMappings.length);
  });
});
