# 图表知识库

> 指导 Writer 和 Phase 5 如何生成、布局、检查技术文档图表。

## 文件说明

| 文件 | 用途 | 谁用 |
|------|------|------|
| `selection-guide.md` | 选型指南（入口索引） | Writer + Phase 5 |
| `layout.md` | 布局方法论（7条原则） | Writer + Phase 5 |
| `architecture.md` | 架构图规范 | Writer（架构章节） |
| `flowchart.md` | 流程图规范 | Writer（流程章节） |
| `sequence.md` | 时序图规范 | Writer（交互章节） |
| `er-diagram.md` | ER图规范 | Writer（数据章节） |
| `state-machine.md` | 状态机图规范 | Writer（状态章节） |
| `class-diagram.md` | 类图规范 | Writer（设计章节） |
| `deployment.md` | 部署图规范 | Writer（部署章节） |
| `data-flow.md` | 数据流图规范 | Writer（数据流章节） |
| `comparison-table.md` | 对比表规范 | Writer（对比章节） |
| `mermaid-syntax.md` | Mermaid 语法参考 | Phase 5（转换） |
| `plantuml-syntax.md` | PlantUML 语法参考 | Phase 5（转换） |
| `quality-lessons.md` | 质量教训（持续更新） | Phase 5（检查） |

## 使用方式

### Writer
1. Kit 生成时注入 `selection-guide.md` + `layout.md`（必读）
2. 根据章节类型注入相关规范（如架构章节注入 `architecture.md`）
3. Writer 遵循规范，用 `<!-- diagram-start -->` 格式描述图表

### Phase 5
1. 提取 `<!-- diagram-start -->` 标记
2. 基于知识库做规格检查（节点数、布局原则、术语一致性）
3. 转换为 mermaid → 渲染 SVG
4. 替换标记为图片引用

## 维护方法

### 手动更新
直接编辑本目录下的 `.md` 文件，Git 跟踪变更。

### 从 bailian-agent 同步
```bash
# 同步所有文件（保留本地修改的冲突提示）
cp ~/.bailian-agent/knowledge/diagrams/*.md knowledge/diagrams/
```

### 质量反馈循环
Phase 5 发现图表问题时，自动追加到 `quality-lessons.md`：
```markdown
## [日期] 问题标题
- **问题**: 描述
- **原因**: 分析
- **教训**: 总结
```

## 版本控制
- 每个文件带 frontmatter（title, tags, status, updated）
- Git 跟踪每次修改
- `quality-lessons.md` 按时间倒序记录
