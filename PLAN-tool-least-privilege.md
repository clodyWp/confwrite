# 开发计划：工具最小权限 + Turn 硬预算

- **分支**：`feat/tool-least-privilege`（基点为 `master` @ `4d30e14`）
- **状态**：⏳ 待审阅
- **前置依赖**：`feat/responsibility-separation` 的 prompt 改动（本分支**不含**，见 §7 Q1）

---

## 0. 前置更正：之前的性能结论无效

在制定本计划过程中复核日志，发现之前汇报的 **「34 turns → 7 turns，-79%」对比不成立**。

**证据**：

```
logs/subagent-write-ch002-r1.log
  L1  : 14:46:06 Task started: write-ch002-r1     ← 第 1 次运行（旧 prompt）
  L85 : 14:53:10 Task started: write-ch002-r1     ← 第 2 次运行（新 prompt）
  L127: 14:54:11 Task completed. Turns: 7, Tool calls: 8

drafts/chapters/ch002-v1.md  mtime = 22:51:40      ← 属于第 1 次运行
```

第 2 次运行（新 prompt）的工具序列为：

```
read(任务文件) → read(素材) → bash(ls) → read(ch002-v1.md) → read(offset 206)
→ bash(wc -l -c) → bash(grep -c diagram-start) → bash(grep -c "^##")
```

**全程没有 write / edit 调用**。模型读到第 1 次运行遗留的草稿，校验一遍就宣告完成。

因此：
- 7 turns 衡量的是「校验已有草稿」，不是「写一章」
- 与新 prompt 的有效性无关
- **新 prompt 目前没有任何有效证据**

**另一个必须先说清的事实**：即便在新 prompt 下，模型**仍然**在做长度校验——第 2 次运行 Turn #6 一次性并发 3 个 bash 去数 `wc` 和 `grep -c`。所以 prompt 改动没有消除这个行为，只是让它更快收敛。这与你的判断一致：**是改进，不是解决**。

---

## 1. 问题陈述

### 1.1 病理循环的完整链条

```
prompt 给出「5000 字」这个可在本地验证的目标
        +
bash 提供「wc -m / python 字符统计」这个廉价测量手段
        ↓
measure → adjust → measure → adjust → ...   无界循环
```

### 1.2 量化证据（ch001, writer, 旧 prompt）

| 工具 | 调用数 | 其中属于病理循环 |
|------|--------|-----------------|
| bash | 28 | 27（`wc` / python 统计 / `cd` 后计数） |
| edit | 26 | 26（反复补充） |
| read | 8 | 0 |
| write | 4 | 0 |
| **合计** | **66** | **53（80%）** |

唯一**必要**的 bash 是 1 次 `mkdir -p drafts/chapters`。

### 1.3 为什么 prompt 不够

| 手段 | 硬度 | 执行者 | 能否覆盖 |
|------|------|--------|----------|
| 改 prompt | 软 | 模型自觉 | 不可保证 |
| **限制工具集** | **硬** | harness | **物理不可能** |
| turn 超限 abort | 硬 | 程序 | 可保证 |

---

## 2. 目标

### 硬目标（可机器验证）

| ID | 目标 | 验证方式 |
|----|------|----------|
| G1 | writer / fixer 会话中 `bash` 调用数 **恒为 0** | 日志断言 |
| G2 | 单任务 turn 数存在硬上限，超限即中止 | 单元测试 + 对抗用例 |
| G3 | 超限中止被判定为**失败**，不污染状态机 | 集成测试 |
| G4 | 对抗性诱导（prompt 明确要求反复校验）下仍无法突破上限 | 对抗用例 |

### 软目标（需基线）

| ID | 目标 |
|----|------|
| S1 | 正常章节 turn 数下降 |
| S2 | 产出字数与质量不劣化 |

---

## 3. 设计

### 3.1 角色工具表（最小权限）

