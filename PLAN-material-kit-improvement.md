# 素材包改进方案：大纲作为信息枢纽

## 1. 问题分析

### 1.1 当前数据流

```
需求文档 (inputs/requirements.md)
    ↓
AdaptiveOutlinePlanner → OutlineChapter[] (有 sourceNodes)
    ↓                    ↑ 信息丢失
outline.md               ↑ 只输出标题+描述
    ↓
organize → 无法知道章节对应需求的哪部分
    ↓
素材包 (基于 reference_material 匹配)
    ↓
Writer 拿到的是：
  - 章节标题
  - 一句话描述（"本节涵盖「XXX」相关内容"）
  - 114 KB 领域知识（大部分无关）
  - ❌ 没有具体需求
```

### 1.2 核心问题

1. **信息丢失**：大纲生成时知道章节来自哪些需求节点（sourceNodes），但输出到 outline.md 时丢失了
2. **素材包无法精准匹配**：organize 流程无法知道章节对应的需求内容，只能基于标题猜测
3. **Writer 不知道写什么**：素材包只有领域知识，没有具体功能需求

### 1.3 影响

- 字数超标 3.13 倍（Writer 试图覆盖所有领域知识）
- 素材包雷同（200 章几乎一样）
- 内容空洞（Writer 凭空编造功能描述）

## 2. 目标

让大纲成为**需求文档和 Writer 之间的桥梁**，承载：
1. **需求内容**：Writer 知道"写什么"
2. **参考资料指引**：Writer 知道"参考什么"
3. **字数预算**：Writer 知道"写多少"

## 3. 方案设计

### 3.1 改进后的数据流

```
需求文档 (inputs/requirements.md)
    ↓
AdaptiveOutlinePlanner → OutlineChapter[] (保留 sourceNodes)
    ↓
outline.md (包含需求来源)
    ↓
organize → 解析需求来源 → 生成 requirement-map.json
    ↓
素材包 (需求内容 + 领域知识)
    ↓
Writer 拿到的是：
  - 章节标题
  - 具体功能需求（来自 requirements.md）
  - 少量相关领域知识（来自 reference_material）
```

### 3.2 大纲改进

**现状**：
```markdown
ch005 S&OP计划传递管理
本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字
本节涵盖「S&OP计划传递管理」相关内容。
```

**改进后**：
```markdown
ch005 S&OP计划传递管理
本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字
需求来源: §2.1.3.1.1, §2.1.3.1.2

功能要求:
- 新机/单元体计划单快速编制，单台管控、增量调整
- 大修/检返机计划单编制，需求预测功能
- 零部件计划单编制，增量计划管控
- S&OP计划自动生成，差异增量下发
```

### 3.3 需求映射索引

生成 `assets/requirement-map.json`：

```json
{
  "ch005": {
    "sections": ["2.1.3.1.1", "2.1.3.1.2"],
    "headings": [
      "新机及单元体计划单编制与变更",
      "大修及检返机计划单编制与变更"
    ],
    "content": "#### 2.1.3.1.1 新机及单元体...\n...\n\n#### 2.1.3.1.2 大修..."
  },
  "ch006": {
    "sections": ["2.1.3.2"],
    "headings": ["监管任务关联管理"],
    "content": "###### 2.1.3.2 监管任务关联管理\n..."
  }
}
```

### 3.4 素材包改进

**现状**：
```markdown
# ch005 素材包：S&OP计划传递管理

## 章节信息
- **章节 ID**: ch005
- **标题**: S&OP计划传递管理
- **相关分类**: 战略管理与数字化运营中心

## 相关文件
共 1 个相关文件：
- **_索引.md** (战略管理与数字化运营中心)

## 关键数据
- **深化_04_50人驻厂团队组织与绩效管理**: 50人
- **OP+预测BOM/计划BOM | 齐套交**: 23%
... (100+ 条无关指标)
```

