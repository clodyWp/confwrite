## 关联 Issue

Closes #54

## 变更类型

- [x] 新功能
- [x] 重构
- [x] 测试

## 变更描述

将日志系统从全量重写改为 JSONL 增量追加格式。

**之前**：每个事件触发 `writeFileSync(JSON.stringify(logEntries))`，O(n²) I/O
**之后**：每个事件 `appendFileSync(JSON.stringify(event) + '\n')`，O(1) I/O

### 主要改动

1. **src/logging/index.ts**
   - 移除 `logEntries` 内存数组
   - 替换 `flushLog()` 为 `appendLog()`
   - 使用 `appendFileSync` 替代 `writeFileSync`
   - 默认文件名从 `.json` 改为 `.jsonl`

2. **src/index.ts**
   - 更新默认日志文件名为 `confwrite-log.jsonl`

3. **specs/module-contracts.md**
   - 添加 §3.9 Logging contracts (LOG-1~LOG-3)

4. **tests/logging/jsonl-incremental.test.ts**
   - 5 个新测试覆盖 JSONL 格式、追加行为、可查询性、默认文件名、1000 事件性能

### 性能提升

- **之前**：1000 事件 = 1000 次全量写入（O(n²)）
- **之后**：1000 事件 = 1000 次追加写入（O(n)）

### 日志查询

JSONL 格式支持 `grep`/`tail` 查询：

```bash
# 查找所有 phase.transition 事件
grep '"type":"phase.transition"' logs/confwrite-log.jsonl

# 实时查看日志
tail -f logs/confwrite-log.jsonl
```

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] specs/module-contracts.md 已更新（LOG-1~LOG-3）
- [x] README.md 目录结构与实际一致
- [x] AGENTS.md 架构描述与代码一致

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1341 passed, 27 skipped）
- [x] 新增测试覆盖新功能（5 个测试用例）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不 mock fs，用临时目录
