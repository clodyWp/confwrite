# ConfWrite E2E 测试计划

> 通过 herdr 驱动远程 pi agent 完成端到端测试的标准流程。

## 0. 测试变量

在执行测试前，需要确定以下变量：

| 变量 | 说明 | 默认值 | 示例值 |
|------|------|--------|--------|
| `<PROJECT_SLUG>` | 项目名称 | - | `LMERP2V2-v6` |
| `<PANE_ID>` | herdr pane ID | - | `wN:p1` |
| `<TEMPLATE>` | 大纲模板 | - | `technical-proposal` |
| `<TARGET_WORDS>` | 目标字数 | - | `50000` |
| `<MAX_CONCURRENCY>` | 最大并发数 | `2` | `2` |
| `<SOURCE_VERSION>` | 素材来源版本 | - | `LMERP2V2-v5` |

**替换规则**：文档中所有 `<PROJECT_SLUG>`、`<PANE_ID>` 等占位符，在实际执行时替换为具体值。

### 0.1 测试场景选择

| 场景 | 素材类型 | 测试重点 | 备注 |
|------|---------|---------|------|
| **场景 A：完整流程** | Word 文件 (.docx) | 格式转换 + 流程完整性 + 字数控制 | 推荐，测试 mammoth 转换 |
| **场景 B：降级流程** | 已解析的 Markdown | 流程完整性、字数控制 | 跳过格式转换，快速验证 |

**本次测试（v6）使用场景 B（降级）**，因为 reference_material 已经是 MD 格式。

**下次测试建议**：使用场景 A，拷贝 Word 文件测试完整流程。

---

## 1. 设计原则

### 1.1 工作目录模型

```
工作区 (workspace): /home/water/proj/c4
  └── projects/
      └── <PROJECT_SLUG>/    ← 项目目录（由 init 创建）
          ├── project-state.json
          ├── outline.md
          ├── reference_material/
          ├── assets/
          ├── drafts/
          └── ...
```

**关键**：pi 在工作区目录启动，所有命令都传递项目 slug 参数，**不需要 cd 到项目目录**。

### 1.2 命令格式

| 命令 | 格式 | 说明 |
|------|------|------|
| init | `/confwrite:init <slug>` | 创建项目 |
| organize | `/confwrite:organize <slug>` | 整理素材 |
| outline | `/confwrite:outline <slug> <template> [targetWords]` | 生成大纲 |
| write | `/confwrite:write <slug>` | 启动写作流程 |
| status | `/confwrite:status <slug>` | 查看进度 |
| resume | `/confwrite:resume <slug>` | 恢复中断的流程 |

### 1.3 herdr 使用方式

```bash
# 查看远程 pane 状态
herdr --machine water-ali pane get <pane_id>

# 向远程 pi 发送命令
herdr --machine water-ali pane run <pane_id> "<command>"

# 读取远程 pi 输出
herdr --machine water-ali pane read <pane_id> --source recent-unwrapped --lines 80
```

---

## 2. 测试准备

### 2.1 环境检查

- [ ] 远程机器 `water-ali` 可访问
- [ ] herdr 服务运行正常
- [ ] 远程 pi 已安装 confwrite 扩展（最新版本）
- [ ] 有可用的 workspace 和 pane

**检查命令**：
```bash
# 检查 herdr 版本
herdr --version

# 检查远程 pane 状态
herdr --machine water-ali pane get <PANE_ID>

# 检查 confwrite 版本
ssh water@8.160.160.85 'cat /home/water/proj/c4/node_modules/confwrite/package.json | grep version'
```

### 2.2 项目准备

- [ ] 确定测试项目名称（如 `<PROJECT_SLUG>`）
- [ ] 清理旧项目（如需要）：`rm -rf /home/water/proj/c4/projects/<slug>`

### 2.3 数据准备（关键步骤）

**⚠️ 重要**：init 创建的项目目录是空的，需要手动拷贝测试素材！

#### 步骤 1：拷贝需求文档（inputs/requirements.docx）

**⚠️ 重要**：优先使用 Word 文件测试完整流程（包含格式转换）！

