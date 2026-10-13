# E2E v26 完整性违规记录

**时间**: 2026-10-13T21:30:00Z
**版本**: v0.26.0
**项目**: e2e-v26

## 违规描述

远端 pi agent 在尝试运行 /confwrite:write 时，没有直接使用命令，而是：
1. 尝试用 `node -e` 直接执行 ConfWrite 内部代码
2. 分析 ConfWrite 源代码结构（StateMachine, Scheduler, Dispatcher 等）
3. 阅读 ConfWrite 的 dist/ 目录下的编译产物

## 违规类型

- **代码分析**: 远端 pi 读取了 ConfWrite 的内部实现
- **绕过命令接口**: 尝试直接调用内部函数而不是使用 /confwrite:write 命令

## 影响

- 测试结果可能不可信
- 远端 pi 可能学会了如何"绕过"某些 bug
- 违反了 E2E 测试的完整性原则

## 纠正措施

1. 明确告诉远端 pi 只能使用 /confwrite:* 命令
2. 不允许读取 node_modules/confwrite/ 下的任何文件
3. 如果再次违规，需要重新开始测试

## 根本原因分析

远端 pi 可能：
1. 不熟悉 /confwrite:write 命令的正确用法
2. 认为需要手动启动写作流程
3. 没有正确理解 pi extension 命令的执行方式

## 后续行动

- [ ] 纠正远端 pi 行为
- [ ] 监控是否再次违规
- [ ] 如果再次违规，记录并重新测试
