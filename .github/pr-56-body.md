## 关联 Issue

Closes #56

## 变更类型

- [x] 新功能
- [x] 测试

## 变更描述

实现原子日志写入，防止崩溃时日志文件损坏。

### 主要改动

1. **src/logging/index.ts**
   - 使用 temp + rename 模式进行原子写入
   - 先写入 `.tmp` 临时文件，再原子重命名为目标文件
   - 写入失败时自动清理临时文件

2. **tests/logging/atomic-writing.test.ts**
   - 4 个回归测试验证原子写入行为
   - 测试覆盖：无临时文件残留、日志非空、并发写入安全、dispose 后完整性

3. **specs/module-contracts.md**
   - 新增 §7 日志写入契约
   - 添加 LOG-1~3 不变量

### 技术细节

**原子写入实现**：
```typescript
const tempPath = logPath + '.tmp';
writeFileSync(tempPath, content, 'utf-8');
renameSync(tempPath, logPath);
```

**优势**：
- 防止崩溃时日志文件损坏（部分写入）
- Windows 和 Linux 上 `renameSync` 都是原子操作
- 写入失败时自动清理临时文件

**性能影响**：
- 每次写入需要两次文件操作（write + rename）
- 但保证了日志完整性，适合诊断场景

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] specs/module-contracts.md 已更新（LOG-1~3）
- [x] README.md 目录结构与实际一致
- [x] AGENTS.md 架构描述与代码一致

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1340 passed, 27 skipped）
- [x] 新增测试覆盖新功能（4 个测试用例）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不 mock fs，用临时目录
