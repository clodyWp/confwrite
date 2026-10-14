# Spec: PiSubagentExecutor SDK 交互

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **源码**: `src/scheduler/pi-executor.ts`  
> **状态**: 有效（基于 v0.23.0 代码审计）  
> **关联 Issue**: #89

---

## 1. 目的

定义 `PiSubagentExecutor` 与 pi-coding-agent SDK 的交互行为规格。

`PiSubagentExecutor` 是生产环境的真实执行器，通过 `@earendil-works/pi-coding-agent` SDK 创建子会话执行任务。本 spec 覆盖 SDK 调用的正常路径、错误路径和边界条件，为集成测试提供行为契约。

**不在范围内**：
- `TurnBudget` / `classifyOutcome` 的纯逻辑（已由 `pi-executor-budget.test.ts` 覆盖）
- `resolveShellTool` / `DEFAULT_TOOLS`（已由 `pi-executor-platform.test.ts` 覆盖）
- Runner 层的重试/限流逻辑（已由 `runner-retry.test.ts` 等覆盖）

---

## 2. SDK 交互面

`PiSubagentExecutor.execute()` 与 SDK 的交互点：

| # | SDK 调用 | 阶段 | 失败模式 |
|---|---------|------|---------|
| 1 | `import('@earendil-works/pi-coding-agent')` | 动态导入 | 模块不存在/版本不兼容 |
| 2 | `ModelRuntime.create()` + `getModel(provider, id)` | 模型解析 | 模型 ID 无效 |
| 3 | `SessionManager.inMemory()` | 会话管理初始化 | 极少失败 |
| 4 | `createAgentSession(opts)` | 会话创建 | API 错误/认证失败 |
| 5 | `session.setThinkingLevel(level)` | 思考级别设置 | 无效级别 |
| 6 | `session.subscribe(callback)` | 事件订阅 | 返回 unsubscribe 函数 |
| 7 | `session.prompt(text)` | 发送提示并等待完成 | 网络错误/超时/LLM 错误 |
| 8 | `session.abort()` | 预算超限时中止 | 中止后 stopReason 可能仍为 'stop' |
| 9 | `session.messages` | 读取消息历史 | 空数组/无 assistant 消息 |
| 10 | `session.dispose()` | 清理资源 | 极少失败 |

---

## 3. 行为不变量

### INV-PE-1: 动态导入失败 → 返回结构化错误

**前置**: `@earendil-works/pi-coding-agent` 模块不可用（如测试环境未安装）  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: string, durationMs: number }`
- `output` 包含 `"Execution failed:"` 前缀
- `durationMs >= 0`
- 不抛出异常

**验证方式**: Mock `vi.mock('@earendil-works/pi-coding-agent', () => { throw ... })` 或模拟导入失败

---

### INV-PE-2: 模型解析失败 → 返回模型未找到错误

**前置**: `options.model = "invalid-provider/invalid-model"`  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: "Model not found: invalid-provider/invalid-model", durationMs: number }`
- 不调用 `createAgentSession`
- `durationMs >= 0`

**验证方式**: Mock `ModelRuntime.create()` 返回含 `getModel()` 返回 `undefined` 的对象

---

### INV-PE-3: 正常执行 → 成功返回输出

**前置**: SDK 正常可用，`session.prompt()` 正常完成  
**动作**: `execute(task)`  
**后置**:
- 任务上下文写入 `${projectDir}/.confwrite-tasks/${task.id}.md`
- 返回 `{ success: true, output: string, durationMs: number }`
- `output` 为 assistant 消息中的 text content 拼接
- `session.dispose()` 被调用
- `unsubscribe()` 被调用

**验证方式**: Mock 完整 SDK 链路，验证返回值和副作用

---

### INV-PE-4: session.prompt() 抛出异常 → 返回执行失败

**前置**: `session.prompt()` 抛出 `Error("Network timeout")`  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: "Execution failed: Network timeout", durationMs: number }`
- 不抛出异常（外层 try/catch 捕获）
- `durationMs >= 0`

**验证方式**: Mock `session.prompt` 为 `async () => { throw new Error('Network timeout') }`

---

### INV-PE-5: createAgentSession 抛出异常 → 返回执行失败

**前置**: `createAgentSession()` 抛出 `Error("Authentication failed")`  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: "Execution failed: Authentication failed", durationMs: number }`
- 不抛出异常

