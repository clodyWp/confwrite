# Issue #89: P4 — PiSubagentExecutor SDK 交互测试

**父 Issue**: #86

## 问题

`PiSubagentExecutor`（`src/scheduler/pi-executor.ts`，400 行）是真实 LLM 调用的执行层，包含：
- `createAgentSession()` 创建子会话
- `session.prompt()` 发送任务
- `stopReason` 判定（stop / toolUse / error）
- `abort()` 中止逻辑
- Turn 预算检查
- Outcome 分类（`classifyOutcome`）

现有测试（`pi-executor-budget.test.ts`）只覆盖了：
- ✅ `TurnBudget` 类（纯逻辑）
- ✅ `classifyOutcome` 函数（纯逻辑）

未覆盖：
- ❌ `execute()` 方法的 SDK 交互流程
- ❌ `createAgentSession` 的 mock 和调用
- ❌ 文件写入逻辑（prompt 文件、输出文件）
- ❌ EventBus 事件发射
- ❌ 错误处理和重试流程

## 方案

### Mock pi SDK

```typescript
// tests/helpers/mock-pi-sdk.ts
export function createMockSession(responses: MockResponse[]) {
  let callIndex = 0;
  return {
    prompt: vi.fn().mockImplementation(async (prompt: string) => {
      const response = responses[callIndex++] ?? responses[responses.length - 1];
      return {
        stopReason: response.stopReason,
        text: response.text,
        errorMessage: response.errorMessage,
      };
    }),
    abort: vi.fn(),
  };
}
```

### 测试场景

```typescript
describe('PiSubagentExecutor.execute()', () => {
  it('session.prompt() 返回 stop → success + 写输出文件', async () => { ... });
  it('session.prompt() 返回 toolUse → success（工具调用也算成功）', async () => { ... });
  it('session.prompt() 返回 error → failure + 写错误日志', async () => { ... });
  it('session.prompt() 有 errorMessage → failure', async () => { ... });
  it('turn 超限 → abort() 被调用 + failure', async () => { ... });
  it('writer 任务 → 写 prompt 文件到 drafts/', async () => { ... });
  it('reviewer 任务 → 写 prompt 文件到 review/', async () => { ... });
  it('EventBus 发射 tool.call 事件', async () => { ... });
  it('EventBus 发射 budget.* 事件', async () => { ... });
  it('verboseLog=true 时写详细日志', async () => { ... });
});
```

## 涉及文件

| 源文件 | 测试文件 |
|--------|----------|
| `src/scheduler/pi-executor.ts` | `tests/scheduler/pi-executor-execute.test.ts`（新建） |

## 注意事项

- 需要 mock `createAgentSession`（来自 pi-subagents SDK）
- 不能真实调用 LLM，只验证 SDK 交互逻辑
- 文件 I/O 用临时目录 + afterEach 清理

## 验收标准

- [ ] ≥ 8 个 PiSubagentExecutor 交互测试
- [ ] 覆盖：成功/失败/中止/事件发射/文件写入
- [ ] 所有测试通过
- [ ] 不依赖真实 LLM 调用

## 文档更新

- [ ] CHANGELOG.md — 添加条目

## 预估工时

2 小时
