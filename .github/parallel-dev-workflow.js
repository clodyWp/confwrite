// Parallel development workflow for Phase 2-4
const results = await runs.all([
  {
    key: "phase2-precommit-tui",
    label: "Phase 2: Pre-commit + TUI",
    agent: "worker",
    task: `Phase 2: 实现 Pre-commit Hook (#93) 和 TUI 状态行 (#73)

## 任务
按 SDD/TDD 流程实现两个功能：
1. Issue #93: Pre-commit Hook（husky + lint-staged）
2. Issue #73: TUI 状态行改进

## 工作流程
1. 读取 spec 文件：
   - specs/pre-commit-hook.md
   - specs/tui-status-line.md
2. 为每个 issue 创建独立分支：
   - feature/issue-93-pre-commit-hook
   - feature/issue-73-tui-status-line
3. 按 TDD 流程实现：
   - 写失败测试（覆盖 spec 中的不变量）
   - 实现代码让测试通过
   - 运行 npm run build && npm test
4. 创建 PR（不合并）：
   - PR #93: title="feat: 添加 pre-commit hook (#93)"
   - PR #73: title="feat: TUI 状态行改进 (#73)"
5. 等待 CI 检查通过

## 输出要求
- 报告每个 issue 的 PR 编号和状态
- 报告测试结果（通过/失败）
- 如果有冲突或问题，详细说明`
  },
  {
    key: "phase3-dirty-llm-impact",
    label: "Phase 3: Dirty Mock + LLM + Impact",
    agent: "worker",
    task: `Phase 3: 实现 Dirty Mock (#87)、LLM 边界 (#91)、影响分析 (#94)

## 任务
按 SDD/TDD 流程实现三个测试体系改进：
1. Issue #87: Dirty Mock 测试（模拟 LLM 异常输出）
2. Issue #91: LLM 解析边界测试
3. Issue #94: 变更影响分析工具

## 工作流程
1. 读取 spec 文件：
   - specs/dirty-mock-testing.md
   - specs/llm-parse-boundary.md
   - specs/impact-analysis.md
2. 为每个 issue 创建独立分支：
   - feature/issue-87-dirty-mock
   - feature/issue-91-llm-boundary
   - feature/issue-94-impact-analysis
3. 按 TDD 流程实现：
   - 写失败测试（覆盖 spec 中的不变量）
   - 实现代码让测试通过
   - 运行 npm run build && npm test
4. 创建 PR（不合并）：
   - PR #87: title="test: 添加 Dirty Mock 测试 (#87)"
   - PR #91: title="test: 添加 LLM 解析边界测试 (#91)"
   - PR #94: title="feat: 添加变更影响分析工具 (#94)"
5. 等待 CI 检查通过

## 输出要求
- 报告每个 issue 的 PR 编号和状态
- 报告测试结果（通过/失败）
- 如果有冲突或问题，详细说明`
  },
  {
    key: "phase4-outline-executor",
    label: "Phase 4: Outline + PiExecutor",
    agent: "worker",
    task: `Phase 4: 实现 OutlineGenerator 集成 (#90) 和 PiExecutor SDK (#89)

## 任务
按 SDD/TDD 流程实现两个集成测试：
1. Issue #90: OutlineGenerator 与 LLM 边界情况集成测试
2. Issue #89: PiSubagentExecutor SDK 测试

## 工作流程
1. 读取 spec 文件：
   - specs/outline-llm-integration.md
   - specs/pi-executor-sdk.md
2. 为每个 issue 创建独立分支：
   - feature/issue-90-outline-integration
   - feature/issue-89-pi-executor-sdk
3. 按 TDD 流程实现：
   - 写失败测试（覆盖 spec 中的不变量）
   - 实现代码让测试通过
   - 运行 npm run build && npm test
4. 创建 PR（不合并）：
   - PR #90: title="test: OutlineGenerator 集成测试 (#90)"
   - PR #89: title="test: PiSubagentExecutor SDK 测试 (#89)"
5. 等待 CI 检查通过

## 输出要求
- 报告每个 issue 的 PR 编号和状态
- 报告测试结果（通过/失败）
- 如果有冲突或问题，详细说明`
  }
]);

return results;
