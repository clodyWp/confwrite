import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

/**
 * 写作配置
 */
const WritingConfigSchema = Type.Object({
  minChapterChars: Type.Number({ minimum: 1000, maximum: 50000 }),
  maxRounds: Type.Number({ minimum: 1, maximum: 20 }),
  styleGuide: Type.Optional(Type.String()),
  minChapterCharsTolerance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  // Bug 36 修复：wordBudget 配置化
  defaultWordBudget: Type.Optional(Type.Object({
    target: Type.Number({ minimum: 1000, maximum: 50000 }),
    tolerance: Type.Number({ minimum: 0, maximum: 1 }),
  })),
});

/**
 * 审阅配置
 */
const ReviewConfigSchema = Type.Object({
  acceptMediumMax: Type.Number({ minimum: 0, maximum: 20 }),
  rejectHighMin: Type.Number({ minimum: 1, maximum: 10 }),
});

/**
 * 调度配置（扩展现有 SchedulerConfig）
 */
const SchedulerConfigSchema = Type.Object({
  maxConcurrency: Type.Number({ minimum: 1, maximum: 10 }),
  maxTurnsPerTask: Type.Number({ minimum: 0, maximum: 200 }),
  taskTimeoutMs: Type.Number({ minimum: 60000, maximum: 3600000 }),
  maxTaskRetries: Type.Number({ minimum: 0, maximum: 5 }),
  maxIterations: Type.Number({ minimum: 10, maximum: 500 }),
});

/**
 * 限流配置
 */
const RateLimitConfigSchema = Type.Object({
  baseDelayMs: Type.Number({ minimum: 1000, maximum: 600000 }),
  phase1Retries: Type.Number({ minimum: 0, maximum: 5 }),
  phase1Multiplier: Type.Number({ minimum: 1, maximum: 10 }),
  phase2Multiplier: Type.Number({ minimum: 1, maximum: 30 }),
});

/**
 * 令牌桶配置
 */
const TokenBucketConfigSchema = Type.Object({
  size: Type.Number({ minimum: 1, maximum: 100 }),
  refillRate: Type.Number({ minimum: 0.1, maximum: 10 }),
});

/**
 * 完整配置 Schema
 */
const ConfWriteConfigSchema = Type.Object({
  writing: WritingConfigSchema,
  review: ReviewConfigSchema,
  scheduler: SchedulerConfigSchema,
  rateLimit: RateLimitConfigSchema,
  tokenBucket: TokenBucketConfigSchema,
});

export type ConfWriteConfig = Static<typeof ConfWriteConfigSchema>;
export type WritingConfig = Static<typeof WritingConfigSchema>;
export type ReviewConfig = Static<typeof ReviewConfigSchema>;
export type SchedulerUserConfig = Static<typeof SchedulerConfigSchema>;
export type RateLimitConfig = Static<typeof RateLimitConfigSchema>;
export type TokenBucketConfig = Static<typeof TokenBucketConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ConfWriteConfig = {
  writing: {
    minChapterChars: 8000,
    maxRounds: 5,
    // Bug 36 修复：wordBudget 配置化默认值
    defaultWordBudget: {
      target: 6500,
      tolerance: 0.2,  // 20% 容差，即 5200-7800
    },
  },
  review: {
    acceptMediumMax: 3,
    rejectHighMin: 3,
  },
  scheduler: {
    maxConcurrency: 1,
    maxTurnsPerTask: 40,
    taskTimeoutMs: 600000,
    maxTaskRetries: 1,
    maxIterations: 100,
  },
  rateLimit: {
    baseDelayMs: 60000,
    phase1Retries: 2,
    phase1Multiplier: 2,
    phase2Multiplier: 12,
  },
  tokenBucket: {
    size: 10,
    refillRate: 0.5,
  },
};

/**
 * 配置文件名
 */
const CONFIG_FILENAME = 'confwrite.config.json';

/**
 * 加载配置文件
 * @param projectDir 项目目录
 * @returns 合并后的配置
 */
export function loadConfig(projectDir: string): ConfWriteConfig {
  const configPath = join(projectDir, CONFIG_FILENAME);
  
  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read config file: ${configPath}. ${err}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Invalid JSON in config file: ${configPath}. ${err}`);
  }

  // 先合并默认值，再验证（这样部分配置也能通过验证）
  const merged = mergeConfig(DEFAULT_CONFIG, parsed as Partial<ConfWriteConfig>);
  
  // 验证合并后的配置
  if (!Value.Check(ConfWriteConfigSchema, merged)) {
    const errors = [...Value.Errors(ConfWriteConfigSchema, merged)];
    const errorMessages = errors.map(e => `${e.path}: ${e.message}`).join(', ');
    throw new Error(`Invalid config values in ${configPath}: ${errorMessages}`);
  }

  return merged;
}

/**
 * 深度合并配置
 */
export function mergeConfig(
  base: ConfWriteConfig,
  override: Partial<ConfWriteConfig>
): ConfWriteConfig {
  return {
    writing: { ...base.writing, ...override.writing },
    review: { ...base.review, ...override.review },
    scheduler: { ...base.scheduler, ...override.scheduler },
    rateLimit: { ...base.rateLimit, ...override.rateLimit },
    tokenBucket: { ...base.tokenBucket, ...override.tokenBucket },
  };
}
