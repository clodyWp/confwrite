# 素材包改进实施方案

## 1. 实施目标

通过改进素材包生成流程，让 Writer 知道"写什么"（需求内容），解决字数超标 3.13 倍的根本问题。

## 2. 验证项目

两个验证项目都从**项目初始化**开始，使用原始 Word 文档，重新建立项目目录。

| 项目 | 目录 | 需求文档 | 参考资料 | 验证范围 |
|------|------|----------|----------|----------|
| **LMERP2V2-v2** | `projects/LMERP2V2-v2/` | `requirements.docx` (192KB) | 146 个文件，20 个分类目录 | **全流程验证**：T1-T4 + 端到端写作 |
| **eastE-v2** | `projects/eastE-v2/` | `技术要求.docx` (77KB) | 支撑材料库（5 个分类） | **仅 T1 验证**：验证素材包改进的通用性 |

### 2.1 项目初始化

```bash
# LMERP2V2-v2
mkdir -p /home/water/proj/c4/projects/LMERP2V2-v2/inputs
cp /home/water/proj/c4/projects/LMERP2V2-new/inputs/requirements.docx \
   /home/water/proj/c4/projects/LMERP2V2-v2/inputs/
cp -r /home/water/proj/c4/projects/LMERP2V2-new/reference_material \
      /home/water/proj/c4/projects/LMERP2V2-v2/

# eastE-v2
mkdir -p /home/water/proj/c4/projects/eastE-v2/inputs
cp /home/water/proj/c4/projects/eastE/inputs/技术要求.docx \
   /home/water/proj/c4/projects/eastE-v2/inputs/
cp -r /home/water/proj/c4/projects/eastE/reference_material/支撑材料库 \
      /home/water/proj/c4/projects/eastE-v2/reference_material/
```

### 2.2 完整验证流程

每个项目都要走完整流程：

```
init → organize → outline → 快速验证 → write（可选）
```

## 3. 实施阶段

### Phase 1: T1 素材包改进（大纲作为信息枢纽）

**目标**：素材包包含需求内容

**实施步骤**：

#### Step 1.1: 类型扩展（1 小时）

修改 `src/outline/types.ts`：

```typescript
export interface OutlineChapter {
  id: string;
  title: string;
  type: string;
  wordBudget: { min: number; max: number };
  importance: number;
  description: string;
  // 新增：需求来源
  requirementSource?: {
    sections: string[];      // 需求文档中的章节编号
    headings: string[];      // 需求文档中的章节标题
  };
}
```

#### Step 1.2: 大纲规划器改进（1 小时）

修改 `src/outline/adaptive-planner.ts`：

- `plan()` 方法输出时保留 `sourceNodes` 信息
- 将 `sourceNodes` 转换为 `requirementSource`

#### Step 1.3: 大纲输出改进（1 小时）

修改 `src/commands/outline.ts`：

- 输出 outline.md 时包含需求来源
- 格式：`需求来源: §2.1.3.1.1, §2.1.3.1.2`

#### Step 1.4: 需求映射生成（2 小时）

新建 `src/organize/requirement-mapper.ts`：

- 读取需求文档（支持 Word 和 Markdown）
- 根据章节号提取对应内容
- 生成 `assets/requirement-map.json`

**关键设计**：
- 支持标准格式（requirements.md）
- 支持非标准格式（技术要求.docx 转换后的 markdown）

#### Step 1.5: 素材包生成改进（1 小时）

修改 `src/organize/kit-generator.ts`：

- 读取 `requirement-map.json`
- 注入需求内容到素材包
- 减少领域知识的权重

#### Step 1.6: organize 流程集成（1 小时）

修改 `src/commands/organize.ts`：

- 添加需求映射生成步骤
- 传递 `requirement-map.json` 给 KitGenerator

**Phase 1 总工作量**：7 小时

---

### Phase 2: T1 快速验证（1 小时）

**目标**：验证素材包包含需求内容，从项目初始化开始

#### Step 2.1: 本地构建和部署

```bash
# 本地构建
cd /path/to/confwrite
npm run build
npm test  # 确保测试通过

# 部署到远程
scp -r dist/ water@8.160.160.85:/home/water/proj/c4/confwrite/
```

#### Step 2.2: 初始化 LMERP2V2-v2

```bash
# 创建项目目录
mkdir -p /home/water/proj/c4/projects/LMERP2V2-v2/inputs
cp /home/water/proj/c4/projects/LMERP2V2-new/inputs/requirements.docx \
   /home/water/proj/c4/projects/LMERP2V2-v2/inputs/
cp -r /home/water/proj/c4/projects/LMERP2V2-new/reference_material \
      /home/water/proj/c4/projects/LMERP2V2-v2/

# 初始化项目
pi agent prompt w8:p1 "/confwrite:init LMERP2V2-v2"
```

