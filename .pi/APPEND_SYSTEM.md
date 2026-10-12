# ConfWrite 强制规则

以下规则必须严格遵守，违反会导致构建失败或运行时错误。

## 构建验证

改完任何 src/ 下的代码后，**必须立即执行**：
```bash
npm run build && npm test
```
`dist/` 不被 git 跟踪。不 build 会静默运行旧代码。

## ESM 导入

所有相对导入必须带 `.js` 后缀：
```typescript
import { Foo } from './bar.js';   // ✅
import { Foo } from './bar';      // ❌ 编译后找不到
```

## 状态持久化

所有 `ProjectState` 修改必须通过 `ProjectStore.save()` 写回 JSON。进程随时可能中断，未持久化的状态会丢失。

## 测试规范

- 测试放 `tests/`，镜像 `src/` 结构，文件名 `*.test.ts`
- 用 vitest（`describe/it/expect`）
- Mock 执行器用 `MockSubagentExecutor`（`src/scheduler/mock-executor.ts`）
- 不要 mock `fs`——用临时目录 + `afterEach` 清理

## 跨平台

代码运行在 Windows 和 Linux 上：
- 路径用 `path.join()`
- Shell 按平台选：Windows → powershell，Linux → bash

## AI 开发流程

遵循 `AGENTS.md` 中的缺陷修复闭环：先复现用户症状，追查完整数据流和状态转换，补充覆盖原始症状的回归验证，并如实报告运行过的命令与结果。局部测试通过不能表述为真实 pi 流程已验证。

跨模块改动要核对规则的来源及所有消费者；并行 agent 开始前先划定职责边界，避免共同修改同一业务链路而缺少集成验证。

修改源码后执行 `npm run build` 和相关测试；改动影响较广时运行 `npm test`。文档只更新受行为、接口、配置或架构变化影响的部分。仓库 Issue/PR 协作按现有模板与 CI 执行，不默认自动合并。