```bash
# 从源项目拷贝 Word 格式的需求文档
ssh water@8.160.160.85 'cp /home/water/proj/c4/projects/<SOURCE_VERSION>/inputs/requirements.docx /home/water/proj/c4/projects/<PROJECT_SLUG>/inputs/'

# 验证拷贝结果
ssh water@8.160.160.85 'ls -lh /home/water/proj/c4/projects/<PROJECT_SLUG>/inputs/requirements.docx'
# 预期：文件存在，大小约 189KB
```

**降级方案**（如果没有 Word 文件）：
```bash
# 使用已解析的 Markdown 文件
ssh water@8.160.160.85 'cp /home/water/proj/c4/projects/<SOURCE_VERSION>/inputs/requirements.md /home/water/proj/c4/projects/<PROJECT_SLUG>/inputs/'
```

#### 步骤 2：拷贝参考资料（reference_material）

```bash
# 从源项目拷贝参考资料（通常是已解析的 MD 文件）
ssh water@8.160.160.85 'cp -r /home/water/proj/c4/projects/<SOURCE_VERSION>/reference_material/* /home/water/proj/c4/projects/<PROJECT_SLUG>/reference_material/'

# 验证拷贝结果
ssh water@8.160.160.85 'ls /home/water/proj/c4/projects/<PROJECT_SLUG>/reference_material/ | wc -l'
# 预期：> 0（如 21 个目录/文件）
```

**注意**：reference_material 通常已经是 MD 格式。如果要测试 Word → MD 转换，需要手动准备 Word 文件。

#### 步骤 3：（可选）使用 Word 文件测试格式转换

如果要测试 Word → Markdown 转换流程（场景 B）：

```bash
# 清空已解析的 MD 文件
ssh water@8.160.160.85 'rm -rf /home/water/proj/c4/projects/<PROJECT_SLUG>/reference_material/*'

# 拷贝原始 Word 文件（需要从其他地方获取）
# ssh water@8.160.160.85 'scp ... /home/water/proj/c4/projects/<PROJECT_SLUG>/reference_material/'

# 验证 Word 文件
ssh water@8.160.160.85 'ls /home/water/proj/c4/projects/<PROJECT_SLUG>/reference_material/*.docx | wc -l'
```

**验证清单**：
- [ ] inputs/requirements.docx 存在（优先）或 requirements.md（降级）
- [ ] reference_material/ 目录有内容
- [ ] 文件权限正确（water 用户可读写）

**本次测试记录**：
- 使用的素材类型：Word / Markdown
- 是否测试了格式转换：是 / 否

---

## 3. 测试步骤

### 3.1 阶段 1：项目初始化

**目标**：创建项目结构

**前置条件**：
- ✅ 已完成 2.2 和 2.3 的数据准备

**命令**：
```
/confwrite:init <PROJECT_SLUG>
```

**预期结果**：
- 创建 `projects/<PROJECT_SLUG>/` 目录
- 生成 `project-state.json`（phase: 0a, status: init）
- 创建标准子目录结构

**验证命令**：
```bash
# 检查项目目录
ssh water@8.160.160.85 'ls /home/water/proj/c4/projects/<PROJECT_SLUG>/'

# 检查状态文件
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "{phase: .currentPhase, status: .status}"'
# 预期：{"phase": "0a", "status": "init"}
```

**异常检测**：
- ❌ 报错 "项目已存在" → 需要先删除旧项目
- ❌ 目录结构不完整 → 检查 confwrite 版本

### 3.1.1 配置并发数

**⚠️ 重要**：必须在 organize 之前配置，否则默认并发数为 1！

初始化完成后，需要配置并发数：

```bash
# 创建或更新 confwrite.config.json
ssh water@8.160.160.85 'cat > /home/water/proj/c4/projects/<PROJECT_SLUG>/confwrite.config.json << EOF
{
  "scheduler": {
    "maxConcurrency": <MAX_CONCURRENCY>,
    "maxTurnsPerTask": 50,
    "taskTimeoutMs": 600000,
    "maxTaskRetries": 1,
    "maxIterations": 100
  },
  "rateLimit": {
    "baseDelayMs": 60000,
    "phase1Retries": 2,
    "phase1Multiplier": 2,
    "phase2Multiplier": 12
  }
}
EOF'
```

