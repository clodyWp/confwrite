# 示例项目：简单技术方案

本示例展示如何使用 ConfWrite 生成一份简单的技术方案文档。

---

## 快速开始

### 1. 复制示例到工作目录

```bash
# 在 pi 中执行
cd /path/to/workspace
cp -r /path/to/confidenceWriter/examples/simple-proposal ./
cd simple-proposal
```

### 2. 初始化项目

```
/confwrite:init simple-proposal
```

### 3. 查看资料

```bash
ls reference_material/
# api-spec.md       - API 规范文档
# requirements.md   - 需求文档
```

### 4. 整理素材

```
/confwrite:organize
```

查看生成的文件：
```bash
ls assets/
# data-baseline.json    - 数据基线
# indexes/index.json    - 资料索引
# references-index.md   - 参考资料索引

ls assets/chapter-kits/
# ch001.md  - 第1章素材包
# ch002.md  - 第2章素材包
# ch003.md  - 第3章素材包
```

### 5. 查看大纲

```bash
cat outline.md
```

大纲定义了 3 个章节：
- ch001: 项目概述
- ch002: 系统架构
- ch003: 技术选型

### 6. 启动写作

```
/confwrite:write
```

> **注意**：当前版本 Dispatcher 未实现，此命令只会显示 action JSON，不会实际 spawn subagent。
> 详见 `HANDOFF.md §5`。

### 7. 查看进度

```
/confwrite:status
```

### 8. 导出文档

（假设章节已写完）

```
/confwrite:export md
/confwrite:export html
```

---

## 文件结构

```
simple-proposal/
├── README.md                    # 本文件
├── outline.md                   # 大纲（3 个章节）
└── reference_material/
    ├── api-spec.md              # API 规范文档
    └── requirements.md          # 需求文档
```

---

## 预期输出

整理素材后应生成：

```
assets/
├── data-baseline.json           # 包含提取的指标和术语
├── indexes/
│   └── index.json               # 资料索引
├── chapter-kits/
│   ├── ch001.md                 # 项目概述素材包
│   ├── ch002.md                 # 系统架构素材包
│   └── ch003.md                 # 技术选型素材包
└── references-index.md          # 参考资料索引
```

---

## 学习要点

1. **大纲格式**：注意 `outline.md` 中 `ch` 标记的使用
2. **素材包内容**：查看 `assets/chapter-kits/ch001.md`，理解 Writer subagent 会看到什么
3. **数据基线**：查看 `assets/data-baseline.json`，理解跨章节共享的数据
4. **状态文件**：查看 `project-state.json`，理解状态机如何追踪进度

---

## 下一步

- 阅读 `USAGE.md` 了解所有命令的详细用法
- 阅读 `DESIGN.md` 了解架构设计
- 阅读 `HANDOFF.md` 了解当前状态和待实现功能
