# Bug: store.ts 使用模板字符串拼接路径

**状态**: 🔴 待修复  
**发现时间**: 2026-10-12  
**影响范围**: 状态持久化（ProjectStore）  
**严重程度**: P2 - 警告  
**GitHub Issue**: [#36](https://github.com/clodyWp/confwrite/issues/36)

## 问题描述

`src/state/store.ts` 第 16 行使用模板字符串拼接路径，而非 `path.join()`，在 Windows 上可能产生混合分隔符的路径。

## 代码位置

`src/state/store.ts:16`

```typescript
// ❌ 当前代码
this.statePath = `${projectDir}/project-state.json`;
```

## 问题

在 Windows 上，如果 `projectDir` 是 `C:\Users\...`，结果是：

```
C:\Users\.../project-state.json
```

这是混合分隔符路径（`\` 和 `/` 混用），虽然 Node.js 通常能处理，但不符合跨平台最佳实践。

## 修复方案

```typescript
import { join } from 'node:path';

// ✅ 修复后
this.statePath = join(projectDir, 'project-state.json');
```

## 影响

- 严重程度：P2
- 影响范围：Windows 平台
- 当前状态：代码可以工作，但不符合最佳实践

## 相关文件

- `src/state/store.ts` - ProjectStore 类
