import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RequirementExtractor } from '../outline/requirement-extractor.js';
import { ProjectStore } from '../state/store.js';
import type { Requirement } from '../outline/types.js';

/**
 * Phase 1: 需求分析
 * 从输入文档中提取需求，生成需求列表和报告
 */
export class Phase1RequirementAnalysis {
  private projectDir: string;
  private store: ProjectStore;

  constructor(projectDir: string, store: ProjectStore) {
    this.projectDir = projectDir;
    this.store = store;
  }

  /**
   * 执行Phase 1
   */
  async execute(): Promise<void> {
    // 1. 查找输入文档
    const inputFiles = this.findInputFiles();
    if (inputFiles.length === 0) {
      throw new Error('未找到输入文档');
    }

    // 2. 提取需求
    const extractor = new RequirementExtractor(this.projectDir);
    const allRequirements: Requirement[] = [];

    for (const inputFile of inputFiles) {
      const requirements = await extractor.extractFromDocument(inputFile);
      allRequirements.push(...requirements);
    }

    // 3. 生成统计信息
    const stats = extractor.generateStatistics(allRequirements);

    // 4. 生成报告
    const report = extractor.generateReport(allRequirements, stats);

    // 5. 保存需求列表
    const assetsDir = join(this.projectDir, 'assets');
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    const requirementsPath = join(assetsDir, 'requirements.json');
    writeFileSync(requirementsPath, JSON.stringify(allRequirements, null, 2), 'utf-8');

    // 6. 保存报告
    const reportPath = join(assetsDir, 'requirement-report.md');
    writeFileSync(reportPath, report, 'utf-8');

    // 7. 更新项目状态
    const state = this.store.load();
    if (state) {
      // [DIAG] 诊断日志：Phase 1 内部状态修改
      console.log(`[DIAG-PHASE1] before: currentPhase=${state.currentPhase} status=${state.status}`);
      state.currentPhase = '2';
      state.lastUpdated = new Date().toISOString();
      this.store.save(state);
      console.log(`[DIAG-PHASE1] after: currentPhase=${state.currentPhase} status=${state.status}`);
    }
  }

  /**
   * 验证Phase 1是否完成
   */
  validate(): boolean {
    const requirementsPath = join(this.projectDir, 'assets', 'requirements.json');
    return existsSync(requirementsPath);
  }

  /**
   * 查找输入文档
   */
  private findInputFiles(): string[] {
    const inputsDir = join(this.projectDir, 'inputs');
    if (!existsSync(inputsDir)) {
      return [];
    }

    const files: string[] = [];
    const entries = readdirSync(inputsDir);

    for (const entry of entries) {
      if (entry.endsWith('.md') || entry.endsWith('.txt')) {
        files.push(join(inputsDir, entry));
      }
    }

    return files;
  }
}
