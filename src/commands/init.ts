/**
 * /confwrite:init — Project initialization command
 * 
 * Creates the project directory structure, initializes state,
 * and generates template files.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateSlug, normalizePath } from '../utils/paths.js';
import { ProjectStore } from '../state/store.js';
import type { ProjectState } from '../state/schema.js';

export interface InitOptions {
  slug: string;
  workspaceDir: string;
  materialSourceDir?: string;
  requirementsPath?: string;
}

export interface InitResult {
  success: boolean;
  projectDir: string;
  slug: string;
  message: string;
}

export function initProject(options: InitOptions): InitResult {
  const { slug, workspaceDir } = options;

  validateSlug(slug);

  const projectDir = resolve(workspaceDir, 'projects', slug);

  if (existsSync(projectDir)) {
    return {
      success: false,
      projectDir: normalizePath(projectDir),
      slug,
      message: `项目 "${slug}" 已存在: ${normalizePath(projectDir)}`,
    };
  }

  // Create directory structure
  const dirs = [
    '',
    'inputs',
    'inputs/feedback',
    'reference_material',
    'assets',
    'assets/indexes',
    'assets/chapter-kits',
    'assets/excerpts',
    'assets/generated',
    'drafts',
    'drafts/chapters',
    'review',
    'figures',
    'assembly',
    'output',
  ];

  for (const dir of dirs) {
    mkdirSync(join(projectDir, dir), { recursive: true });
  }

  // Initialize project-state.json
  const now = new Date().toISOString();
  const state: ProjectState = {
    version: 1,
    project: slug,
    projectDir: normalizePath(projectDir),
    createdAt: now,
    lastUpdated: now,
    currentPhase: '0a',
    status: 'init',
    chapters: {},
    round: 1,
    scheduler: {
      tokens: 10,
      paused: false,
    },
    tasks: [],
    executionLog: [],
    escalatedToHuman: false,
  };

  const store = new ProjectStore(projectDir);
  store.save(state);

  // Generate agent-instructions.md
  generateAgentInstructions(projectDir, slug);

  // Copy materials if source provided
  if (options.materialSourceDir && existsSync(options.materialSourceDir)) {
    copyMaterialDirectory(options.materialSourceDir, join(projectDir, 'reference_material'));
  }

  // Copy requirements if provided
  if (options.requirementsPath && existsSync(options.requirementsPath)) {
    copyFileSync(options.requirementsPath, join(projectDir, 'inputs', 'requirements.md'));
  }

  return {
    success: true,
    projectDir: normalizePath(projectDir),
    slug,
    message: `项目 "${slug}" 初始化成功\n目录: ${normalizePath(projectDir)}\n\n下一步:\n1. 将参考资料放入 reference_material/ 目录\n2. 运行 /confwrite:organize 整理素材`,
  };
}

function generateAgentInstructions(projectDir: string, slug: string): void {
  const content = `# ${slug} — 写作指引

## 项目概述

本项目使用 ConfWrite 流程生成多章节长文档。

## 素材包体系

每个章节都有对应的素材包，位于 \`assets/chapter-kits/chXXX.md\`。

Writer subagent 写作前必须：
1. 阅读自己的素材包
2. 根据素材包中的"必读文件"列表，用 read 读取具体资料
3. 根据"大纲要点"组织章节结构
4. 确保引用来源、数据与基线一致

## 数据基线

跨章节共享数据见 \`assets/data-baseline.json\`。
所有 Writer 必须引用，Reviewer 必须核查。

## 目录结构

\`\`\`
${slug}/
├── inputs/              # 需求文档
├── reference_material/  # 原始参考资料
├── assets/
│   ├── indexes/         # JSON 索引（按主题域分区）
│   ├── chapter-kits/    # 章节素材包
│   ├── data-baseline.json
│   └── references-index.md
├── outline.md           # 大纲
├── project-state.json   # 进度状态
├── drafts/chapters/     # 章节草稿
├── review/              # 审阅结果
├── figures/             # 图表
├── assembly/            # 组装产物
└── output/              # 最终定稿
\`\`\`

## 写作规范

1. 严格使用数据基线中的数字，不要编造数据
2. 保持与大纲一致，不要偏离主题
3. 图表占位符格式: \`[diagram:id:title]...[/diagram]\`
4. 必须调用 write 工具保存文件
`;

  writeFileSync(join(projectDir, 'inputs', 'agent-instructions.md'), content, 'utf-8');
}

function copyMaterialDirectory(sourceDir: string, destDir: string): void {
  const files = readdirSync(sourceDir);
  for (const file of files) {
    const srcPath = join(sourceDir, file);
    const destPath = join(destDir, file);
    const stat = require('node:fs').statSync(srcPath);

    if (stat.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function readdirSync(path: string): string[] {
  return require('node:fs').readdirSync(path);
}
