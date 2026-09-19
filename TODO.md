# 待办与交接（ConfWrite）

> 记录时间：2026-09-19 晚
> 主要分支：`feat/tool-least-privilege`

---

## 1. 当前状态快照

### 仓库

| 项 | 值 |
|----|-----|
| 所在分支 | `feat/tool-least-privilege` |
| 工作区 | 干净（0 个未提交改动） |
| 相对 master | 领先 5 个提交 |
| `dist/` 构建于 | 2026-09-19 23:38，**来自本分支** |
| 当前 dist 是否含「职责分离」prompt | **否**（本分支基于 master） |

### 三个分支

```
4d30e14 (master)  ← v0.7.3 已发布基线
├── f62f85c  feat/responsibility-separation   （prompt 职责分离）
└── 0bd69f2  feat/tool-least-privilege        （工具最小权限 + turn 预算）← 当前
```

### 当前 `dist/` 实际包含的能力

| 能力 | 状态 |
|------|------|
| 素材包注入文件路径 | ✅（master 已有） |
| 跨平台 shell 选择 | ✅（master 已有） |
| **writer/fixer 无 shell** | ✅ 本分支 |
| **turn 硬预算（默认 40）** | ✅ 本分支 |
| prompt「写完就结束」 | ❌ 不在本分支 |

> **有价值的副作用**：当前构建恰好是**只含工具限制、不含 prompt 改动**的版本。
> 这是一个干净的单变量实验条件，可用于单独度量「工具最小权限」的效果。

---

## 2. 已完成

| 阶段 | 内容 | 提交 | 测试 |
|------|------|------|------|
| — | 计划文档 | `a669542` | — |
| — | Git 操作指南 | `c869e35` | — |
| P1/P2 | 角色工具最小权限 | `f4208e4` | +20 例 |
| P3 | 输出目录预创建 | — | **无需代码**（见 §5） |
| P4 | turn 硬预算 | `2fb533c` | +23 例 |
| P5 | 全量回归 | — | **641 通过** |
| — | 进度更新 | `0bd69f2` | — |

### 测试基线

```
全量：641 passed (72 files)
├─ 原有 602
├─ 新增 pi-executor-tools.test.ts   20 例
└─ 新增 pi-executor-budget.test.ts  23 例
（删除 pi-executor-platform.test.ts 4 例 —— 它在测试内复制逻辑而非调用真实源码）
```

---

## 3. 待办

### P6 真机验证（最高优先，被 429 阻塞）

**目标**：

| ID | 验收 |
|----|------|
| G1 | writer / fixer 会话中 `bash` 调用数 **恒为 0** |
| G2 | turn 超限时任务被判**失败**，不污染状态机 |
| — | 采集正常章节的 turn 基线（用于校准预算默认值 40） |

**必须先验的最小假设**：

> `void session.abort()` 之后，`await session.prompt()` 是否**确实 resolve**？

若不会 resolve，任务会**挂死**而非失败 —— 比不做预算更糟。这是本分支唯一无法靠单测覆盖的假设。

**低成本验法（建议先做这个）**：
写一个默认 `skip` 的集成测试，`maxTurnsPerTask=2` + 一个必然需要多轮的任务，
验证链路：`abort → prompt resolve → classifyOutcome 判失败`。
消耗 token 极少，不必等完整基准测试。

**完整基准测试**（方法论已在计划 §5.2 修正）：

必须满足：
1. **干净初始状态** —— 先清空 `drafts/chapters/`，否则模型只做校验不写作
2. **同章 ≥3 轮** —— 单样本受采样随机性影响
3. **成对比较** —— 同章、同素材、仅改被测变量

### P7 对抗性验证

构造故意诱导「反复校验字数直到达标」的 prompt，验证：
- writer 的 bash 调用仍为 0（工具缺失，物理不可能）
- turn 数不突破预算

### P8 合并策略与汇总报告

需要决定：`feat/tool-least-privilege` 与 `feat/responsibility-separation`
是分别合并到 master，还是先合并到一起再联合验证。

---

## 4. 恢复工作的方法

