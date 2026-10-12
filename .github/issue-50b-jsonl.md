## 背景

当前 `src/logging/index.ts:88` 每个事件触发全量重写：

```typescript
writeFileSync(logPath, JSON.stringify(this.logEntries, null, 2));
```

这是 O(n²) I/O，1000+ 事件时效率低。

## 改进方案

改为 JSONL（JSON Lines）追加模式：

```typescript
appendFileSync(logPath, JSON.stringify(event) + '\n');
```

## 验收标准

- [ ] 日志文件改为 `.jsonl` 格式
- [ ] 每个事件追加写入（不重写）
- [ ] 可以用 `grep`/`tail` 查询
- [ ] `npm run build && npm test` 通过
- [ ] 更新 CHANGELOG.md

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不要 mock `fs`，用临时目录

## 参考

- Council 分析：Issue #50
- 当前实现：`src/logging/index.ts`
