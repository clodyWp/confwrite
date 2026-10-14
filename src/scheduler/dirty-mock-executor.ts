/**
 * DirtyMockExecutor — 模拟真实 LLM 脏输出的测试执行器
 * 
 * Issue #87: Dirty Mock 测试
 * 
 * 实现 SubagentExecutor 接口，可注入各种脏输出场景：
 * - bad_json: JSON 格式错误
 * - empty: 空输出
 * - oversized: 超长输出
 * - garbled: 乱码/编码损坏
 * - timeout: 超时
 * - contradictory_review: 矛盾审阅
 * - mixed: 混合模式（随机选择）
 * 
 * 继承 ConfigurableMockExecutor 的正常输出能力，叠加脏输出层。
 * 
 * Spec: specs/dirty-mock-testing.md
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SubagentExecutor, ExecutorResult } from './executor.js';
import type { Task } from './types.js';
import { ConfigurableMockExecutor } from './configurable-mock-executor.js';
import type { MockConfig } from './configurable-mock-executor.js';

/**
 * 脏输出类型
 */
export type DirtyMode =
  | 'normal'              // 正常输出（基线）
  | 'bad_json'            // JSON 格式错误
  | 'empty'               // 空输出
  | 'oversized'           // 超长输出
  | 'garbled'             // 乱码/编码损坏
  | 'timeout'             // 超时
  | 'contradictory_review' // 矛盾审阅
  | 'mixed';              // 混合模式（随机选择上述之一）

/**
 * 脏模式配置
 */
export interface DirtyModeConfig {
  /** 脏输出类型 */
  mode: DirtyMode;
  
  /**
   * 脏输出概率（0.0-1.0）
   * 0 = 永远不脏，1 = 永远脏
   * 默认 1.0（总是脏）
   */
  probability?: number;
}

/**
 * 脏输出配置
 * 
 * 支持按任务类型独立配置脏模式，也支持全局配置。
 * 可配置概率（0.0-1.0）控制脏输出出现的频率。
 */
export interface DirtyMockConfig {
  /**
   * 全局脏模式（所有任务类型共用）
   * 如果同时设置了 per-type 配置，per-type 优先
   */
  global?: DirtyModeConfig;

  /** 按任务类型配置 */
  writer?: DirtyModeConfig;
  reviewer?: DirtyModeConfig;
  fixer?: DirtyModeConfig;

  /**
   * 超时模拟的延迟毫秒数（仅 timeout 模式使用）
   * 默认 30000ms
   */
  timeoutMs?: number;

  /**
   * 超长输出的倍数（仅 oversized 模式使用）
   * 默认 3.0（3 倍字数上限）
   */
  oversizedMultiplier?: number;

  /**
   * 序列模式：按顺序对第 N 次调用注入脏输出
   * 例如 [1, 3] 表示第 1 次和第 3 次调用注入脏输出，其余正常
   * 与概率模式互斥，序列模式优先
   */
  sequence?: number[];
}

/**
 * 统计信息
 */
export interface DirtyStats {
  totalCalls: number;
  dirtyOutputs: number;
  normalOutputs: number;
  byType: Record<string, { dirty: number; normal: number }>;
}

/**
 * DirtyMockExecutor — 模拟真实 LLM 脏输出的测试执行器
 * 
 * 根据 dirtyConfig 决定是否注入脏输出：
 * 1. 检查 sequence 模式（如果配置了）
 * 2. 检查概率模式
 * 3. 如果命中脏模式，生成对应的脏输出
 * 4. 否则委托给内部 ConfigurableMockExecutor 生成正常输出
 */
export class DirtyMockExecutor implements SubagentExecutor {
  private projectDir: string;
  private dirtyConfig: DirtyMockConfig;
  private innerExecutor: ConfigurableMockExecutor;
  private callCount = 0;
  private stats: DirtyStats;

