/**
 * TurnBudget — 工具调用预算控制
 * 
 * 用于限制每个 subagent 任务的工具调用次数，防止无限循环。
 * 
 * 设计原则：
 * - 超出预算时保留已生成的产出（标记为 completed）
 * - 在接近预算上限时发出警告（还剩 5 次时）
 * - 支持自定义预算上限（默认 30 次）
 */

export interface TickResult {
  /** 是否超出预算 */
  exceeded: boolean;
  /** 是否接近预算上限（警告） */
  warning: boolean;
}

export class TurnBudget {
  private count = 0;
  private readonly limit: number;
  private readonly warningThreshold: number;

  /**
   * @param limit 工具调用预算上限（默认 30）
   */
  constructor(limit: number = 30) {
    this.limit = limit;
    // 警告阈值：还剩 5 次时触发
    this.warningThreshold = Math.max(1, limit - 5);
  }

  /**
   * 记录一次工具调用
   * @returns 是否超出预算、是否触发警告
   */
  tick(): TickResult {
    this.count++;
    return {
      exceeded: this.count > this.limit,
      warning: this.count === this.warningThreshold,
    };
  }

  /**
   * 当前已调用次数
   */
  get turns(): number {
    return this.count;
  }

  /**
   * 剩余预算（不会为负数）
   */
  get remaining(): number {
    return Math.max(0, this.limit - this.count);
  }

  /**
   * 是否已超出预算
   */
  get isExceeded(): boolean {
    return this.count > this.limit;
  }

  /**
   * 预算上限
   */
  get maxTurns(): number {
    return this.limit;
  }
}