**改进后**：
```markdown
# ch005 素材包：S&OP计划传递管理

## 需求要点（来自 requirements.md §2.1.3.1.1 - §2.1.3.1.2）

### 新机及单元体计划单编制与变更
- 实现计划单快速编制
- 提供单据查询、变更调整、版本管控、历史单据归档
- 单台管控、增量调整模式
- S&OP计划向下释放至主需求计划
- 调减时自动推送变更通知单至生产部门
- 版本管理机制：每次变更生成新版本

### 大修及检返机计划单编制与变更
- 依托资源机入厂信息及管理指标
- 实现大修、检返机计划单快速编制
- 新增大修及检返机需求预测功能

## 领域知识（来自 reference_material）
- S&OP 最佳实践（简要）
- 行业案例（简要）

## 数据基线
- 与本章节相关的具体指标（精准匹配）
```

## 4. 改动点

### 4.1 类型定义

**文件**: `src/outline/types.ts`

```typescript
export interface OutlineChapter {
  id: string;
  title: string;
  type: string;
  wordBudget: { min: number; max: number };
  importance: number;
  description: string;
  // 新增
  requirementSource?: {
    sections: string[];      // 需求文档中的章节编号
    headings: string[];      // 需求文档中的章节标题
  };
}
```

### 4.2 大纲规划器

**文件**: `src/outline/adaptive-planner.ts`

改动：
- `plan()` 方法输出时保留 `sourceNodes` 信息
- 将 `sourceNodes` 转换为 `requirementSource`

```typescript
return {
  id,
  title: ch.title,
  // ...
  requirementSource: {
    sections: ch.sourceNodes.map(n => n.number).filter(Boolean),
    headings: ch.sourceNodes.map(n => n.title),
  },
};
```

### 4.3 大纲输出

**文件**: `src/commands/outline.ts`

改动：
- 输出 outline.md 时包含需求来源和功能要求
- 格式：
  ```markdown
  ch005 S&OP计划传递管理
  本章类型: functional。重要度: 3/5。
  字数预算: 5000-8000字
  需求来源: §2.1.3.1.1, §2.1.3.1.2
  
  功能要求:
  - ...
  ```

### 4.4 大纲解析

**文件**: `src/organize/outline-parser.ts`

改动：
- 解析 outline.md 时提取需求来源
- 返回 `OutlineChapter` 包含 `requirementSource`

### 4.5 需求映射生成

**新文件**: `src/organize/requirement-mapper.ts`

功能：
- 读取 requirements.md
- 根据章节号提取对应内容
- 生成 `assets/requirement-map.json`

```typescript
export class RequirementMapper {
  map(outline: Outline, requirementsDoc: string): RequirementMap {
    // 解析需求文档为章节树
    // 根据 outline 中的 requirementSource.sections 提取内容
    // 返回 RequirementMap
  }
}
```

### 4.6 素材包生成

**文件**: `src/organize/kit-generator.ts`

改动：
- 读取 `requirement-map.json`
- 注入需求内容到素材包
- 减少领域知识的权重

### 4.7 organize 流程

**文件**: `src/commands/organize.ts`

改动：
- 添加需求映射生成步骤
- 传递 `requirement-map.json` 给 KitGenerator

## 5. 实施步骤

### Phase 1: 类型扩展和大纲改进

1. 扩展 `OutlineChapter` 类型，添加 `requirementSource`
2. 修改 `AdaptiveOutlinePlanner`，保留 sourceNodes 信息
3. 修改 `outline.ts`，输出包含需求来源的大纲
4. 测试：生成新大纲，验证包含需求来源

### Phase 2: 需求映射生成

1. 创建 `RequirementMapper` 类
2. 实现需求文档解析和内容提取
3. 生成 `requirement-map.json`
4. 测试：验证映射文件内容正确

### Phase 3: 素材包改进

1. 修改 `KitGenerator`，读取 `requirement-map.json`
2. 注入需求内容到素材包
3. 减少领域知识的权重
4. 测试：验证素材包包含需求内容

### Phase 4: 集成测试

1. 端到端测试：从需求文档到素材包
2. 验证 Writer 拿到的信息正确
3. 验证字数超标问题缓解

