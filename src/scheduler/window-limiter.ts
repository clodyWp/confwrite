/**
 * WindowRateLimiter - 滑动窗口限流器
 * 
 * 用于控制 subagent 提交频率，例如"每5分钟最多3个"
 */

export class WindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private windowMs: number,   // 窗口大小（毫秒），0 表示禁用
    private maxTasks: number    // 窗口内最大任务数，0 表示禁用
  ) {}

  /**
   * 检查是否可以提交
   */
  canSubmit(): boolean {
    if (this.isDisabled()) return true;
    this.cleanExpired();
    return this.timestamps.length < this.maxTasks;
  }

  /**
   * 记录一次提交
   */
  record(): void {
    if (this.isDisabled()) return;
    this.timestamps.push(Date.now());
  }

  /**
   * 获取当前窗口内的提交数量
   */
  countInWindow(): number {
    this.cleanExpired();
    return this.timestamps.length;
  }

  /**
   * 等待直到有配额
   * @param timeoutMs 超时时间（毫秒），默认 30秒
   */
  async waitForSlot(timeoutMs: number = 30000): Promise<void> {
    if (this.isDisabled()) return;

    const startTime = Date.now();

    while (true) {
      this.cleanExpired();
      
      if (this.timestamps.length < this.maxTasks) {
        return; // 有配额
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new Error(`WindowRateLimiter: timeout waiting for slot after ${elapsed}ms`);
      }

      // 计算最早记录何时过期
      const oldestTimestamp = this.timestamps[0];
      const expiresAt = oldestTimestamp + this.windowMs;
      const waitMs = Math.min(expiresAt - Date.now(), 100); // 最多等 100ms 再检查
      
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  /**
   * 清理过期记录
   */
  private cleanExpired(): void {
    if (this.isDisabled()) {
      this.timestamps = [];
      return;
    }

    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter(ts => ts > cutoff);
  }

  /**
   * 检查是否禁用限流
   */
  private isDisabled(): boolean {
    return this.windowMs <= 0 || this.maxTasks <= 0;
  }
}
