/**
 * /confwrite:init — Project initialization command
 * 
 * Creates the project directory structure, initializes state,
 * and generates template files.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSlug, normalizePath } from '../utils/paths.js';
import { ProjectStore } from '../state/store.js';
import type { ProjectState } from '../state/schema.js';

/**
 * 从模块 URL 解析包根目录下的 knowledge/ 路径
 *
 * 历史事故（Bug 14）：原实现只上溯两层 `dirname`，得到的是 `dist/knowledge`
 * ——而该目录恰好是 tsc 编译 `src/knowledge/loader.ts` 的产物目录
 * （只含 loader.js / .d.ts / .map）。结果项目的 knowledge/ 里全是编译产物，
 * 真正的知识库（knowledge/diagrams/ 下 16 个 .md）从未被复制。
 *
 * 同时用 fileURLToPath 而不是 URL.pathname，避免路径含空格时出现 %20。
 *
 * @param moduleUrl 调用方的 import.meta.url
 * @returns <包根>/knowledge
 */
export function resolveKnowledgeDir(moduleUrl: string): string {
  // <包根>/dist/commands/init.js 或 <包根>/src/commands/init.ts
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const packageRoot = dirname(dirname(moduleDir));
  return join(packageRoot, 'knowledge');
}

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

  // Generate default diagram style
  generateDiagramStyleDefaults(projectDir);

  // Copy materials if source provided
  if (options.materialSourceDir && existsSync(options.materialSourceDir)) {
    copyMaterialDirectory(options.materialSourceDir, join(projectDir, 'reference_material'));
  }

  // Copy requirements if provided
  if (options.requirementsPath && existsSync(options.requirementsPath)) {
    copyFileSync(options.requirementsPath, join(projectDir, 'inputs', 'requirements.md'));
  }

  // Copy knowledge base (diagrams/, etc.) so KitGenerator can inject it
  // 取包根目录的 knowledge/（含 diagrams/ 下 16 个 .md），
  // 而不是 dist/knowledge（tsc 编译产物）—— 见 Bug 14
  const knowledgeSrc = resolveKnowledgeDir(import.meta.url);
  const knowledgeDest = join(projectDir, 'knowledge');
  if (existsSync(knowledgeSrc) && !existsSync(knowledgeDest)) {
    copyDirRecursive(knowledgeSrc, knowledgeDest);
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

function generateDiagramStyleDefaults(projectDir: string): void {
  const defaults = {
    colorScheme: 'warm',
    nodeShape: 'rounded',
    layoutDirection: 'top-to-bottom',
    fontSize: 'normal',
    customColors: null,
  };
  writeFileSync(
    join(projectDir, 'assets', 'diagram-style.json'),
    JSON.stringify(defaults, null, 2),
    'utf-8'
  );
}

function copyMaterialDirectory(sourceDir: string, destDir: string): void {
  copyDirRecursive(sourceDir, destDir);
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
