import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OutlineGenerator } from '../outline/generator.js';
import { ProjectStore } from '../state/store.js';
import type { Requirement, Outline } from '../outline/types.js';
import type { LLMCaller } from '../outline/llm-planner.js';

/**
 * 大纲命令选项
 */
export interface OutlineCommandOptions {
  /** 项目目录 */
  projectDir: string;
  /** 模板名称 */
  template: string;
  /** 目标字数（可选） */
  targetWords?: number;
  /** 是否启用 LLM 规划器（默认 true，需要 pi SDK 可用） */
  useLLM?: boolean;
}

/**
 * 大纲命令结果
 */
export interface OutlineCommandResult {
  /** 是否成功 */
  success: boolean;
  /** 大纲文件路径 */
  outlinePath?: string;
  /** 评估报告路径 */
  reportPath?: string;
  /** 消息 */
  message: string;
}

/**
 * 执行大纲生成命令
 */
export async function outlineCommand(
  options: OutlineCommandOptions
): Promise<OutlineCommandResult> {
  const { projectDir, template, targetWords } = options;

  // 1. 检查需求文件
  const requirementsPath = join(projectDir, 'assets', 'requirements.json');
  if (!existsSync(requirementsPath)) {
    throw new Error('未找到需求文件，请先运行 Phase 1 提取需求');
  }

  // 2. 加载需求
  const requirementsContent = readFileSync(requirementsPath, 'utf-8');
  const requirements: Requirement[] = JSON.parse(requirementsContent);

  // 3. 创建大纲生成器（可选 LLM 规划器）
  const useLLM = options.useLLM !== false; // 默认启用
  const llmCaller = useLLM ? createLLMCaller(projectDir) : undefined;
  const generator = new OutlineGenerator(projectDir, { llmCaller });
  const outline = await generator.generate(template, requirements, targetWords);

  // 4. 评估字数
  const evaluation = generator.evaluateWordCount(outline);

  // 5. 生成大纲文件
  const outlinePath = join(projectDir, 'outline.md');
  const outlineContent = generateOutlineMarkdown(outline, evaluation);
  writeFileSync(outlinePath, outlineContent, 'utf-8');

  // 6. 生成评估报告
  const assetsDir = join(projectDir, 'assets');
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }
  
  const reportPath = join(assetsDir, 'outline-evaluation.md');
  const reportContent = generateEvaluationReport(outline, evaluation);
  writeFileSync(reportPath, reportContent, 'utf-8');

  // 7. 更新项目状态
  const store = new ProjectStore(projectDir);
  const state = store.load();
  if (state) {
    state.currentPhase = '3';
    state.lastUpdated = new Date().toISOString();
    
    // 更新章节信息
    for (const chapter of outline.chapters) {
      state.chapters[chapter.id] = {
        id: chapter.id,
        title: chapter.title,
        status: 'pending',
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        type: chapter.type,
        wordBudget: chapter.wordBudget,
        importance: chapter.importance,
        description: chapter.description,
        style: chapter.style,
      };
    }
    
    store.save(state);
  }

  // 9. 生成消息
  let message = `大纲生成成功\n`;
  message += `文件: ${outlinePath}\n`;
  message += `章节数: ${outline.chapters.length}\n`;
  message += `字数预算: ${evaluation.totalMin}-${evaluation.totalMax}字\n`;
  message += `目标字数: ${evaluation.targetWords}字\n`;
  
  if (evaluation.warnings.length > 0) {
    message += `\n警告:\n`;
    for (const warning of evaluation.warnings) {
      message += `  - ${warning}\n`;
    }
  }

  return {
    success: true,
    outlinePath,
    reportPath,
    message,
  };
}

/**
 * 创建 LLM 调用函数
 * 使用 pi SDK 的 createAgentSession 调用 LLM
 * 包含 60 秒超时保护，避免在测试环境或 SDK 不可用时挂起
 */
