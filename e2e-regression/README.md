# E2E Regression Testing Resources

本目录包含 ConfWrite E2E 测试的配套资源。

## 目录结构

```
e2e-regression/
├── datasets/              # 回归测试数据集
│   ├── minimal/          # 3 章最小测试集
│   ├── standard/         # 7 章标准测试集
│   └── full/             # 10 章完整测试集
├── validators/           # 验证脚本
│   ├── phase-flow.sh     # 验证 phase 转换顺序
│   ├── word-count.sh     # 验证字数预算
│   ├── chapter-types.sh  # 验证章节类型覆盖
│   ├── integrity-check.sh # 检测源码分析行为
│   └── run-all.sh        # 运行所有验证
├── baselines/            # 基线数据
│   └── lmerp-v9/        # LMERP2V2-v9 提取数据
├── bug-patterns.json     # Bug 模式数据库
└── README.md            # 本文件
```

## 数据集说明

### minimal (3 章)

- **用途**: 快速冒烟测试
- **预计时间**: 30-45 分钟
- **覆盖类型**: functional, technical, requirements
- **适用场景**: 基本工作流验证

### standard (7 章)

- **用途**: 标准回归测试
- **预计时间**: 60-90 分钟
- **覆盖类型**: functional, technical, requirements, implementation, testing, deployment
- **适用场景**: 综合工作流验证

### full (10 章)

- **用途**: 完整压力测试
- **预计时间**: 120-180 分钟
- **覆盖类型**: 所有类型，包含图表和表格
- **适用场景**: 全面回归测试

## 验证脚本使用

所有验证脚本支持两种模式：
- **本地模式**: 直接指定项目目录
- **远程模式**: 使用 `--host` 和 `--dir` 参数通过 SSH 在远端执行

### 运行所有验证

```bash
# 本地模式
bash e2e-regression/validators/run-all.sh <project-dir>

# 远程模式（推荐）
bash e2e-regression/validators/run-all.sh --host <user@host> --dir <project-dir>
```

### 单独运行验证

```bash
# 完整性检查
bash e2e-regression/validators/integrity-check.sh --host water@8.160.160.85 --dir /home/water/proj/c4/projects/LMERP2V2-v9

# Phase 流程验证
bash e2e-regression/validators/phase-flow.sh --host water@8.160.160.85 --dir /home/water/proj/c4/projects/LMERP2V2-v9

# 字数验证
bash e2e-regression/validators/word-count.sh --host water@8.160.160.85 --dir /home/water/proj/c4/projects/LMERP2V2-v9

# 章节类型验证
bash e2e-regression/validators/chapter-types.sh --host water@8.160.160.85 --dir /home/water/proj/c4/projects/LMERP2V2-v9
```

### 参数说明

- `--host <user@host>`: 远程主机地址（如 `water@8.160.160.85`）
- `--dir <project-dir>`: 远端项目目录路径（如 `/home/water/proj/c4/projects/LMERP2V2-v9`）

## Bug 模式数据库

`bug-patterns.json` 包含已知的 bug 模式和检测方法。

### 结构

```json
{
  "id": "SM-001",
  "category": "state-machine",
  "severity": "critical",
  "symptom": "...",
  "detection": {
    "logPattern": "...",
    "stateCheck": "...",
    "command": "..."
  },
  "fix": "...",
  "status": "fixed|open|investigating"
}
```

### 分类

- **state-machine**: 状态机逻辑错误
- **task-scheduling**: 任务调度问题
- **logging**: 日志相关 bug
- **validation**: 验证相关 bug

## 使用流程

1. **选择数据集**: 根据测试目标选择 minimal/standard/full
2. **准备环境**: 在远端机器上创建项目目录
3. **运行测试**: 使用 E2E testing skill 指导测试流程
4. **验证结果**: 使用 validators 脚本验证测试完整性
5. **检查 bug**: 对照 bug-patterns.json 检查已知问题

## 维护

- 新增 bug 模式时更新 `bug-patterns.json`
- 新增数据集时在 `datasets/` 下创建子目录
- 验证脚本需要定期测试确保可用性

## 数据来源

- **LMERP2V2-v9**: 真实项目数据，包含 10 章完整文档
- **合成数据**: 基于 LMERP 结构生成的测试用例