**验证配置**：
```bash
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/confwrite.config.json | jq .'
# 预期：显示 JSON 配置，maxConcurrency 应为设定值（如 2）
```

---

### 3.2 阶段 2：素材整理

**目标**：扫描、索引、生成素材包

**前置条件**：
- ✅ 已完成 3.1.1 并发数配置
- ✅ reference_material/ 目录有测试素材

**命令**：
```
/confwrite:organize <PROJECT_SLUG>
```

**预期结果**：
- 扫描 reference_material/ 目录
- 生成 `assets/indexes/index.json`
- 生成 `assets/data-baseline.json`
- 生成 `assets/references-index.md`
- 状态推进到 phase 0b

**⚠️ 注意**：organize **不会**生成 `assets/requirements.json`！
- requirements.json 由 Phase 1（需求分析）生成
- Phase 1 在 `/confwrite:write` 触发时自动执行

**验证命令**：
```bash
# 检查素材文件
ssh water@8.160.160.85 'ls /home/water/proj/c4/projects/<PROJECT_SLUG>/assets/'
# 预期：chapter-kits, data-baseline.json, diagram-style.json, excerpts, generated, indexes, references-index.md

# 检查状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "{phase: .currentPhase, status: .status}"'
# 预期：{"phase": "0b", "status": "organizing"}

# 检查扫描文件数（查看远程 pi 输出）
# 预期："扫描: XXX 个文件"（如 167 个文件）
```

**异常检测**：
- ❌ "扫描: 0 个文件" → 检查 reference_material/ 是否有内容（回到 2.3 数据准备）
- ❌ 状态未更新 → 检查 project-state.json 写入权限
- ❌ "转换: 0/XXX 成功" → 检查文件格式（MD 文件应直接通过，Word 文件需要 mammoth）

---

### 3.3 阶段 3：大纲生成

**目标**：基于模板和需求生成章节大纲

**⚠️ 流程说明**：
- outline 命令需要 `assets/requirements.json`
- 但 organize 不会生成这个文件
- **解决方案**：直接执行 `/confwrite:write`，它会自动触发 Phase 1（需求提取）→ Phase 2（大纲生成）

**命令**（跳过手动 outline，直接 write）：
```
/confwrite:write <PROJECT_SLUG>
```

**预期流程**：
```
Phase 0b → Phase 1 (需求分析，生成 requirements.json)
         → Phase 2 (大纲规划，生成 outline.md)
         → Phase 2 waitPoint (暂停等待确认)
```

**验证命令**：
```bash
# 检查 requirements.json 是否生成
ssh water@8.160.160.85 'ls -lh /home/water/proj/c4/projects/<PROJECT_SLUG>/assets/requirements.json'
# 预期：文件存在

# 检查 outline.md 是否生成
ssh water@8.160.160.85 'head -50 /home/water/proj/c4/projects/<PROJECT_SLUG>/outline.md'

# 检查章节数量
ssh water@8.160.160.85 'grep -c "^ch[0-9]" /home/water/proj/c4/projects/<PROJECT_SLUG>/outline.md'
# 预期：10+ 章

# 检查状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "{phase: .currentPhase, status: .status}"'
# 预期：{"phase": "2", "status": "outlining"}（waitPoint 暂停）
```

**异常检测**：
- ❌ "未找到需求文件" → Phase 1 未执行，检查 inputs/requirements.md 是否存在
- ❌ "未找到输入文档" → inputs/ 目录为空，回到 2.3 数据准备
- ❌ 大纲章节数 < 5 → 需求提取失败，检查 requirements.md 格式

**（可选）手动 outline**：
如果 Phase 1 已完成但需要重新生成大纲：
```
/confwrite:outline <PROJECT_SLUG> technical-proposal 50000
```

---

### 3.4 阶段 4：写作流程（核心）

**目标**：执行完整的写作、审阅、修复循环

**命令**：
```
/confwrite:write <PROJECT_SLUG>
```

**预期流程**：
```
Phase 3 (素材准备) → Phase 4a (写作) → Phase 4b (审阅) → Phase 4c (决策)
  → [Phase 4d (修复) → Phase 4b (审阅)]* → Phase 5 (图表) → Phase 6 (组装)
  → Phase 7 (定稿) → Phase 8 (导出) → done
```