function createLLMCaller(projectDir: string): LLMCaller {
  return async (prompt: string): Promise<string> => {
    const TIMEOUT_MS = 60_000;

    // 超时保护
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM call timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    });

    const callPromise = (async () => {
      const { createAgentSession, SessionManager } =
        await import('@earendil-works/pi-coding-agent');

      const { session } = await createAgentSession({
        sessionManager: SessionManager.inMemory(),
        cwd: projectDir,
        tools: [], // 大纲规划不需要工具
      });

      await session.prompt(prompt);

      // 提取 assistant 的文本响应
      const assistantMsg = session.messages.filter(m => m.role === 'assistant').pop();
      session.dispose();

      if (!assistantMsg) {
        throw new Error('No LLM response received');
      }

      // 提取文本内容
      if (!assistantMsg.content) throw new Error('Empty LLM response');
      if (!Array.isArray(assistantMsg.content)) return String(assistantMsg.content);

      const textParts = assistantMsg.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);

      const result = textParts.join('\n');
      if (!result.trim()) throw new Error('Empty LLM response text');
      return result;
    })();

    return Promise.race([callPromise, timeoutPromise]);
  };
}

/**
 * 生成大纲Markdown内容
 *
 * 格式说明（Bug A 修复）：
 *
 * 每个章节以 `ch001 标题` 格式开头（OutlineParser 可识别），
 * 后面跟着描述、字数预算等元信息。不再使用 `### 1. 标题 (ch001)` 格式，
 * 因为 OutlineParser 和 getChapterOrder 无法解析那种格式。
 */
function generateOutlineMarkdown(outline: Outline, evaluation: any): string {
  const lines: string[] = [];

  lines.push(`# ${outline.title}\n`);
  lines.push(`**目标字数**: ${outline.targetWords}字\n`);
  lines.push(`**字数预算**: ${evaluation.totalMin}-${evaluation.totalMax}字\n`);
  lines.push(`**生成时间**: ${new Date(outline.createdAt).toLocaleString('zh-CN')}\n`);
  lines.push('');

  for (const chapter of outline.chapters) {
    // 核心：以 `ch001 标题` 格式开头，OutlineParser 可识别
    lines.push(`${chapter.id} ${chapter.title}`);
    
    // 添加需求来源信息
    if (chapter.requirementSource && chapter.requirementSource.sections.length > 0) {
      const sections = chapter.requirementSource.sections.map(s => `§${s}`).join(', ');
      lines.push(`需求来源: ${sections}`);
    }
    
    lines.push(`本章类型: ${chapter.type}。重要度: ${chapter.importance || 3}/5。`);
    lines.push(`字数预算: ${chapter.wordBudget?.min || 0}-${chapter.wordBudget?.max || 0}字`);
    if (chapter.description) {
      lines.push(chapter.description);
    }
    if (chapter.style) {
      lines.push(`写作风格: ${chapter.style}`);
    }
    lines.push('');
  }

  lines.push('## 需求分配\n');
  lines.push('需求已自动分配到各章节，详见 `assets/requirements.json`。\n');

  return lines.join('\n');
}

/**
 * 生成评估报告
 */
function generateEvaluationReport(outline: Outline, evaluation: any): string {
  const lines: string[] = [];

  lines.push('# 大纲评估报告\n');

  lines.push('## 字数统计\n');
  lines.push(`- **总最小字数**: ${evaluation.totalMin}字`);
  lines.push(`- **总最大字数**: ${evaluation.totalMax}字`);
  lines.push(`- **平均字数**: ${Math.round((evaluation.totalMin + evaluation.totalMax) / 2)}字`);
  lines.push(`- **目标字数**: ${evaluation.targetWords}字`);
  lines.push(`- **偏差**: ${evaluation.deviation}字`);
  lines.push(`- **偏差率**: ${(evaluation.deviationRate * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('## 章节详情\n');
  lines.push('| 章节ID | 标题 | 类型 | 最小字数 | 最大字数 | 重要度 |');
  lines.push('|--------|------|------|----------|----------|--------|');
  
  for (const chapter of outline.chapters) {
    lines.push(
      `| ${chapter.id} | ${chapter.title} | ${chapter.type} | ${chapter.wordBudget?.min || 0} | ${chapter.wordBudget?.max || 0} | ${chapter.importance || 3} |`
    );
  }
  lines.push('');

  if (evaluation.warnings.length > 0) {
    lines.push('## 警告\n');
    for (const warning of evaluation.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');
  } else {
    lines.push('## 评估结果\n');
    lines.push('✅ 字数预算符合目标范围\n');
  }

  lines.push('## 建议\n');
  if (evaluation.deviationRate > 0.2) {
    lines.push('- 字数预算超出目标，建议减少章节数量或降低某些章节的字数预算');
  } else if (evaluation.deviationRate < -0.2) {
    lines.push('- 字数预算不足目标，建议增加章节数量或提高某些章节的字数预算');
  } else {
    lines.push('- 字数预算合理，可以开始写作');
  }

  return lines.join('\n');
}