#### Step 2.3: 运行 organize 和 outline

```bash
# 整理素材
pi agent prompt w8:p1 "/confwrite:organize LMERP2V2-v2"

# 生成大纲
pi agent prompt w8:p1 "/confwrite:outline LMERP2V2-v2"
```

#### Step 2.4: 快速验证（5 条命令）

```bash
cd /home/water/proj/c4/projects/LMERP2V2-v2

# ① 大纲是否包含需求来源？
grep -c "需求来源:" outline.md

# ② requirement-map.json 是否完整？
jq 'keys | length' assets/requirement-map.json

# ③ 素材包是否包含需求内容？
grep -l "需求要点" assets/chapter-kits/*.md | wc -l

# ④ 素材包大小是否减少？
ls -l assets/chapter-kits/*.md | awk '{sum+=$5; count++} END {printf "%.1f KB\n", sum/count/1024}'

# ⑤ 素材包是否差异化？
diff <(head -30 assets/chapter-kits/ch001.md) <(head -30 assets/chapter-kits/ch050.md) | head -20
```

#### Step 2.5: 判断标准

| 结果 | 判断 | 下一步 |
|------|------|--------|
| 5 条全部通过 | ✅ T1 有效 | 继续验证 eastE-v2 |
| ①②③ 通过，④⑤ 不通过 | ⚠️ 部分有效 | 检查素材包模板 |
| ①②③ 任一不通过 | ❌ T1 失败 | 排查大纲/映射生成逻辑 |

#### Step 2.6: 初始化并验证 eastE-v2（仅 T1 验证）

**目的**：验证素材包改进方案对不同项目结构的通用性

```bash
# 创建项目目录
mkdir -p /home/water/proj/c4/projects/eastE-v2/inputs
cp /home/water/proj/c4/projects/eastE/inputs/技术要求.docx \
   /home/water/proj/c4/projects/eastE-v2/inputs/
cp -r /home/water/proj/c4/projects/eastE/reference_material/支撑材料库 \
      /home/water/proj/c4/projects/eastE-v2/reference_material/

# 初始化项目
pi agent prompt w8:p1 "/confwrite:init eastE-v2"

# 整理素材
pi agent prompt w8:p1 "/confwrite:organize eastE-v2"

# 生成大纲
pi agent prompt w8:p1 "/confwrite:outline eastE-v2"

# 快速验证（同样 5 条命令）
cd /home/water/proj/c4/projects/eastE-v2
grep -c "需求来源:" outline.md
jq 'keys | length' assets/requirement-map.json
grep -l "需求要点" assets/chapter-kits/*.md | wc -l
```

**eastE-v2 验证到此结束**，不运行后续 T2-T4 和完整写作流程。

**Phase 2 总工作量**：1 小时

---

### Phase 3: T2 字数控制三层防御（仅 LMERP2V2-v2）

**前置条件**：T1 验证通过（两个项目都通过）

**目标**：字数超标 < 1.5x

**实施范围**：仅在 LMERP2V2-v2 上实施和验证

**实施步骤**：

#### Step 3.1: 预防层（1 小时）

修改 `src/writing/task-executor.ts`：

- 把 `wordBudget.max` 从"仅供参考"改为"硬性上限"
- 在 Writer prompt 中明确说明

#### Step 3.2: 检测层（1 小时）

修改 `src/writing/task-executor.ts`：

- 在 `parseWriterOutput` 中添加字数检查
- 超标时在 prompt 末尾追加警告

#### Step 3.3: 兜底层（1 小时）

修改 Reviewer prompt：

- 添加字数上限检查
- 超标 → verdict: `revise`

#### Step 3.4: 快速验证

```bash
# 重新构建和部署
npm run build && scp -r dist/ water@8.160.160.85:/home/water/proj/c4/confwrite/

# 重新生成素材包
pi agent prompt w8:p1 "/confwrite:organize LMERP2V2-v2"

# 检查 Writer prompt 是否包含字数限制
grep -A5 "字数预算" assets/chapter-kits/ch001.md
```

**Phase 3 总工作量**：3 小时

---

### Phase 4: T3 素材包 fallback 改进（仅 LMERP2V2-v2）

**前置条件**：T2 验证通过

**目标**：fallback 章节数 < 20%