**监控方式**：
```bash
# 定期检查状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "{phase: .currentPhase, status: .status, chapters: (.chapters | length)}"'

# 检查草稿
ssh water@8.160.160.85 'ls -lh /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/'

# 检查日志
ssh water@8.160.160.85 'tail -20 /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json'
```

**字数验证**（关键！）：
```bash
# 检查各章字数
ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/*.md; do echo "$(basename $f): $(wc -c < $f) chars"; done'

# 计算平均字数和超标情况
ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/*.md; do wc -c < $f; done | awk "{sum+=\$1; count++} END {print \"Average: \" sum/count \" chars\"; print \"Target: 6500 chars\"; print \"Overrun: \" (sum/count)/6500 \"x\"}"'
```

**异常检测**：
- ❌ 字数超标 > 1.5x → Bug 36 修复未生效
- ❌ 验证失败但流程继续 → Bug 36.1 修复未生效
- ❌ "达到最大推进次数" → 状态机空转
- ❌ pi 自行分析代码 → 需要纠正（见 4.2 节）

---

### 3.5 阶段 5：结果验证

**目标**：确认最终产物

**验证清单**：

| 产物 | 路径 | 预期 |
|------|------|------|
| 草稿 | `drafts/chapters/ch*.md` | 10+ 文件 |
| 审阅记录 | `review/` | 每章有审阅文件 |
| 合并稿 | `assembly/merged-v1.md` | 完整文档 |
| 最终稿 | `output/final.md` | 同合并稿 |
| Word 文档 | `output/final.docx` | 可打开、有目录 |

**验证命令**：
```bash
# 检查最终产物
ssh water@8.160.160.85 'ls -lh /home/water/proj/c4/projects/<PROJECT_SLUG>/output/'

# 检查字数统计
ssh water@8.160.160.85 'wc -c /home/water/proj/c4/projects/<PROJECT_SLUG>/output/final.md'
```

---

---

## 4. Subagent 监控（可选）

> **说明**：subagent 是 confwrite 内部调度的，主要通过日志文件监控。本测试计划的核心是**主 pi agent 的异常处理**，subagent 监控作为可选补充。

### 4.1 基本监控命令

```bash
# 查看任务统计
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json | jq "{total: length, last_event: .[-1].event.type}"'

# 查看章节进度
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "[.chapters | to_entries[] | {id: .key, status: .value.status}]"'

# 查看草稿文件
ssh water@8.160.160.85 'ls -lh /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/'
```

### 4.2 异常检测

| 异常 | 检测方法 | 处理 |
|------|----------|------|
| 任务长时间无进展 | 日志最后事件时间 > 10 分钟前 | 检查主 pi 状态，可能需要打断 |
| 任务失败 | `task.fail` 事件 | 查看错误信息，决定是否重试 |
| 字数超标 | 检查草稿文件大小 | 测试后统一分析 |

> **注意**：如果 subagent 执行异常，通常是因为主 pi 的问题。优先处理主 pi 的异常。

---

## 5. 异常处理

### 5.1 异常分类与处理原则

| 严重级别 | 类型 | 处理原则 |
|----------|------|----------|
| **P0 - 阻塞** | 命令执行失败、状态不一致 | 立即停止，诊断后恢复 |
| **P1 - 严重** | pi 自行分析代码、流程卡住 | 尝试纠正，3 次失败后停止 |
| **P2 - 警告** | 字数超标、验证失败 | 记录并继续，测试后分析 |
| **P3 - 信息** | 非关键警告 | 记录，不影响流程 |

### 4.2 P0：命令执行失败

**症状**：
- 报错 "未找到项目状态文件"
- 报错 "请先运行 /confwrite:init"
- 报错 "项目已存在"

**诊断步骤**：
```bash
# 1. 检查项目是否存在
ssh water@8.160.160.85 'ls -la /home/water/proj/c4/projects/<PROJECT_SLUG>/'

# 2. 检查状态文件
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json 2>/dev/null | jq . || echo "状态文件不存在"'

# 3. 检查 pi 的 cwd
herdr --machine water-ali pane get <PANE_ID> | jq '.result.pane.cwd'
```