## 6. 测试策略

### 6.1 单元测试

- `AdaptiveOutlinePlanner`：验证输出包含 `requirementSource`
- `RequirementMapper`：验证需求内容提取正确
- `KitGenerator`：验证素材包包含需求内容

### 6.2 集成测试

- 生成大纲 → 解析大纲 → 生成素材包
- 验证数据流完整

### 6.3 端到端测试

- 使用 LMERP2V2 的真实需求文档
- 生成大纲，验证包含需求来源
- 生成素材包，验证包含需求内容
- 运行 Writer，验证字数超标问题缓解

## 7. 风险评估

### 7.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 大纲文件变大 | 中等 | 使用索引文件，大纲保持轻量 |
| 需求文档解析失败 | 高 | 添加 fallback 逻辑 |
| 素材包生成变慢 | 低 | 索引文件只生成一次 |
| 现有项目不兼容 | 中 | 提供迁移脚本 |

### 7.2 回滚方案

- 保留旧的 outline.md 格式解析逻辑
- 如果没有 `requirementSource`，回退到旧的匹配逻辑

## 8. 预期效果

### 8.1 质量改进

- Writer 知道具体功能需求，内容更准确
- 素材包精准匹配，减少无关信息
- 字数超标问题缓解（预计从 3.13x 降到 1.5x）

### 8.2 性能改进

- 素材包从 114 KB 降到 15-20 KB
- Writer prompt 处理时间减少
- 总运行时间减少 20-30%

### 8.3 可追溯性

- 每个章节都能追溯到具体需求
- 便于审阅和修复

## 9. 时间估算

| Phase | 工作量 | 说明 |
|-------|--------|------|
| Phase 1 | 2-3 小时 | 类型扩展和大纲改进 |
| Phase 2 | 3-4 小时 | 需求映射生成 |
| Phase 3 | 2-3 小时 | 素材包改进 |
| Phase 4 | 2-3 小时 | 集成测试 |
| **总计** | **9-13 小时** | |

## 10. 下一步

1. 确认方案
2. 开始 Phase 1 实施
3. 逐步验证每个阶段

## 11. 效果度量方案

### 11.1 改进前基线（当前状态）

| 指标 | 当前值 | 度量方法 |
|------|--------|----------|
| 素材包平均大小 | 27 KB（最大 114 KB） | `ls -l assets/chapter-kits/*.md` |
| 字数超标倍数 | 3.13x | `wc -m drafts/chapters/*.md` |
| 需求覆盖率 | 0% | 素材包中无需求内容 |
| 素材包相似度 | ~95% | 200 章几乎一样 |
| 审阅通过率 | 94% (188/200) | `lastReviewVerdict: accept` |

### 11.2 T1 完成后度量（素材包改进）

**度量目标**：验证素材包包含需求内容

| 指标 | 目标值 | 度量方法 |
|------|--------|----------|
| 大纲包含需求来源 | 100% | `grep -c "需求来源:" outline.md` = 200 |
| requirement-map.json 完整性 | 100% | `jq 'keys \| length' assets/requirement-map.json` = 200 |
| 素材包包含需求内容 | 100% | `grep -l "需求要点" assets/chapter-kits/*.md \| wc -l` = 200 |
| 素材包平均大小 | < 20 KB | `ls -l assets/chapter-kits/*.md` |
| 字数超标倍数 | < 2x | 重新运行写作流程，对比字数 |

**成功标准**：
- P0：素材包包含需求内容（100%）
- P0：字数超标 < 2x
- P1：素材包大小 < 20 KB

### 11.3 T2 完成后度量（字数控制）

**度量目标**：验证字数控制在预算内

| 指标 | 目标值 | 度量方法 |
|------|--------|----------|
| 字数超标倍数 | < 1.5x | `wc -m drafts/chapters/*.md` |
| 每章字数范围 | 5000-10000 字符 | 统计各章节字数分布 |
| 审阅通过率 | > 80% | `lastReviewVerdict: accept` |
| 修复轮次 | < 1.2 轮 | 统计 fix 次数 |

