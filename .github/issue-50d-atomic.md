## 背景

当前 `src/logging/index.ts:88` 使用 `writeFileSync` 直接写入日志文件。

Windows 上如果进程崩溃（如断网、OOM），可能产生 0 字节文件，导致日志丢失。

## 改进方案

使用原子写入（temp + rename）：

```typescript
// 写入临时文件，然后原子 rename
const tempPath = logPath + '.tmp';
writeFileSync(tempPath, content);
renameSync(tempPath, logPath);
```

## 验收标准

- [ ] 日志写入使用 temp + rename
- [ ] 崩溃后日志文件不为 0 字节
- [ ] `npm run build && npm test` 通过
- [ ] 更新 CHANGELOG.md

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不要 mock `fs`，用临时目录
- 需要跨平台测试（Windows + Linux）

## 参考

- Council 分析：Issue #50
- 当前实现：`src/logging/index.ts`