**实施范围**：仅在 LMERP2V2-v2 上实施和验证

**实施步骤**：

#### Step 4.1: 定义通用参考资料（1 小时）

修改 `src/organize/chapter-mapper.ts`：

- 定义通用参考资料（总索引、项目概述、术语表）
- 根据章节类型分配不同的通用资料

#### Step 4.2: 标记 fallback 状态（0.5 小时）

修改 `src/organize/kit-generator.ts`：

- 在素材包中标注"本章使用通用参考资料，无精准匹配"

#### Step 4.3: 快速验证

```bash
# 重新生成素材包
pi agent prompt w8:p1 "/confwrite:organize LMERP2V2-v2"

# 统计 fallback 章节数
grep -l "使用通用参考资料" assets/chapter-kits/*.md | wc -l
# 应该 < 40 (20% of 200)
```

**Phase 4 总工作量**：1.5 小时

---

### Phase 5: T4 领域知识精准匹配（可选，仅 LMERP2V2-v2）

**前置条件**：T3 验证通过

**目标**：领域知识相关度 > 70%

**实施范围**：仅在 LMERP2V2-v2 上实施和验证

**实施步骤**：

#### Step 5.1: 修复 scopeBaseline 匹配逻辑（1 小时）

修改 `src/organize/kit-generator.ts`：

- 移除 `k.includes(lower.slice(0, 2))`
- 改用精确匹配

#### Step 5.2: 改进 BaselineExtractor（1 小时）

修改 `src/organize/baseline-extractor.ts`：

- 保留完整的 key，不截断

#### Step 5.3: 快速验证

```bash
# 重新生成素材包
pi agent prompt w8:p1 "/confwrite:organize LMERP2V2-v2"

# 抽样检查 10 章，评估领域知识与章节的相关性
```

**Phase 5 总工作量**：2 小时

---

## 6. 完整迭代（可选，仅 LMERP2V2-v2）

**前置条件**：T1-T4 全部验证通过

**目标**：端到端验证，字数超标 < 1.5x

**实施范围**：仅在 LMERP2V2-v2 上运行完整写作流程

### Step 6.1: 重新运行写作流程

```bash
# LMERP2V2-v2
pi agent prompt w8:p1 "/confwrite:write LMERP2V2-v2"
```

### Step 6.2: 监控进度

```bash
# 每 30 分钟检查一次
python3 -c "
import json
with open('/home/water/proj/c4/projects/LMERP2V2-v2/project-state.json') as f:
    s = json.load(f)
chapters = s.get('chapters', {})
from collections import Counter
statuses = Counter(c.get('status') for c in chapters.values())
print(f\"Phase: {s.get('currentPhase')}\")
for status, count in sorted(statuses.items()):
    print(f'  {status}: {count}')
"
```

### Step 6.3: 最终效果对比

```bash
# 字数超标倍数
wc -m drafts/chapters/*.md | tail -1

# 审阅通过率
python3 -c "
import json
with open('/home/water/proj/c4/projects/LMERP2V2-v2/project-state.json') as f:
    s = json.load(f)
chapters = s.get('chapters', {})
accept = sum(1 for c in chapters.values() if c.get('lastReviewVerdict') == 'accept')
print(f'审阅通过率: {accept}/{len(chapters)} = {accept/len(chapters)*100:.1f}%')
"
```

**完整迭代工作量**：12 小时（运行时间）+ 1 小时（监控）

---

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| T1 实现复杂度高 | 可能超出 7 小时 | 先实现最小可行版本 |
| eastE-v2 格式不标准 | 需求映射可能失败 | 添加 fallback 逻辑 |
| 字数控制效果不明显 | 仍需 3x+ | 检查素材包质量 |
| 完整迭代时间过长 | 12 小时 | 可以先跑 20 章验证 |

## 8. 时间估算

| Phase | 工作量 | 说明 |
|-------|--------|------|
| Phase 1 (T1) | 7 小时 | 素材包改进 |
| Phase 2 (验证) | 1 小时 | 两个项目从初始化开始验证 |
| Phase 3 (T2) | 3 小时 | 字数控制 |
| Phase 4 (T3) | 1.5 小时 | fallback 改进 |
| Phase 5 (T4) | 2 小时 | 领域知识精准匹配（可选） |
| 完整迭代 | 13 小时 | 端到端验证（可选） |
| **总计** | **27.5 小时** | 包含完整迭代 |

## 9. 下一步

1. 确认方案
2. 开始 Phase 1 实施
3. Phase 2 快速验证（两个项目从初始化开始）
4. 根据验证结果决定是否继续