**成功标准**：
- P0：字数超标 < 1.5x
- P1：审阅通过率 > 80%

### 11.4 T3 完成后度量（领域知识精准匹配，如实施）

**度量目标**：验证领域知识精准匹配

| 指标 | 目标值 | 度量方法 |
|------|--------|----------|
| 领域知识相关度 | > 70% | 抽样检查 10 章，评估领域知识与章节的相关性 |
| 素材包相似度 | < 30% | 计算两两章节的文本相似度 |
| 指标乱码率 | < 10% | 统计乱码指标占比 |

**成功标准**：
- P1：领域知识相关度 > 70%
- P2：素材包相似度 < 30%

### 11.5 最终效果对比报告

```markdown
# 素材包改进效果报告

## 改进前（基线）
- 素材包平均大小: 27 KB
- 字数超标倍数: 3.13x
- 需求覆盖率: 0%
- 素材包相似度: 95%
- 审阅通过率: 94%

## T1 完成后
- 素材包平均大小: ? KB (目标 < 20 KB)
- 字数超标倍数: ?x (目标 < 2x)
- 需求覆盖率: ?% (目标 100%)
- 素材包相似度: ?% (目标 < 50%)
- 审阅通过率: ?% (目标 > 80%)

## T2 完成后
- 字数超标倍数: ?x (目标 < 1.5x)
- 审阅通过率: ?% (目标 > 80%)

## T3 完成后（如实施）
- 领域知识相关度: ?% (目标 > 70%)
- 素材包相似度: ?% (目标 < 30%)

## 结论
- [ ] T1 达到预期
- [ ] T2 达到预期
- [ ] T3 达到预期（如实施）
```

### 11.6 验证脚本

创建验证脚本 `scripts/validate-improvement.sh`：

```bash
#!/bin/bash

echo "=== 改进验证 ==="

# 1. 检查大纲需求来源
outline_sources=$(grep -c "需求来源:" outline.md 2>/dev/null || echo 0)
echo "大纲包含需求来源的章节数: $outline_sources / 200"

# 2. 检查 requirement-map.json
if [ -f assets/requirement-map.json ]; then
    map_chapters=$(jq 'keys | length' assets/requirement-map.json)
    echo "requirement-map.json 包含章节数: $map_chapters"
else
    echo "❌ requirement-map.json 不存在"
fi

# 3. 检查素材包需求内容
kits_with_requirements=$(grep -l "需求要点" assets/chapter-kits/*.md 2>/dev/null | wc -l)
echo "素材包包含需求要点的章节数: $kits_with_requirements / 200"

# 4. 素材包大小
avg_size=$(ls -l assets/chapter-kits/*.md 2>/dev/null | awk '{sum+=$5; count++} END {printf "%.1f", sum/count/1024}')
echo "素材包平均大小: ${avg_size} KB"

# 5. 字数超标倍数
total_chars=$(wc -m drafts/chapters/*.md 2>/dev/null | tail -1 | awk '{print $1}')
if [ -n "$total_chars" ]; then
    ratio=$(echo "scale=2; $total_chars / 1000000" | bc)
    echo "字数超标倍数: ${ratio}x"
else
    echo "❌ drafts/ 目录不存在或为空"
fi

echo ""
echo "=== 成功标准检查 ==="
[ "$outline_sources" -eq 200 ] && echo "✅ 大纲包含需求来源" || echo "❌ 大纲需求来源不完整"
[ "$kits_with_requirements" -eq 200 ] && echo "✅ 素材包包含需求内容" || echo "❌ 素材包需求内容不完整"
[ $(echo "$avg_size < 20" | bc) -eq 1 ] && echo "✅ 素材包大小 < 20 KB" || echo "❌ 素材包大小超标"
[ $(echo "$ratio < 2" | bc) -eq 1 ] && echo "✅ 字数超标 < 2x" || echo "❌ 字数超标严重"
```
