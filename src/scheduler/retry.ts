/**
 * RetryEngine - 重试引擎
 * 
 * 实现指数退避重试策略，支持抖动（jitter）
 */

export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxRetries: number;
  jitter?: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelayMs: 5000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxRetries: 3,
  jitter: true,
};

export class RetryEngine {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * 判断是否应该重试
   * @param attempts 已尝试次数
   */
  shouldRetry(attempts: number): boolean {
    return attempts < this.config.maxRetries;
  }

  /**
   * 计算重试延迟
   * @param attempts 已尝试次数
   */
  getDelay(attempts: number): number {
    const exponential = this.config.baseDelayMs * Math.pow(this.config.multiplier, attempts);
    const capped = Math.min(exponential, this.config.maxDelayMs);

    if (this.config.jitter) {
      // 添加 ±50% 的随机抖动
      const jitterRange = capped * 0.5;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.round(capped + jitter);
    }

    return capped;
  }

  /**
   * 等待指定尝试次数的延迟时间
   * @param attempts 已尝试次数
   */
  async wait(attempts: number): Promise<void> {
    const delay = this.getDelay(attempts);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