**处理方案**：

| 错误 | 原因 | 处理 |
|------|------|------|
| "未找到项目状态文件" | 未传 slug 或项目未初始化 | 重新执行 `/confwrite:init <PROJECT_SLUG>` |
| "项目已存在" | 旧项目未清理 | `rm -rf /home/water/proj/c4/projects/<PROJECT_SLUG>` 后重试 |
| "请先运行 /confwrite:init" | 状态文件丢失 | 重新初始化或从备份恢复 |

### 4.3 P1：远程 pi 自行分析代码

**症状**：
- pi 不执行命令，而是分析代码逻辑
- 输出包含 "让我分析一下..."、"我看看代码..."
- 引用 `src/*.ts` 路径
- agent_status 持续为 working 但未产生有用输出

**检测模式**（按优先级）：
1. `(?i)让我(来|先)?分析` - pi 开始分析
2. `(?i)我(来|先)?看看(代码|源码)` - pi 查看代码
3. `(?i)src/.*\.ts` - 引用源码路径
4. `(?i)根据代码(分析|来看)` - 基于代码分析

**打断→恢复流程**：

```
检测到异常（pi 在分析代码而非执行命令）
  │
  ▼
Step 1: 发送 Escape 打断
  herdr --machine water-ali pane send-keys <PANE_ID> esc
  │
  ▼
Step 2: 等待 pi 回到 idle（轮询，最多 15 秒）
  herdr --machine water-ali pane get <PANE_ID>
  检查 agent_status == "idle"
  │
  ├─ idle → 继续 Step 3
  └─ 仍 working → 再发一次 esc，最多重试 3 次
  │
  ▼
Step 3: 发送纠正指令
  herdr --machine water-ali pane run <PANE_ID> "请执行命令，不要分析代码。运行: /confwrite:status <PROJECT_SLUG>"
  │
  ▼
Step 4: 等待 pi 执行完成
  轮询 agent_status，等待 idle
  读取输出确认执行了命令
  │
  ├─ 执行成功 → 继续发送正确的下一步命令
  └─ 又开始分析 → 回到 Step 1（最多 3 轮）
  │
  ▼
3 轮仍未恢复？
  │
  ▼
Step 5: 强制重启 pi
  1. herdr --machine water-ali pane send-keys <PANE_ID> esc
  2. 等待 idle
  3. herdr --machine water-ali pane run <PANE_ID> "exit"
  4. 等待 pane 回到 shell
  5. herdr --machine water-ali pane run <PANE_ID> "pi"
  6. 等待 pi 启动（agent_status = idle）
  7. herdr --machine water-ali pane run <PANE_ID> "/confwrite:status <PROJECT_SLUG>"
  │
  ▼
仍然失败？→ 停止测试，人工介入
```

**具体命令**：

```powershell
# Step 1: 打断
herdr --machine water-ali pane send-keys <PANE_ID> esc

# Step 2: 等待 idle
$maxWait = 15
$elapsed = 0
while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 3
    $elapsed += 3
    $status = (herdr --machine water-ali pane get <PANE_ID> | ConvertFrom-Json).result.pane.agent_status
    if ($status -eq "idle") { break }
}

# Step 3: 发送纠正指令
herdr --machine water-ali pane run <PANE_ID> "请执行命令，不要分析代码。运行: /confwrite:status <PROJECT_SLUG>"

# Step 5 (如果需要): 重启 pi
herdr --machine water-ali pane send-keys <PANE_ID> esc
# 等待 idle...
herdr --machine water-ali pane run <PANE_ID> "exit"
# 等待 shell...
herdr --machine water-ali pane run <PANE_ID> "pi"
# 等待 pi idle...
herdr --machine water-ali pane run <PANE_ID> "/confwrite:status <PROJECT_SLUG>"
```

### 4.4 P1：流程卡住

**症状**：
- 单任务执行超过 15 分钟（日志无新事件）
- agent_status 为 idle 但流程未完成
- 同一章节反复失败 > 3 次

**注意**：Phase 4 的正常耗时较长，不能用"10 分钟无进展"判断卡住！

