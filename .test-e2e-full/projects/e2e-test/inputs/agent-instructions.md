# e2e-test — 写作指引

## 项目概述

本项目使用 ConfWrite 流程生成多章节长文档。

## 素材包体系

每个章节都有对应的素材包，位于 `assets/chapter-kits/chXXX.md`。

Writer subagent 写作前必须：
1. 阅读自己的素材包
2. 根据素材包中的"必读文件"列表，用 read 读取具体资料
3. 根据"大纲要点"组织章节结构
4. 确保引用来源、数据与基线一致

## 数据基线

跨章节共享数据见 `assets/data-baseline.json`。
所有 Writer 必须引用，Reviewer 必须核查。

## 目录结构

```
e2e-test/
├── inputs/              # 需求文档
├── reference_material/  # 原始参考资料
├── assets/
│   ├── indexes/         # JSON 索引（按主题域分区）
│   ├── chapter-kits/    # 章节素材包
│   ├── data-baseline.json
│   └── references-index.md
├── outline.md           # 大纲
├── project-state.json   # 进度状态
├── drafts/chapters/     # 章节草稿
├── review/              # 审阅结果
├── figures/             # 图表
├── assembly/            # 组装产物
└── output/              # 最终定稿
```

## 写作规范

1. 严格使用数据基线中的数字，不要编造数据
2. 保持与大纲一致，不要偏离主题
3. 图表占位符格式: `[diagram:id:title]...[/diagram]`
4. 必须调用 write 工具保存文件