**验证方式**: Mock `createAgentSession` 为 `async () => { throw new Error('Authentication failed') }`

---

### INV-PE-6: 无 assistant 消息 → 判定失败

**前置**: `session.prompt()` 成功但 `session.messages` 中无 `role === 'assistant'` 的消息  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: "No assistant response received", durationMs: number }`
- `session.dispose()` 仍被调用

**验证方式**: Mock `session.messages` 为空数组或仅含 user 消息

---

### INV-PE-7: LLM 错误 → 判定失败

**前置**: assistant 消息含 `stopReason: 'error'` 或 `errorMessage: 'rate limited'`  
**动作**: `execute(task)`  
**后置**:
- 返回 `{ success: false, output: "LLM error: rate limited (stopReason: error)", durationMs: number }`
- 错误信息包含原始 errorMessage 和 stopReason

**验证方式**: Mock assistant 消息含错误字段

---

### INV-PE-8: 任务上下文文件写入

**前置**: 任意有效 task  
**动作**: `execute(task)`  
**后置**:
- 文件 `${projectDir}/.confwrite-tasks/${task.id}.md` 存在
- 文件内容 === `task.prompt`
- 目录 `.confwrite-tasks/` 自动创建（`recursive: true`）

**验证方式**: 使用临时目录，执行后检查文件存在性和内容

---

### INV-PE-9: thinkingLevel 设置

**前置**: `options.thinkingLevel = 'high'`  
**动作**: `execute(task)`  
**后置**:
- `session.setThinkingLevel('high')` 被调用恰好一次

**前置**: `options.thinkingLevel` 未指定  
**动作**: `execute(task)`  
**后置**:
- `session.setThinkingLevel()` 不被调用

**验证方式**: Mock session 对象，验证 `setThinkingLevel` 调用次数

---

### INV-PE-10: 事件订阅与取消订阅

**前置**: 任意有效执行  
**动作**: `execute(task)`  
**后置**:
- `session.subscribe()` 被调用，返回 unsubscribe 函数
- 执行完成后 `unsubscribe()` 被调用恰好一次
- `session.dispose()` 被调用恰好一次

**验证方式**: Mock session，spy subscribe 返回值，验证调用次数

---

### INV-PE-11: 工具集解析

**前置**: `options.tools` 未指定  
**动作**: 构造 `PiSubagentExecutor`  
**后置**: `createAgentSession` 收到的 `tools` 为 `DEFAULT_TOOLS`

**前置**: `options.tools = ['read', 'write']`  
**动作**: 构造 `PiSubagentExecutor`  
**后置**: `createAgentSession` 收到的 `tools` 为 `['read', 'write']`

**验证方式**: 捕获 `createAgentSession` 的参数

---

### INV-PE-12: 输出提取 — 多 content 块

**前置**: assistant 消息的 `content` 为数组，含多个 `{ type: 'text', text: string }` 块  
**动作**: `extractOutput(msg)`  
**后置**:
- 返回所有 text 块的 `text` 以 `\n` 拼接
- 非 text 类型的块被忽略

**前置**: `content` 为字符串  
**动作**: `extractOutput(msg)`  
**后置**: 返回 `String(content)`

**前置**: `content` 为 `undefined`  
**动作**: `extractOutput(msg)`  
**后置**: 返回空字符串

---

## 4. Mock SDK 设计

### 4.1 Mock 结构

```typescript
/** 模拟 SDK 模块 */
function createMockSDK(overrides?: Partial<MockSDKOverrides>) {
  const session = {
    prompt: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(vi.fn()), // returns unsubscribe
    dispose: vi.fn(),
    abort: vi.fn(),
    setThinkingLevel: vi.fn(),
    messages: [
      {
        role: 'assistant',
        stopReason: 'stop',
        content: [{ type: 'text', text: 'Task completed successfully' }],
      },
    ],
  };

  const modelRuntime = {
    getModel: vi.fn().mockReturnValue({ id: 'test-model' }),
  };

  return {
    createAgentSession: vi.fn().mockResolvedValue({ session }),
    ModelRuntime: { create: vi.fn().mockResolvedValue(modelRuntime) },
    SessionManager: { inMemory: vi.fn().mockReturnValue({}) },
    _session: session,
    _modelRuntime: modelRuntime,
  };
}
```

### 4.2 测试文件结构

```
tests/scheduler/pi-executor-sdk.test.ts
├── describe('SDK 正常路径')
│   ├── it('INV-PE-3: 正常执行返回成功')
│   ├── it('INV-PE-8: 任务上下文文件写入')
│   ├── it('INV-PE-9: thinkingLevel 设置')
│   ├── it('INV-PE-10: 事件订阅与取消订阅')
│   └── it('INV-PE-11: 工具集解析')
├── describe('SDK 错误路径')
│   ├── it('INV-PE-1: 动态导入失败')
│   ├── it('INV-PE-2: 模型解析失败')
│   ├── it('INV-PE-4: prompt 抛出异常')
│   ├── it('INV-PE-5: createAgentSession 抛出异常')
│   ├── it('INV-PE-6: 无 assistant 消息')
│   └── it('INV-PE-7: LLM 错误')
└── describe('输出提取')
    └── it('INV-PE-12: 多 content 块提取')
