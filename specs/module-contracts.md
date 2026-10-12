# Spec: 模块间契约 (Module Contracts)

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **源码**: `src/state/`, `src/dispatcher/`, `src/writing/`, `src/organize/`  
> **状态**: 有效（基于 v0.22.0 代码审计）

---

## 1. 目的

ConfWrite 80% 的 bug 出在**模块间交互**——不是单个模块内部逻辑错误，而是模块之间对"谁负责什么"的理解不一致。

本 spec 定义模块间的**数据契约**和**行为边界**，确保模块组合时不会静默出错。

---

## 2. 通用契约

以下规则适用于**所有模块**，无需在每个模块 spec 中重复。

### 2.1 状态访问

| ID | 规则 | 违反后果 |
|----|------|---------|
| MC-1 | **模块不得直接修改 `state.currentPhase`** | 绕过状态机，状态不一致 (Bug #33) |
| MC-2 | **模块修改 state 后必须通过 `store.save()` 持久化** | 中断时状态丢失 |
| MC-3 | **模块不得假设 state 是最新的** — 需要时必须从磁盘重新加载 | 内存 state 与磁盘 state 不一致 |
| MC-4 | **路径拼接必须使用 `path.join()`** — 禁止模板字符串拼接路径 | 跨平台路径分隔符错误 (Bug #36) |

### 2.2 文件 I/O

| ID | 规则 | 违反后果 |
|----|------|---------|
| MC-5 | **读取文件前必须检查存在性** — 不存在时返回明确错误，不静默跳过 | 空数据流入后续流程 |
| MC-6 | **写入文件必须写入预期路径** — 不得使用相对路径（子代理 cwd 不可控） | 文件写入错误目录 (Bug #50) |
| MC-7 | **产物文件必须非空** — `hasFile` 检查 `size > 0` | 空文件让出口条件成立 |

### 2.3 错误处理

| ID | 规则 | 违反后果 |
|----|------|---------|
| MC-8 | **失败不得静默** — 必须返回错误信息或抛出异常 | 坏数据流入后续流程 (Bug #35) |
| MC-9 | **降级必须有日志** — 走降级路径时必须记录原因 | 排查时无法定位降级原因 |
| MC-10 | **`success: true` 必须名副其实** — 不能包含"部分成功" | 谎报完成，坏结果被接受 (Bug #35) |

---

## 3. Phase 实现层契约

### 3.1 Phase1 (需求分析)

**输入**：
- `inputs/` 目录下的 `.md`、`.txt`、`.docx`、`.pdf` 文件

**输出**：
- `assets/requirements.json` — 需求列表（数组，非空）
- `assets/requirement-report.md` — 需求分析报告

**契约**：
| ID | 规则 |
|----|------|
| P1-1 | `execute()` 只修改 `state.lastUpdated`，不修改 `currentPhase` |
| P1-2 | `validate()` 检查 `assets/requirements.json` 存在且内容非空数组 |
| P1-3 | 输入文档为空时，抛出明确错误（不生成空文件） |

### 3.2 Phase2 (大纲规划)

**输入**：
- `assets/requirements.json` — Phase 1 产出

**输出**：
- `outline.md` — 文档大纲（含 ch 标记）

**契约**：
| ID | 规则 |
|----|------|
| P2-1 | `execute()` 只修改 `state.lastUpdated`，不修改 `currentPhase` |
| P2-2 | 大纲已存在时跳过生成，不覆盖 |
| P2-3 | 调用 `outlineCommand` 后必须从磁盘重新加载 chapters 同步到 `ctx.state` |

### 3.3 Phase3 (素材准备)

**输入**：
- `outline.md` — Phase 2 产出
- `assets/requirements.json` — Phase 1 产出
- `reference_material/` — 用户提供的参考资料

**输出**：
- `assets/chapter-kits/*.md` — 章节素材包
- `assets/data-baseline.json` — 数据基线
- `assets/references-index.md` — 参考索引
- `assets/requirement-map.json` — 需求映射

**契约**：
| ID | 规则 |
|----|------|
| P3-1 | `execute()` 必须调用 `organizeMaterials()` 重建素材包 |
| P3-2 | 重建后必须从磁盘重新加载 chapters 同步到 `ctx.state` (SM-9) |
| P3-3 | 素材包必须与大纲逐章对应（id + 标题匹配） |

### 3.4 Phase4a-4d (写作/审阅/决策/修复)

详见 `specs/writing-loop.md`（待创建）。

### 3.5 Phase5 (图表生成)

**输入**：
- 各章节草稿中的图表描述（结构化格式或 mermaid）

**输出**：
- `figures/*.svg` / `figures/*.png` — 图表文件
- `figures/manifest.json` — 图表清单

**契约**：
| ID | 规则 |
|----|------|
| P5-1 | `execute()` 在内部直接完成工作（不依赖 dispatcher） |
| P5-2 | 管线结果必须写入 `logs/diagram-pipeline.json`（持久诊断） |
| P5-3 | 未渲染的图不计入 `generated`（如实汇报） |
| P5-4 | 缺 mmdc 时不写 manifest 记录，不清谎报 `success: true` |

### 3.6 Phase6 (组装)

**输入**：
- `drafts/chapters/*.md` — 各章节最新版本
- `figures/*.png` — 图表文件

**输出**：
- `assembly/merged-v1.md` — 合并后的完整文档

**契约**：
| ID | 规则 |
|----|------|
| P6-1 | `onEnter` 清理 `assembly/merged-v1.md` 残留 |
| P6-2 | 组装必须包含文档标题（从 outline.md 提取） |
| P6-3 | waitPoint timing = `after-execute`（先组装再暂停） |
| P6-4 | 图表注入使用 `extractDiagrams`（统一块定位） |

### 3.7 Phase7 (定稿)

**输入**：
- `assembly/merged-v1.md`

**输出**：
- `output/finalization.json` — 定稿报告
- `output/final.md` — 最终 Markdown

**契约**：
| ID | 规则 |
|----|------|
| P7-1 | `onEnter` 清理 `output/finalization.json` 残留 |
| P7-2 | 章节计数排除 TOC 标题（`## 目录` 不计入） |

### 3.8 Phase8 (导出)

**输入**：
- `output/final.md` 或 `assembly/merged-v1.md`

**输出**：
- `output/final.docx` — Word 文档

**契约**：
| ID | 规则 |
|----|------|
| P8-1 | `onEnter` 清理 `output/final.docx` 残留 |
| P8-2 | `validate()` 检查 pandoc 是否安装，缺失时给出安装指引 |
| P8-3 | `execute()` 在内部直接调用 `exportDocument()` |
| P8-4 | 导出时 `cwd` 必须设为 `projectDir`（否则图片路径解析失败） |

---

## 4. 数据传递契约

### 4.1 wordBudget 传递链

```
outline.md
  → OutlineParser.parse()
    → OutlineNode.wordBudget: { min, max }
      → chapter-syncer.sync()
        → ChapterState.wordBudget: { min, max }
          → dispatcher.readChapterKit()
            → TaskExecutor.generateWriterPrompt(wordBudget)
              → prompt 中包含字数限制
                → OutputValidator.validate(charCount, wordBudget)
```

| ID | 规则 |
|----|------|
| WB-1 | OutlineParser 必须解析 `字数预算: X-Y字` 格式 |
| WB-2 | chapter-syncer 必须保留 wordBudget 字段（不丢弃） |
| WB-3 | Writer/Fixer prompt 必须包含 wordBudget |
| WB-4 | OutputValidator 必须独立验证字数（不盲信 LLM verdict） |
| WB-5 | wordBudget 配置统一（minChapterChars ≤ wordBudget.min < wordBudget.max） |

### 4.2 章节状态流转

```
pending → writing → written → reviewing → reviewed
                                          │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                           accept       revise       reject
                              │            │            │
                              ▼            ▼            ▼
                          completed    4d(fix)     pending(重写)
                                         │
                                         ▼
                                      4b(复审)
```

| ID | 规则 |
|----|------|
| CS-1 | 只有 dispatcher 的 task 回调可以修改 chapter.status |
| CS-2 | `round` 在 fixer 完成后递增（不是 reviewer 判 revise 时） |
| CS-3 | `maxRounds` 守护必须检查递增后的 round（否则死循环） |
| CS-4 | turn 预算耗尽时，先检查产物是否存在再判失败 |
| CS-5 | 验证失败的章节不得被 `completed_with_issues` 绕过 |

---

## 5. 文件路径契约

所有模块使用**相对于 projectDir 的路径**：

| 路径 | 用途 | 生产者 | 消费者 |
|------|------|--------|--------|
| `inputs/` | 输入文档 | 用户 | Phase1 |
| `assets/requirements.json` | 需求列表 | Phase1 | Phase2, Phase3 |
| `assets/chapter-kits/*.md` | 章节素材包 | Phase3 | Phase4a (Writer) |
| `assets/data-baseline.json` | 数据基线 | Phase3 | Phase4a, Phase4b |
| `outline.md` | 文档大纲 | Phase2 | Phase3, Phase4a, Phase6 |
| `drafts/chapters/chXXX-vN.md` | 章节草稿 | Phase4a (Writer) | Phase4b (Reviewer), Phase6 |
| `review/chXXX-rN.json` | 审阅报告 | Phase4b (Reviewer) | Phase4c, Phase4d |
| `figures/manifest.json` | 图表清单 | Phase5 | Phase6 |
| `figures/*.png` | 图表文件 | Phase5 | Phase6 |
| `assembly/merged-v1.md` | 合并文档 | Phase6 | Phase7 |
| `output/finalization.json` | 定稿报告 | Phase7 | Phase8 |
| `output/final.md` | 最终 Markdown | Phase7 | Phase8 |
| `output/final.docx` | Word 文档 | Phase8 | 用户 |

---

## 6. 测试覆盖要求

| 场景 | 必须覆盖 |
|------|---------|
| MC-1 | 每个 Phase 的 execute() 调用后 currentPhase 不变 |
| MC-4 | 在 Windows 和 Linux 上验证路径分隔符 |
| MC-6 | 子代理写入时使用绝对路径 |
| WB-2 | chapter-syncer 保留 wordBudget 的单元测试 |
| WB-4 | OutputValidator 独立验证字数的单元测试 |
| CS-4 | turn 预算耗尽但产物存在时判成功的测试 |
| CS-5 | 验证失败时不被 `completed_with_issues` 绕过的测试 |

---

## 7. 变更历史

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-10-12 | 初始版本 | 基于 v0.22.0 代码审计，汇总所有模块间交互规范 |