  constructor(projectDir: string, dirtyConfig?: DirtyMockConfig, mockConfig?: MockConfig) {
    this.projectDir = projectDir;
    this.dirtyConfig = dirtyConfig || { global: { mode: 'normal' } };
    this.innerExecutor = new ConfigurableMockExecutor(projectDir, mockConfig || {});
    this.stats = {
      totalCalls: 0,
      dirtyOutputs: 0,
      normalOutputs: 0,
      byType: {},
    };
  }

  /**
   * 执行任务
   */
  async execute(task: Task): Promise<ExecutorResult> {
    this.callCount++;
    this.stats.totalCalls++;
    
    const taskType = task.type;
    if (!this.stats.byType[taskType]) {
      this.stats.byType[taskType] = { dirty: 0, normal: 0 };
    }

    // 决定是否注入脏输出
    const shouldInjectDirty = this.shouldInjectDirty(taskType);

    if (!shouldInjectDirty) {
      // 正常输出
      this.stats.normalOutputs++;
      this.stats.byType[taskType].normal++;
      return this.innerExecutor.execute(task);
    }

    // 获取脏模式
    const mode = this.getDirtyMode(taskType);
    
    // 如果模式是 normal，走正常路径
    if (mode === 'normal') {
      this.stats.normalOutputs++;
      this.stats.byType[taskType].normal++;
      return this.innerExecutor.execute(task);
    }

    // 注入脏输出
    this.stats.dirtyOutputs++;
    this.stats.byType[taskType].dirty++;

    const round = this.extractRound(task.id);

    switch (mode) {
      case 'bad_json':
        return this.generateBadJson(task, round);
      case 'empty':
        return this.generateEmpty(task);
      case 'oversized':
        return this.generateOversized(task, round);
      case 'garbled':
        return this.generateGarbled(task, round);
      case 'timeout':
        return this.generateTimeout();
      case 'contradictory_review':
        return this.generateContradictoryReview(task, round);
      case 'mixed':
        return this.generateMixed(task, round);
      default:
        // 未知模式，回退到正常
        this.stats.normalOutputs++;
        this.stats.byType[taskType].normal++;
        return this.innerExecutor.execute(task);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): DirtyStats {
    return { ...this.stats };
  }

  /**
   * 重置统计计数器
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      dirtyOutputs: 0,
      normalOutputs: 0,
      byType: {},
    };
    this.callCount = 0;
  }

  /**
   * 是否应该注入脏输出
   */
  private shouldInjectDirty(taskType: string): boolean {
    // 1. 检查序列模式（优先）
    if (this.dirtyConfig.sequence) {
      return this.dirtyConfig.sequence.includes(this.callCount);
    }

    // 2. 获取该任务类型的配置
    const config = this.getConfigForType(taskType);
    if (!config) return false;

    // 3. 检查概率
    const probability = config.probability ?? 1.0;
    if (probability <= 0) return false;
    if (probability >= 1.0) return true;

    return Math.random() < probability;
  }

  /**
   * 获取脏模式
   */
  private getDirtyMode(taskType: string): DirtyMode {
    const config = this.getConfigForType(taskType);
    if (!config) return 'normal';
    
    if (config.mode === 'mixed') {
      // 随机选择一种脏模式（排除 normal 和 mixed）
      const modes: DirtyMode[] = ['bad_json', 'empty', 'oversized', 'garbled', 'timeout', 'contradictory_review'];
      return modes[Math.floor(Math.random() * modes.length)];
    }
    
    return config.mode;
  }

  /**
   * 获取任务类型对应的配置
   */
  private getConfigForType(taskType: string): DirtyModeConfig | undefined {
    // per-type 配置优先
    const typeConfig = (this.dirtyConfig as Record<string, any>)[taskType] as DirtyModeConfig | undefined;
    if (typeConfig) return typeConfig;
    
    // 回退到全局配置
    return this.dirtyConfig.global;
  }

  /**
   * 从 task.id 提取 round
   */
  private extractRound(taskId: string): number {
    const match = taskId.match(/-r(\d+)$/);
    return match ? parseInt(match[1]) : 1;
  }

  // ============================================================
  // 脏输出生成器
  // ============================================================

  /**
   * bad_json: 生成格式错误的 JSON
   * 变体：未闭合括号、单引号、尾逗号、注释、中文引号
   */
  private generateBadJson(task: Task, round: number): ExecutorResult {
    const chapterId = task.chapterId || 'unknown';
    
    // 根据任务类型生成不同的坏 JSON
    if (task.type === 'reviewer') {
      // 写一个坏 JSON 文件到 review 目录
      const reviewDir = join(this.projectDir, 'review');
      mkdirSync(reviewDir, { recursive: true });
      
      // 变体：根据 round 选择不同的错误类型
      const variants = [
        // 未闭合括号
        `{"chapterId": "${chapterId}", "round": ${round}, "verdict": "accept", "scores": {`,
        // 单引号
        `{'chapterId': '${chapterId}', 'round': ${round}, 'verdict': 'accept'}`,
        // 尾逗号
        `{"chapterId": "${chapterId}", "round": ${round}, "verdict": "accept",}`,
        // 注释
        `{"chapterId": "${chapterId}", "round": ${round}, "verdict": "accept" // 这是注释 }`,
        // 中文引号
        `{"chapterId": "${chapterId}", "round": ${round}, "verdict": "accept"，"summary": "内容很好"}`,
      ];
      
      const badJson = variants[round % variants.length];
      const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
      writeFileSync(reviewPath, badJson, 'utf-8');
      
      return {
        success: true,
        output: badJson,
        durationMs: 0,
      };
    }

    // writer/fixer: 返回坏 JSON 作为 output
    const badOutput = `{"status": "completed", "chapterId": "${chapterId}"`;
    task.result = badOutput;
    
    return {
      success: true,
      output: badOutput,
      durationMs: 0,
    };
  }

  /**
   * empty: 返回空字符串，不写文件
   */
  private generateEmpty(task: Task): ExecutorResult {
    // 不写任何文件，返回空字符串
    task.result = '';
    
    return {
      success: true,
      output: '',
      durationMs: 0,
    };
  }

  /**
   * oversized: 生成超长内容
   * Writer: 3x wordBudget.max 的段落
   * Fixer: 3x wordBudget.max 的段落
   */
  private generateOversized(task: Task, round: number): ExecutorResult {
    const chapterId = task.chapterId || 'unknown';
    const multiplier = this.dirtyConfig.oversizedMultiplier || 3.0;
    
    // 生成超长内容（约 24000 字符，远超正常 8000 上限）
    const targetChars = Math.round(8000 * multiplier);
    const para = '本段落描述了系统的架构设计，包括核心组件、交互模式和数据流向。系统采用现代化的微服务架构，支持高并发、高可用的业务需求。架构设计遵循松耦合、高内聚的原则，确保各个服务可以独立部署和扩展。每个组件都有明确的职责和接口，通过标准化接口通信。';
    
    let content = `# ${chapterId} 系统架构设计\n\n`;
    while (content.length < targetChars) {
      content += `## 详细设计部分 ${content.length}\n\n${para}\n\n`;
    }
    
    if (task.type === 'writer') {
      const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
      mkdirSync(dirname(draftPath), { recursive: true });
      writeFileSync(draftPath, content, 'utf-8');
    } else if (task.type === 'fixer') {
      const nextRound = round + 1;
      const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
      mkdirSync(dirname(draftPath), { recursive: true });
      writeFileSync(draftPath, content, 'utf-8');
    }
    
    task.result = content;
    
    return {
      success: true,
      output: content,
      durationMs: 0,
    };
  }

  /**
   * garbled: 生成包含乱码的内容
   * 前 500 字符中插入 \uFFFD 和控制字符
   */
  private generateGarbled(task: Task, round: number): ExecutorResult {
    const chapterId = task.chapterId || 'unknown';
    
    // 生成包含乱码的内容
    const garbledContent = `\uFFFD\uFFFD\uFFFD 系统架构设计 \uFFFD\uFFFD\n\n` +
      `\x00\x01\x02 本段落包含控制字符和替换字符 \x0B\x0C\x0E\x1F\n\n` +
      '正常内容段落，但前面已经有足够的乱码触发检测。\n\n'.repeat(100);
    
    if (task.type === 'writer') {
      const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
      mkdirSync(dirname(draftPath), { recursive: true });
      writeFileSync(draftPath, garbledContent, 'utf-8');
    } else if (task.type === 'fixer') {
      const nextRound = round + 1;
      const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
      mkdirSync(dirname(draftPath), { recursive: true });
      writeFileSync(draftPath, garbledContent, 'utf-8');
    } else if (task.type === 'reviewer') {
      // Reviewer 的乱码输出写到 review JSON
      const reviewDir = join(this.projectDir, 'review');
      mkdirSync(reviewDir, { recursive: true });
      const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
      const garbledJson = `\uFFFD{"verdict": "accept"\uFFFD, "scores": {}}\x00`;
      writeFileSync(reviewPath, garbledJson, 'utf-8');
    }
    
    task.result = garbledContent;
    
    return {
      success: true,
      output: garbledContent,
      durationMs: 0,
    };
  }

  /**
   * timeout: 等待指定时间后抛出异常
   */
  private async generateTimeout(): Promise<ExecutorResult> {
    const timeoutMs = this.dirtyConfig.timeoutMs || 30000;
    
    await new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Executor timeout after ${timeoutMs}ms`));
      }, Math.min(timeoutMs, 100)); // 测试中缩短到 100ms
    });
    
    // 不会到达这里
    return {
      success: false,
      output: `Timeout after ${timeoutMs}ms`,
      durationMs: timeoutMs,
    };
  }

  /**
   * contradictory_review: verdict=accept 但 issues 提到字数超标
   */
  private generateContradictoryReview(task: Task, round: number): ExecutorResult {
    const chapterId = task.chapterId || 'unknown';
    
    const reviewDir = join(this.projectDir, 'review');
    mkdirSync(reviewDir, { recursive: true });
    
    const contradictoryReview = {
      chapterId,
      round,
      verdict: 'accept',
      scores: {
        accuracy: 8,
        consistency: 9,
        clarity: 8,
        depth: 7,
        quality: 8,
      },
      issues: [
        {
          severity: 'high',
          description: '字数超标 50%，需要压缩到上限以内',
          location: '全文',
          suggestion: '删除重复论述，合并相似观点',
        },
      ],
      summary: '内容质量达标，但字数超标严重',
    };
    
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify(contradictoryReview, null, 2), 'utf-8');
    
    const result = JSON.stringify({
      decision: 'accept',
      confidence: 0.85,
      reasons: ['内容质量达标', '字数超标'],
    });
    
    task.result = result;
    
    return {
      success: true,
      output: result,
      durationMs: 0,
    };
  }

  /**
   * mixed: 随机选择一种脏模式
   */
  private async generateMixed(task: Task, round: number): Promise<ExecutorResult> {
    const modes: DirtyMode[] = ['bad_json', 'empty', 'oversized', 'garbled', 'contradictory_review'];
    const chosenMode = modes[Math.floor(Math.random() * modes.length)];
    
    switch (chosenMode) {
      case 'bad_json': return this.generateBadJson(task, round);
      case 'empty': return this.generateEmpty(task);
      case 'oversized': return this.generateOversized(task, round);
      case 'garbled': return this.generateGarbled(task, round);
      case 'contradictory_review': return this.generateContradictoryReview(task, round);
      default: return this.generateEmpty(task);
    }
  }
}