| Phase | 单任务耗时 | 总耗时（10章） |
|-------|-----------|---------------|
| 4a 写作 | 3-5 分钟/章 | 30-50 分钟 |
| 4b 审阅 | 2-3 分钟/章 | 20-30 分钟 |
| 4c 决策 | 1-2 分钟 | 1-2 分钟 |
| 4d 修复 | 3-5 分钟/章 | 30-50 分钟 |

**诊断步骤**：
```bash
# 1. 检查日志最后事件时间
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json | jq ".[-1].timestamp"'

# 2. 检查当前任务状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json | jq ".[-3:]"'

# 3. 检查章节失败次数
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "[.chapters | to_entries[] | select(.value.consecutiveFailures > 0) | {id: .key, failures: .value.consecutiveFailures}]"'
```

**处理方案**：

| 情况 | 处理 |
|------|------|
| 单任务 > 15 分钟 | 打断主 pi，检查 subagent 状态，必要时 resume |
| 主 pi idle 但流程未完成 | 发送 `/confwrite:resume <PROJECT_SLUG>` |
| 同一章节失败 > 3 次 | 手动修改章节状态为 completed，或停止测试分析原因 |

**诊断步骤**：
```bash
# 1. 检查当前 phase
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq "{phase: .currentPhase, status: .status}"'

# 2. 检查最后一条日志
ssh water@8.160.160.85 'tail -5 /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json'

# 3. 检查是否有失败的任务
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json | jq "[.[] | select(.event.type == \"task.failed\")] | length"'
```

**处理方案**：

| 卡住位置 | 可能原因 | 处理 |
|----------|----------|------|
| Phase 2 (大纲) | waitPoint 等待确认 | 发送 `/confwrite:write <PROJECT_SLUG>` 继续 |
| Phase 4a (写作) | subagent 执行失败 | 检查日志，必要时 `/confwrite:resume <PROJECT_SLUG>` |
| Phase 4b (审阅) | 审阅不收敛 | 检查审阅轮次，必要时手动接受 |
| Phase 6 (组装) | pandoc 失败 | 检查依赖，手动执行组装 |

**恢复命令**：
```
/confwrite:resume <PROJECT_SLUG>
```

### 4.5 P2：字数超标

**症状**：
- 章节字数超过预算的 1.5 倍
- 平均字数超过 target 的 1.5 倍

**诊断步骤**：
```bash
# 检查各章字数
ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/*.md; do echo "$(basename $f): $(wc -c < $f) chars"; done'

# 计算超标倍数
ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/*.md; do wc -c < $f; done | awk "{sum+=\$1; count++} END {print \"Average: \" sum/count \" chars\"; print \"Target: 6500 chars\"; print \"Overrun: \" (sum/count)/6500 \"x\"}"'
```

**处理方案**：

| 超标倍数 | 严重程度 | 处理 |
|----------|----------|------|
| < 1.2x | 可接受 | 记录，继续测试 |
| 1.2x - 1.5x | 警告 | 记录，测试后分析原因 |
| > 1.5x | 严重 | 记录，检查 Bug 36 修复是否生效 |
| > 2.0x | 失败 | 停止测试，诊断 Bug 36/36.1 |

**判断标准**：
- v0.21.1 应该将字数控制在 target ± tolerance 范围内
- target: 6500, tolerance: 0.2 → 范围 5200-7800
- 超标 > 1.5x 说明修复未生效

### 4.6 P2：验证失败但流程继续

**症状**：
- OutputValidator 报告验证失败
- 但流程继续推进，未触发修复

**诊断步骤**：
```bash
# 检查日志中的验证失败
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json | jq "[.[] | select(.event.type == \"validation.failed\")]"'

# 检查章节状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq ".chapters | to_entries[] | {key: .key, status: .value.status, failureType: .value.failureType}"'
```

**处理方案**：
- 检查 Bug 36.1 修复是否生效（dispatcher 应传递 failureType）
- 检查 OutputValidator 是否正确调用
- 必要时手动触发修复：修改章节状态为 failed，然后 resume

### 4.7 P3：非关键警告

**症状**：
- "字数预算超出目标 30%"
- "素材包生成跳过"

