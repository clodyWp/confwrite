import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outlineCommand } from '../commands/outline.js';
import { ProjectStore } from '../state/store.js';

/**
 * Phase 2: 大纲规划
 * 根据需求自动生成文档大纲
 */
export class Phase2OutlinePlanning {
  private projectDir: string;
  private store: ProjectStore;

  constructor(projectDir: string, store: ProjectStore) {
    this.projectDir = projectDir;
    this.store = store;
  }

  /**
   * 执行Phase 2
   * @param templateName 模板名称，默认为'technical-proposal'
   */
  async execute(templateName: string = 'technical-proposal'): Promise<void> {
    // 1. 检查大纲是否已存在
    const outlinePath = join(this.projectDir, 'outline.md');
    if (existsSync(outlinePath)) {
      // 大纲已存在，跳过生成
      const state = this.store.load();
      if (state) {
        state.currentPhase = '3';
        state.lastUpdated = new Date().toISOString();
        this.store.save(state);
      }
      return;
    }

    // 2. 检查需求文件是否存在
    const requirementsPath = join(this.projectDir, 'assets', 'requirements.json');
    if (!existsSync(requirementsPath)) {
      throw new Error('未找到需求文件，请先运行 Phase 1 提取需求');
    }

    // 3. 调用大纲生成命令
    await outlineCommand({
      projectDir: this.projectDir,
      template: templateName,
    });

    // 4. 更新项目状态
    const state = this.store.load();
    if (state) {
      state.currentPhase = '3';
      state.lastUpdated = new Date().toISOString();
      this.store.save(state);
    }
  }

  /**
   * 验证Phase 2是否完成
   */
  validate(): boolean {
    const outlinePath = join(this.projectDir, 'outline.md');
    return existsSync(outlinePath);
  }
}
