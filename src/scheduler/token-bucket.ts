/**
 * Token Bucket - 令牌桶算法实现
 * 
 * 用于控制 subagent 提交频率，避免 LLM provider 限流
 */

export interface TokenBucketConfig {
  capacity: number;
  refillRate: number; // tokens per second
  initialTokens?: number;
}

export interface TokenBucketState {
  tokens: number;
  capacity: number;
  refillRate: number;
  lastRefillAt: number;
}

export class TokenBucket {
  private tokens: number;
  private capacity: number;
  private refillRate: number;
  private lastRefillAt: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokens = config.initialTokens ?? config.capacity;
    this.lastRefillAt = Date.now();
  }

  /**
   * 尝试消费指定数量的令牌
   * @returns true 如果成功消费，false 如果令牌不足
   */
  consume(count: number): boolean {
    this.refill();
    
    if (this.tokens < count) {
      return false;
    }
    
    this.tokens -= count;
    return true;
  }

  /**
   * 等待指定数量的令牌可用
   * @param count 需要的令牌数
   * @param timeoutMs 超时时间（毫秒）
   */
  async waitForToken(count: number, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (true) {
      this.refill();
      
      if (this.tokens >= count) {
        this.tokens -= count;
        return;
      }
      
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new Error(`TokenBucket: timeout waiting for ${count} tokens after ${elapsed}ms`);
      }
      
      // 计算需要等待的时间
      const needed = count - this.tokens;
      const waitMs = Math.ceil((needed / this.refillRate) * 1000);
      const remaining = timeoutMs - elapsed;
      const actualWait = Math.min(waitMs, remaining, 1000); // 最多等 1s 再检查
      
      await new Promise(resolve => setTimeout(resolve, actualWait));
    }
  }

  /**
   * 根据时间补充令牌
   */
  private refill(now?: number): void {
    const currentTime = now ?? Date.now();
    const elapsed = (currentTime - this.lastRefillAt) / 1000; // seconds
    
    if (elapsed > 0) {
      const newTokens = elapsed * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefillAt = currentTime;
    }
  }

  /**
   * 获取当前可用令牌数
   */
  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * 序列化状态（用于持久化）
   */
  serialize(): TokenBucketState {
    this.refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      lastRefillAt: this.lastRefillAt,
    };
  }

  /**
   * 从序列化状态恢复
   */
  static deserialize(state: TokenBucketState): TokenBucket {
    const bucket = new TokenBucket({
      capacity: state.capacity,
      refillRate: state.refillRate,
      initialTokens: state.tokens,
    });
    bucket.lastRefillAt = state.lastRefillAt;
    return bucket;
  }
}
