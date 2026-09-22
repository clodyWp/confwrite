/**
 * LoopDetector — 循环检测器
 * 
 * 检测 subagent 是否陷入重复调用同一个工具的循环。
 * 
 * 设计原则：
 * - 连续 3 次调用同一个工具（相同名称 + 相同命令前缀）→ 警告
 * - 连续 5 次调用同一个工具 → 强制终止
 * - 只比较命令的前 100 个字符（避免长命令的误判）
 * - 只保留最近 5 次调用记录（节省内存）
 */

export interface LoopDetectionResult {
  /** 是否检测到循环（连续 3 次或以上） */
  isLoop: boolean;
  /** 是否触发警告（连续 3 次） */
  isWarning: boolean;
  /** 是否应该终止（连续 5 次或以上） */
  isTerminated: boolean;
  /** 连续调用次数 */
  consecutiveCount: number;
}

export class LoopDetector {
  private recentCalls: Array<{ toolName: string; prefix: string }> = [];
  private readonly warningThreshold = 3;
  private readonly terminateThreshold = 5;
  private readonly maxHistorySize = 5;
  private readonly commandPrefixLength = 100;

  /**
   * 记录一次工具调用
   * @param toolName 工具名称（如 'bash', 'read', 'write'）
   * @param command 命令内容（可选，用于 bash 工具）
   * @returns 循环检测结果
   */
  record(toolName: string, command?: string): LoopDetectionResult {
    // 提取命令前缀（前 100 个字符）
    const prefix = command ? command.substring(0, this.commandPrefixLength) : '';
    
    // 记录调用
    this.recentCalls.push({ toolName, prefix });
    
    // 只保留最近 5 次调用
    if (this.recentCalls.length > this.maxHistorySize) {
      this.recentCalls.shift();
    }

    // 计算连续相同调用次数
    const consecutiveCount = this.calculateConsecutiveCount();

    return {
      isLoop: consecutiveCount >= this.warningThreshold,
      isWarning: consecutiveCount === this.warningThreshold,
      isTerminated: consecutiveCount >= this.terminateThreshold,
      consecutiveCount,
    };
  }

  /**
   * 重置检测器状态
   */
  reset(): void {
    this.recentCalls = [];
  }

  /**
   * 计算当前连续相同调用次数
   */
  private calculateConsecutiveCount(): number {
    if (this.recentCalls.length === 0) {
      return 0;
    }

    const last = this.recentCalls[this.recentCalls.length - 1];
    let count = 1;

    // 从后往前遍历，计算连续相同调用次数
    for (let i = this.recentCalls.length - 2; i >= 0; i--) {
      const call = this.recentCalls[i];
      if (call.toolName === last.toolName && call.prefix === last.prefix) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }
}