| 角色 | 工具集 | 理由 |
|------|--------|------|
| `writer` | `read`, `write`, `edit` | 移除测量手段 → 循环无法自持 |
| `reviewer` | `read`, `write`, `bash` | **度量是它的职责**，保留 |
| `fixer` | `read`, `write`, `edit` | 同 writer |

**实现位置**：`src/scheduler/pi-executor.ts` → `execute(task)` 内

```typescript
// 现状（第 51 行）：全角色共用
const tools = this.options.tools ?? DEFAULT_TOOLS;

// 目标：按角色解析
const TOOLS_BY_ROLE: Record<Task['type'], string[]> = {
  writer:   ['read', 'write', 'edit'],
  reviewer: ['read', 'write', 'bash'],
  fixer:    ['read', 'write', 'edit'],
};
const tools = this.options.tools ?? TOOLS_BY_ROLE[task.type] ?? DEFAULT_TOOLS;
```

**要点**：
- 保留 `options.tools` 覆盖能力（测试 / 高级用户 / 回退逃生口）
- `DEFAULT_TOOLS` 降级为 fallback，不再默认含 shell
- `platform()` 判断仅保留在 `reviewer` 的 shell 名解析上

### 3.2 输出目录预创建

移除 writer 的 bash 后，`mkdir` 能力随之消失。

**必做**：executor 在 `session.prompt()` 之前预创建输出目录

```typescript
mkdirSync(join(this.options.projectDir, 'drafts', 'chapters'), { recursive: true });
mkdirSync(join(this.options.projectDir, 'review'), { recursive: true });
```

**待验证**：pi 的 `write` 工具是否自动创建父目录。若是则此项为冗余保险，若不是则为必需。
`src/commands/init.ts:44-60` 已声明这两个目录，但**依赖它不构成保证**（目录可能被删、旧项目可能缺失）。

### 3.3 Turn 硬预算

**配置项**：`PiExecutorOptions.maxTurnsPerTask?: number`
**默认值**：待定，见 §7 Q2

**实现**：复用已有的 `session.subscribe()` 回调（当前仅用于日志）

```typescript
let budgetExhausted = false;

const unsubscribe = session.subscribe((event: any) => {
  switch (event.type) {
    case 'turn_start':
      turnCount++;
      if (maxTurns && turnCount > maxTurns) {
        budgetExhausted = true;
        void session.abort();          // 回调是同步的，fire-and-forget
        this.writeLog(logPath, `[budget] turn ${turnCount} > ${maxTurns}, aborting\n`);
      }
      break;
    // ... 现有日志分支
  }
});
```

**中止后的判定**（关键，防漏判）：

```typescript
if (budgetExhausted) {
  session.dispose();
  return {
    success: false,
    output: `Turn budget exhausted (${turnCount} > ${maxTurns})`,
    durationMs: Date.now() - start,
  };
}
```

必须在 `stopReason` 检查**之前**判定。否则 `abort()` 可能产生 `stopReason: 'stop'`，被误判为成功——那样预算就形同虚设。

---

## 4. 风险与对策

| ID | 风险 | 对策 |
|----|------|------|
| R1 | writer 失去 bash 后合理需求受阻（探路径、查文件存在） | 用 `read` 替代；路径信息已在 §0 之前的工作中注入素材包 |
| R2 | `abort()` 留下半成品文件 | 外层重试时覆盖同版本文件；必要时 executor 清理 |
| R3 | reviewer 保留 bash 仍可能螺旋 | 由 §3.3 预算兜底 |
| R4 | **构建污染正在运行的 t3 测试** | **在 t3 任务结束前禁止 `npm run build`**；`dist/` 未被 git 跟踪，切分支本身安全 |
| R5 | 预算值过小导致正常长章节被误杀 | 默认值取宽松；先采基线再收紧；超限日志留痕 |
| R6 | `void session.abort()` 的时序不确定性 | 用 `budgetExhausted` 标志而非依赖 stopReason；加集成测试覆盖 |

