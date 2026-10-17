export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',     // 新功能 → MINOR
      'fix',      // Bug 修复 → PATCH
      'docs',     // 文档变更
      'style',    // 代码格式（不影响逻辑）
      'refactor', // 重构
      'perf',     // 性能优化
      'test',     // 测试相关
      'build',    // 构建系统/外部依赖
      'ci',       // CI 配置
      'chore',    // 其他杂务
      'revert',   // 回滚
    ]],
    'subject-case': [0],           // 不限制大小写（中文 subject 常见）
    'subject-max-length': [1, 'always', 100],  // subject 超过 100 字符警告
  },
};
