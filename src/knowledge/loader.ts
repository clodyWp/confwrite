import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Frontmatter 元数据
 */
export interface KnowledgeFrontmatter {
  title?: string;
  tags?: string[];
  status?: string;
  updated?: string;
  [key: string]: unknown;
}

/**
 * 知识库文件
 */
export interface KnowledgeFile {
  filename: string;
  content: string;
  frontmatter: KnowledgeFrontmatter;
}

/**
 * 所有知识库内容
 */
export interface AllKnowledge {
  files: KnowledgeFile[];
}

/**
 * 章节相关知识
 */
export interface RelevantKnowledge {
  selectionGuide: KnowledgeFile | null;
  layout: KnowledgeFile | null;
  diagramTypes: KnowledgeFile[];
}

/**
 * 图表类型 → 关键词映射
 */
const DIAGRAM_TYPE_KEYWORDS: Record<string, string[]> = {
  'architecture.md': ['架构', '系统设计', '系统结构', '模块划分', '分层'],
  'flowchart.md': ['流程', '步骤', '判断', '分支', '泳道', 'BPMN'],
  'sequence.md': ['时序', '交互', '调用', '消息', '接口调用'],
  'er-diagram.md': ['数据模型', 'ER', '数据库', '表结构', '实体', '关系'],
  'state-machine.md': ['状态', '状态机', '状态转换', '生命周期'],
  'class-diagram.md': ['类图', '类设计', '继承', '接口', 'OOP'],
  'deployment.md': ['部署', '运维', '容器', 'K8s', '服务器', '物理'],
  'data-flow.md': ['数据流', '数据流转', 'ETL', '管道', '数据管道'],
  'comparison-table.md': ['对比', '选型', '方案比较', '优劣', '优缺点'],
};

/**
 * 解析 frontmatter
 */