```bash
# ① 进入仓库，确认状态
cd /home/water/Projects/confidenceWriter
git branch --show-current      # 应为 feat/tool-least-privilege
git status --short             # 应为空

# ② 看本分支的提交
git log --oneline master..HEAD

# ③ 确认 dist 版本（务必，否则可能跑旧代码）
grep -c "budget exhausted" dist/scheduler/pi-executor.js   # >0 = 预算已实现
grep -c "写完就结束" dist/writing/task-executor.js          # 0 = 不含职责分离

# ④ 如需重新构建
npm run build
npm test

# ⑤ 切换分支（详见 GIT-GUIDE.md）
git checkout feat/responsibility-separation
npm run build        # ← 切分支后必须 build，否则跑的还是旧代码
```

> **重要**：`dist/` 不被 git 跟踪。切分支**不会**改变 `dist/`。
> 忘了 `npm run build` 会静默运行旧版本（不报错）。

---

## 5. 已确认的技术事实（避免重复调查）

### P3 无需代码：pi 的 write 工具自动创建父目录

```javascript
// pi/dist/core/tools/write.js
description: "Write content to a file. ... Automatically creates parent directories."
await ops.mkdir(dir);
```

### 429 限流

t3 的 LmERP2 任务因 429 停止。已知原因：并行执行会触发 qwen3.7-plus 限流。
当前配置 `maxConcurrency: 1` 已串行，仍可能触发。

### 判定顺序是预算成立的前提

`abort()` 后 `stopReason` 可能仍是 `'stop'`。若先判 `stopReason`，
被中止的任务会被判成**成功**。该顺序由 `classifyOutcome()` 集中实现并单测锁定。

### 预算必须放在 `verboseLog` 早退之前

subscribe 回调开头是 `if (!verboseLog) return;`。
预算逻辑若写在它后面，**关闭日志时预算静默失效**。

---

## 6. t3 / LmERP2 项目状态

| 项 | 值 |
|----|-----|
| 路径 | `/home/water/Projects/t3/projects/LmERP2` |
| 阶段 | `4a`（写作） |
| round | 1 |
| 章节 | 2 written（ch001/ch002）、13 pending |
| 草稿 | `drafts/chapters/ch001-v1.md`（89 KB）、`ch002-v1.md`（82 KB） |
| 停止原因 | 429 限流 |
| 素材包 | 已重新生成，**含文件路径信息** |
| herdr 会话 | 已退出（当前只有 confidenceWriter 这个会话） |

---

## 7. 历史基线数据（供比较，含一条无效结论）

### ch001（writer，旧 prompt）—— 有效

| 指标 | 值 |
|------|-----|
| Turns | 34 |
| Tool calls | 66 |
| 其中 bash | **28**（27 次是字数统计，仅 1 次 mkdir 必要） |
| 其中 edit | 26（反复补充） |
| Duration | 18.5 分钟 |
| 产出 | 89 KB |

**结论**：53/66（80%）的工具调用属于病理性校验循环。

### ch002「7 turns」—— ⚠️ 此对比无效，勿引用

第 2 次运行（新 prompt）**没有调用任何 write/edit**，只是读取第 1 次运行
遗留的草稿并校验。7 turns 衡量的是「校验」，不是「写作」。

```
logs/subagent-write-ch002-r1.log
  L1  : 14:46:06 Task started   ← 第1次（写入者，ch002-v1.md mtime 22:51）
  L85 : 14:53:10 Task started   ← 第2次（仅校验，无写入）
  L127: 14:54:11 Task completed. Turns: 7, Tool calls: 8
```

**教学价值**：在没有干净初始状态的项目上重跑，模型只做校验。
这正是 §3 P6 要求「先清空 drafts」的原因。

---

## 8. 附带产出

| 文件 | 内容 |
|------|------|
| `PLAN-tool-least-privilege.md` | 完整开发计划 + 进度 + 风险 + 待决策 |
| `GIT-GUIDE.md` | Git 分支操作指南（面向不熟悉 git 者） |
| `ITERATION-PLAN-v0.7.3.md` | 上一轮迭代计划 |
| `ITERATION-COMPLETE-v0.7.3.md` | 上一轮迭代完成报告 |