---

## 5. 测试策略

### 5.1 TDD 单元测试

新增 `tests/scheduler/pi-executor-tools.test.ts`：

| # | 用例 |
|---|------|
| 1 | `writer` 的工具集**不含** `bash` |
| 2 | `writer` 的工具集**不含** `powershell` |
| 3 | `fixer` 的工具集**不含** `bash` |
| 4 | `reviewer` 的工具集**含** shell（按平台解析） |
| 5 | `options.tools` 显式覆盖时优先生效 |
| 6 | 未知 `task.type` 回退到 `DEFAULT_TOOLS` |
| 7 | 预算超限 → `success: false`，输出含 `budget exhausted` |
| 8 | 预算内正常完成 → `success: true` |

扩展 `tests/scheduler/pi-executor-platform.test.ts`（已有的平台判断用例）。

### 5.2 基准测试方法论（修正）

**必须修正**——本次计划暴露了原有比较方法的问题：

| 要求 | 原因 |
|------|------|
| **干净初始状态**：先删除 `drafts/chapters/*` | 否则模型只做校验，不写作（见 §0） |
| **同章多轮**：每章 ≥3 次 | 单样本受采样随机性影响 |
| **成对比较**：同章、同素材、仅改被测变量 | 消除章节难度混淆 |
| **固定记录项** | turns / 各工具调用数 / duration / 产出字数 |

**交付**：`scripts/bench.sh` — 重置草稿 → 跑 N 章 → 汇总统计

### 5.3 对抗性用例（G4）

构造一份 prompt，明确诱导 writer「反复校验字数直到达标」，验证：
- bash 调用仍为 0（工具缺失）
- turn 数不突破预算

---

## 6. 实施步骤

| 阶段 | 内容 | 验收 | 需构建 |
|------|------|------|--------|
| P0 | 等 t3 任务结束（或用户中止） | — | 否 |
| P1 | 写 §5.1 测试（Red） | 测试失败且失败原因正确 | 否 |
| P2 | 实现 §3.1 角色工具表 | 用例 1-6 通过 | 是 |
| P3 | 实现 §3.2 目录预创建 + 验证 write 自动建目录 | 干净项目可写入 | 是 |
| P4 | 实现 §3.3 turn 预算 | 用例 7-8 通过 | 是 |
| P5 | 全量回归 | 现有 602 测试不回归 | 是 |
| P6 | 真机验证（干净 t3 项目，ch003 起） | G1 成立；采基线 | 是 |
| P7 | 对抗性验证 | G4 成立 | 是 |
| P8 | 汇总报告 + 与 `feat/responsibility-separation` 的合并策略 | 报告供审阅 | 否 |

---

## 7. 待决策

| ID | 问题 | 我的建议 |
|----|------|----------|
| Q1 | 分支基点：`master` 还是 `feat/responsibility-separation`？ | **`master`**（已按此建）。理由：保持被测变量单一，可单独度量工具限制的效果。两侧最终合并后再做联合验证 |
| Q2 | `maxTurnsPerTask` 默认值？ | 先设 **40**（宽松），P6 采基线后收紧到 P95×1.5 |
| Q3 | `reviewer` 是否保留 `bash`？ | **保留**。度量是其职责；且其流程（读1份→写1份）螺旋风险低，另有预算兜底 |
| Q4 | 预算耗尽后行为？ | **判失败 → 走外层重试**（现有机制，无需新增）。重试仍超限则最终报 `failed` |
| Q5 | 是否把预算做成用户可配（`SchedulerConfig`）？ | **建议是**，与现有 `rateLimitDelayMs` 等配置一致 |

---

## 8. 不在本分支范围

- prompt 措辞调整（属 `feat/responsibility-separation`）
- 素材包路径注入（已在 `master`）
- 跨平台 shell 选择（已在 `master`）
- 审阅阶段的图表对抗性检查