function parseFrontmatter(content: string): { frontmatter: KnowledgeFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: KnowledgeFrontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // 解析数组 [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

/**
 * 知识库加载器
 */
export class KnowledgeLoader {
  private knowledgeDir: string;
  private writingStylesDir: string;

  constructor(projectDir: string) {
    this.knowledgeDir = join(projectDir, 'knowledge', 'diagrams');
    this.writingStylesDir = join(projectDir, 'knowledge', 'writing-styles');
  }

  /**
   * 加载所有知识库文件
   */
  loadAll(): AllKnowledge {
    if (!existsSync(this.knowledgeDir)) {
      return { files: [] };
    }

    const files: KnowledgeFile[] = [];
    const entries = readdirSync(this.knowledgeDir).filter(f => f.endsWith('.md') && f !== 'README.md');

    for (const filename of entries.sort()) {
      const filePath = join(this.knowledgeDir, filename);
      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      files.push({ filename, content: body.trim(), frontmatter });
    }

    return { files };
  }

  /**
   * 加载选型指南
   */
  loadSelectionGuide(): KnowledgeFile | null {
    return this.loadFile('selection-guide.md');
  }

  /**
   * 加载布局方法论
   */
  loadLayout(): KnowledgeFile | null {
    return this.loadFile('layout.md');
  }

  /**
   * 加载指定图表类型知识
   */
  loadDiagramType(type: string): KnowledgeFile | null {
    return this.loadFile(`${type}.md`);
  }

  /**
   * 加载质量教训
   */
  loadQualityLessons(): KnowledgeFile | null {
    return this.loadFile('quality-lessons.md');
  }

  /**
   * 根据章节分类加载相关知识
   */
  loadRelevantKnowledge(categories: string[]): RelevantKnowledge {
    const selectionGuide = this.loadSelectionGuide();
    const layout = this.loadLayout();
    const diagramTypes: KnowledgeFile[] = [];

    const categoryText = categories.join(' ');

    for (const [filename, keywords] of Object.entries(DIAGRAM_TYPE_KEYWORDS)) {
      const matched = keywords.some(kw => categoryText.includes(kw));
      if (matched) {
        const file = this.loadFile(filename);
        if (file) {
          diagramTypes.push(file);
        }
      }
    }

    return { selectionGuide, layout, diagramTypes };
  }

  /**
   * 生成注入 Writer 的知识内容
   */
  generateWriterInjection(categories: string[]): string {
    const relevant = this.loadRelevantKnowledge(categories);
    const parts: string[] = [];

    if (relevant.selectionGuide) {
      parts.push('## 图表选型指南\n');
      parts.push(relevant.selectionGuide.content);
      parts.push('');
    }

    if (relevant.layout) {
      parts.push('## 布局原则（必须遵循）\n');
      // 只注入核心原则摘要，不注入全文
      const layoutContent = relevant.layout.content;
      const principlesMatch = layoutContent.match(/(## 七条布局原则[\s\S]*?)(?=\n## [^#]|$)/);
      if (principlesMatch) {
        parts.push(principlesMatch[1].trim());
      } else {
        parts.push(layoutContent.slice(0, 2000));
      }
      parts.push('');
    }

    for (const dt of relevant.diagramTypes) {
      parts.push(`## ${dt.frontmatter.title || dt.filename}\n`);
      parts.push(dt.content.slice(0, 1500)); // 截断避免过长
      parts.push('');
    }

    if (parts.length === 0) {
      return '';
    }

    // 添加格式说明
    // 这里曾经教写手「请直接使用 mermaid 代码块」—— 而写手提示词里写着
    // 「严禁使用 mermaid」，两处注入互相矛盾，真机事故里 fixer 就是据此
    // 把 ch001 的图改写成 mermaid，导致该章 3 张图全部丢失。
    // 现在统一为项目自己的结构化格式（containers / nodes / edges）。
    parts.push('## 图表格式\n');
    parts.push('使用 diagram-start 标记，内部是 containers / nodes / edges 三段：\n');
    parts.push('```');
    parts.push('<!-- diagram-start');
    parts.push('type: flow');
    parts.push('title: 图表标题');
    parts.push('description: |');
    parts.push('  一段话说明这张图表达什么（不画进图里）');
    parts.push('containers:');
    parts.push('  - id: c1');
    parts.push('    label: 分组名');
    parts.push('    nodes: [a, b]');
    parts.push('nodes:');
    parts.push('  - id: a');
    parts.push('    label: 节点文字（≤12 字）');
    parts.push('    container: c1');
    parts.push('    high_weight: true   # 全图最多 3 个');
    parts.push('edges:');
    parts.push('  - from: a');
    parts.push('    to: b');
    parts.push('    label: 短标签');
    parts.push('diagram-end -->');
    parts.push('```\n');
    parts.push('硬性要求：**一张图装下全部内容**（引擎会压缩到 ≤1 页，');
    parts.push('节点 ≤24、连线 ≤28），不要拆成多张；**严禁 mermaid 代码块**。');

    return parts.join('\n');
  }

  /**
   * 生成注入 Reviewer 的知识内容（图表对抗性检查）
   */
  generateReviewerInjection(categories: string[]): string {
    const relevant = this.loadRelevantKnowledge(categories);
    const parts: string[] = [];

    // 注入布局检查清单
    if (relevant.layout) {
      parts.push('### 图表布局检查标准\n');
      // 提取布局检查清单部分
      const layoutContent = relevant.layout.content;
      const checklistMatch = layoutContent.match(/(## 检查清单[\s\S]*?)(?=\n## [^#]|$)/);
      if (checklistMatch) {
        parts.push(checklistMatch[1].trim());
      } else {
        // 如果没有找到检查清单，提取核心原则
        const principlesMatch = layoutContent.match(/(## 七条布局原则[\s\S]*?)(?=\n## [^#]|$)/);
        if (principlesMatch) {
          parts.push(principlesMatch[1].trim());
        }
      }
      parts.push('');
    }

    // 注入图表类型知识
    for (const dt of relevant.diagramTypes) {
      parts.push(`### ${dt.frontmatter.title || dt.filename} 检查要点\n`);
      // 提取绘图要点部分
      const content = dt.content;
      const pointsMatch = content.match(/(## 绘图要点[\s\S]*?)(?=\n## [^#]|$)/);
      if (pointsMatch) {
        parts.push(pointsMatch[1].trim());
      } else {
        parts.push(content.slice(0, 1000));
      }
      parts.push('');
    }

    // 注入质量教训
    const qualityLessons = this.loadQualityLessons();
    if (qualityLessons) {
      parts.push('### 常见质量问题\n');
      parts.push(qualityLessons.content.slice(0, 1500));
      parts.push('');
    }

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n');
  }

  /**
   * 加载单个文件
   */
  private loadFile(filename: string): KnowledgeFile | null {
    const filePath = join(this.knowledgeDir, filename);
    if (!existsSync(filePath)) {
      return null;
    }

    const raw = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    return { filename, content: body.trim(), frontmatter };
  }

  /**
   * 加载写作风格指南
   * 优先按 matchCategories 匹配，其次按 tags 与标题关键词匹配
   */
  loadWritingStyleGuide(categories: string[], title: string): KnowledgeFile | null {
    if (!existsSync(this.writingStylesDir)) {
      return null;
    }

    const entries = readdirSync(this.writingStylesDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (entries.length === 0) {
      return null;
    }

    const categoryText = categories.join(' ').toLowerCase();
    const titleLower = title.toLowerCase();

    // 第一轮：按 matchCategories 匹配
    for (const filename of entries.sort()) {
      const filePath = join(this.writingStylesDir, filename);
      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const matchCategories = frontmatter.matchCategories;
      if (Array.isArray(matchCategories) && matchCategories.length > 0) {
        const matched = matchCategories.some((cat: string) => 
          categoryText.includes(cat.toLowerCase())
        );
        if (matched) {
          return { filename, content: body.trim(), frontmatter };
        }
      }
    }

    // 第二轮：按 tags 与标题关键词匹配
    for (const filename of entries.sort()) {
      const filePath = join(this.writingStylesDir, filename);
      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const tags = frontmatter.tags;
      if (Array.isArray(tags) && tags.length > 0) {
        const matched = tags.some((tag: string) => 
          titleLower.includes(tag.toLowerCase())
        );
        if (matched) {
          return { filename, content: body.trim(), frontmatter };
        }
      }
    }

    return null;
  }

  /**
   * 生成写作风格注入内容
   */
  generateWritingStyleInjection(categories: string[], title: string): string {
    const style = this.loadWritingStyleGuide(categories, title);
    if (!style) {
      return '';
    }

    const parts: string[] = [];
    parts.push(`## 写作风格：${style.frontmatter.title || style.filename}\n`);
    parts.push(style.content);
    parts.push('');

    return parts.join('\n');
  }
}
