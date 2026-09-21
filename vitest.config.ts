import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['confwrite/**'],
    // 默认 5s 对 e2e 测试太紧：它们要真实地组装、定稿、调用外部工具，
    // 在全套并行执行时会偶发超时（单独跑同样用例约 2-6s）。
    // 放宽到 15s 只影响「本会失败」的用例，不会掩盖真实卡死。
    testTimeout: 15000,
  },
});