**处理**：
- 记录但不影响流程
- 测试后统一分析

### 4.8 异常恢复决策树

```
异常发生
  ↓
判断严重级别
  ↓
P0（阻塞）？
  ├─ 是 → 立即停止，诊断，恢复
  └─ 否 → 继续
  ↓
P1（严重）？
  ├─ 是 → 尝试纠正（最多 3 次）
  │       ├─ 成功 → 继续
  │       └─ 失败 → 停止测试，人工介入
  └─ 否 → 继续
  ↓
P2（警告）？
  ├─ 是 → 记录，继续
  └─ 否 → 继续
  ↓
测试完成
  ↓
汇总所有异常，分析根因
```

### 4.9 异常记录模板

```
异常时间: 2026-10-10 13:45:23
异常阶段: Phase 4a (写作)
严重级别: P1
异常描述: 远程 pi 开始分析代码而非执行命令
检测模式: "让我分析一下这个逻辑..."
处理方式: 发送纠正指令 "请执行命令，不要分析代码"
处理结果: ✅ 恢复 / ❌ 未恢复
后续操作: 继续测试 / 停止测试
备注: 第 2 次发生，可能需要优化 prompt
```

---

## 5. 测试记录模板

### 5.1 基本信息

```
测试日期: YYYY-MM-DD
测试人员: 
项目: <PROJECT_SLUG>
ConfWrite 版本: v0.21.x
远程机器: water-ali
Pane ID: 
```

### 5.2 阶段记录

| 阶段 | 开始时间 | 结束时间 | 结果 | 备注 |
|------|----------|----------|------|------|
| init | | | ✅/❌ | |
| organize | | | ✅/❌ | 扫描文件数: |
| outline | | | ✅/❌ | 章节数: |
| write | | | ✅/❌ | 字数控制: |
| 验证 | | | ✅/❌ | 最终产物: |

### 5.3 字数统计

| 章节 | 字数 | 预算 | 超标倍数 | 备注 |
|------|------|------|----------|------|
| ch001 | | 5200-7800 | | |
| ch002 | | 5200-7800 | | |
| ... | | | | |
| **平均** | | | | |

### 5.4 异常记录

| 时间 | 阶段 | 异常描述 | 处理方式 | 结果 |
|------|------|----------|----------|------|
| | | | | |

---

## 6. 快速参考

### 6.1 常用命令

```bash
# 初始化项目
/confwrite:init <PROJECT_SLUG>

# 整理素材
/confwrite:organize <PROJECT_SLUG>

# 生成大纲
/confwrite:outline <PROJECT_SLUG> technical-proposal 50000

# 启动写作
/confwrite:write <PROJECT_SLUG>

# 查看状态
/confwrite:status <PROJECT_SLUG>

# 恢复流程
/confwrite:resume <PROJECT_SLUG>
```

### 6.2 远程检查命令

```bash
# 检查项目状态
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/<PROJECT_SLUG>/project-state.json | jq .'

# 检查草稿字数
ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/<PROJECT_SLUG>/drafts/chapters/*.md; do echo "$(basename $f): $(wc -c < $f)"; done'

# 检查日志
ssh water@8.160.160.85 'tail -30 /home/water/proj/c4/projects/<PROJECT_SLUG>/logs/confwrite-log.json'

# 清理项目
ssh water@8.160.160.85 'rm -rf /home/water/proj/c4/projects/<PROJECT_SLUG>'
```

### 6.3 herdr 命令

```bash
# 查看 pane 状态
herdr --machine water-ali pane get <PANE_ID>

# 发送命令
herdr --machine water-ali pane run <PANE_ID> "/confwrite:write <PROJECT_SLUG>"

# 读取输出
herdr --machine water-ali pane read <PANE_ID> --source recent-unwrapped --lines 80

# 列出工作区
herdr --machine water-ali workspace list
```

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.2 | 2026-01-09 | 数据准备步骤优化：优先使用 Word 文件测试完整流程，MD 文件作为降级方案 |
| v1.1 | 2026-01-09 | 添加数据准备步骤、测试场景说明、并发数配置时机 |
| v1.0 | 2026-10-10 | 初始版本，基于 Bug 38/39 讨论 |