```

### 4.3 Mock 注入策略

由于 `PiSubagentExecutor` 使用**动态 import** (`await import('@earendil-works/pi-coding-agent')`)，测试需使用 vitest 的 `vi.mock()` 在模块级别拦截：

```typescript
vi.mock('@earendil-works/pi-coding-agent', () => mockSDK);
```

每个测试用例通过修改 `mockSDK` 的内部状态模拟不同场景。使用 `beforeEach` 重置 mock，`afterEach` 清理临时目录。

---

## 5. 集成测试用例设计

### TC-SDK-1: 端到端正常执行

**场景**: SDK 全链路正常  
**步骤**:
1. 创建临时目录作为 `projectDir`
2. Mock SDK 返回正常 session + assistant 消息
3. 构造 `PiSubagentExecutor({ projectDir, ... })`
4. 调用 `execute({ id: 'test-1', type: 'writer', ... })`

**预期**:
- `result.success === true`
- `result.output` 包含 assistant 文本
- `result.durationMs >= 0`
- `.confwrite-tasks/test-1.md` 文件存在且内容 === task.prompt
- `session.dispose()` 被调用
- `unsubscribe()` 被调用

---

### TC-SDK-2: SDK 认证失败

**场景**: `createAgentSession` 抛出认证错误  
**步骤**:
1. Mock `createAgentSession` 抛出 `Error("API key invalid")`
2. 调用 `execute(task)`

**预期**:
- `result.success === false`
- `result.output` 包含 `"Execution failed: API key invalid"`
- 不抛出异常

---

### TC-SDK-3: LLM 返回错误状态

**场景**: prompt 成功但 assistant 消息含 `stopReason: 'error'`  
**步骤**:
1. Mock session.messages 含 `{ role: 'assistant', stopReason: 'error', errorMessage: 'content policy violation' }`
2. 调用 `execute(task)`

**预期**:
- `result.success === false`
- `result.output` 包含 `"LLM error"` 和 `"content policy violation"`

---

### TC-SDK-4: 模型不存在

**场景**: 指定了无效模型 ID  
**步骤**:
1. 构造 `PiSubagentExecutor({ model: 'bad-provider/bad-model', ... })`
2. Mock `ModelRuntime.getModel()` 返回 `undefined`
3. 调用 `execute(task)`

**预期**:
- `result.success === false`
- `result.output === "Model not found: bad-provider/bad-model"`
- `createAgentSession` 未被调用

---

## 6. 重试策略说明

`PiSubagentExecutor` **自身不实现重试**。重试逻辑位于 `TaskRunner`（`src/scheduler/runner.ts`），通过 `attempt` 计数和指数退避实现。

本 spec 的测试仅验证单次 `execute()` 调用的行为。重试场景由 `tests/scheduler/runner-retry.test.ts` 覆盖。

---

## 7. 与现有 Spec 的关系

| 关联 Spec | 关系 |
|-----------|------|
| `specs/state-machine.md` | 执行器是 Phase 4a 动作的执行层，状态机不关心执行器内部 |
| `specs/module-contracts.md` | MC-4（路径拼接）、MC-8（失败不静默）适用于本模块 |

---

## 8. 变更历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-10-12 | 1.0 | 初始版本，Issue #89 |
