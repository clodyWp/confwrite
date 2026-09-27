# Handoff Document - ConfWrite 项目

> 生成时间: 2026-09-27
> 最后更新: 2026-09-27

## 📋 项目概述

**ConfWrite** 是一个基于 pi-coding-agent 的长文档生成扩展，支持从素材整理到最终导出的完整工作流。

**核心能力:**
- 多章节长文档生成（支持 100+ 章节，百万字级别）
- 自动化写作-审阅-修复循环
- 图表生成和嵌入
- 多格式导出（Markdown/HTML/DOCX）

**技术栈:**
- TypeScript + Node.js
- pi-coding-agent 扩展框架
- pandoc（DOCX 导出）
- sharp（图片处理）

---

## ✅ 当前状态

### 版本信息
- **当前版本**: v0.12.0
- **发布状态**: ✅ 已发布到 GitHub
- **仓库地址**: https://github.com/clodyWp/confwrite
- **测试状态**: ✅ 端到端测试通过

### 最近完成的工作（2026-09-27）

1. **跨平台路径修复**
   - 修复 `kit-generator.ts` 中的路径拼接问题
   - 修复 `task-executor.ts` 中的审阅报告路径问题
   - 添加 `prepare` 脚本支持自动构建
   - 添加 `keywords: ["pi-package"]` 支持 pi 包发现

2. **文档完善**
   - 创建 LICENSE 文件
   - 创建 CHANGELOG.md
   - 更新 README.md 安装说明

3. **发布和部署**
   - 提交代码到 GitHub
   - 在远程 c2 工作区完成端到端测试
   - 验证完整工作流：安装 → 初始化 → 写作 → 导出

4. **端到端测试结果**
   ```
   ✅ pi install -l git:github.com/clodyWp/confwrite
   ✅ /confwrite:init e2e-test
   ✅ /confwrite:organize e2e-test
   ✅ /confwrite:write e2e-test
   ✅ 写作-审阅-修复循环（8 章节，多轮迭代）
   ✅ 图表生成（27 张图表）
   ✅ 导出 DOCX（651K，13 张图片，6 个表格）
   ✅ 导出 HTML（344K）
   ✅ 导出 Markdown（333K）
   ```

---

## 🎯 待办事项

### 高优先级

1. **配置系统**
   - [ ] 实现用户可配置的并发参数
   - [ ] 添加 `/confwrite:config` 命令
   - [ ] 支持配置文件（confwrite.config.json）
   - 当前状态：参数硬编码在 `DEFAULT_SCHEDULER_CONFIG` 中

2. **性能优化**
   - [ ] 当前并发数为 1（串行），大项目耗时长
   - [ ] 测试并发写入的稳定性
   - [ ] 优化审阅-修复循环的收敛速度

3. **错误处理**
   - [ ] 改进 429 错误的自动恢复机制
   - [ ] 添加更详细的错误日志
   - [ ] 实现任务失败的部分恢复

### 中优先级

4. **功能增强**
   - [ ] 支持自定义图表样式
   - [ ] 添加文档模板系统
   - [ ] 支持增量更新（只更新变化的章节）

5. **文档完善**
   - [ ] 添加用户指南
   - [ ] 添加开发者文档
   - [ ] 添加常见问题 FAQ

### 低优先级

6. **测试覆盖**
   - [ ] 增加单元测试覆盖率
   - [ ] 添加集成测试
   - [ ] 添加性能基准测试

---

## 🏗️ 技术架构

### 核心模块

```
src/
├── commands/           # 命令实现
│   ├── init.ts        # 项目初始化
│   ├── organize.ts    # 素材整理
│   ├── write.ts       # 写作流程
│   └── export.ts      # 文档导出
├── writing/           # 写作核心逻辑
│   ├── orchestrator.ts      # 写作协调器
│   ├── task-executor.ts     # 任务执行器
│   └── output-validator.ts  # 输出验证器
├── scheduler/         # 任务调度
│   ├── index.ts       # 调度器主逻辑
│   ├── runner.ts      # 任务运行器
│   └── pi-executor.ts # pi 子代理执行器
├── diagrams/          # 图表生成
│   ├── generator.ts   # 图表生成器
│   ├── pipeline.ts    # 图表处理管线
│   └── png-converter.ts # PNG 转换
└── state/             # 状态管理
    ├── schema.ts      # 状态模式定义
    └── store.ts       # 状态持久化
```

### 工作流程

```
Phase 0a: 项目初始化
  ↓
Phase 0b: 素材整理（扫描→转换→索引→基线→素材包）
  ↓
Phase 1: 需求分析（可选）
  ↓
Phase 2: 大纲规划
  ↓
Phase 3: 素材准备
  ↓
Phase 4a: 写作（writer 子代理）
  ↓
Phase 4b: 审阅（reviewer 子代理）
  ↓
Phase 4c: 决策（accept/revise/reject）
  ↓
Phase 4d: 修复（fixer 子代理）→ 回到 4b
  ↓
Phase 5: 图表生成
  ↓
Phase 6: 组装
  ↓
Phase 7: 定稿
  ↓
Phase 8: 导出（pandoc）
```

### 关键配置

**调度器配置** (`src/state/schema.ts`):
```typescript
DEFAULT_SCHEDULER_CONFIG = {
  maxConcurrency: 1,           // 并发数（当前串行）
  tokenBucketSize: 10,         // 令牌桶大小
  tokenRefillRate: 0.5,        // 令牌补充速率
  taskTimeoutMs: 600000,       // 任务超时 10 分钟
  maxTurnsPerTask: 40,         // 单任务最大轮次
  rateLimitDelayMs: 60000,     // 429 限流等待 60 秒
}
```

---

## 🔧 开发环境

### 本地开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 测试
npm test

# 本地安装到 pi
pi install ./confidenceWriter
```

### 远程测试

```bash
# 推送到远程 c2 工作区
bash scripts/push-to-remote.sh

# 远程工作区信息
# 机器: water@8.160.160.85
# 目录: /home/water/proj/c2
# pane: w8:p1
```

### 代理配置

Git 需要使用代理访问 GitHub:
```bash
git config --global http.proxy http://127.0.0.1:10809
git config --global https.proxy http://127.0.0.1:10809
```

---

## 🐛 已知问题

### Bug 50: 审阅报告路径问题（已修复）
- **问题**: 审阅报告写入错误目录
- **原因**: 相对路径 + 子代理 cwd 不可控
- **修复**: 使用绝对路径 `join(projectDir, 'review', ...)`

### Bug 51: revise 循环无轮次递增（已修复）
- **问题**: 潜在无限循环风险
- **原因**: fixer 完成后不递增 `chapter.round`
- **修复**: 在 fixer case 中添加 `chapter.round += 1`

### 待解决
- 并发配置不支持用户自定义
- 大项目串行执行耗时长
- 429 错误恢复机制不够智能

---

## 📚 相关资源

### 文档
- [README.md](./README.md) - 项目说明
- [CHANGELOG.md](./CHANGELOG.md) - 变更日志
- [BUGS.md](./BUGS.md) - Bug 记录
- [SKILL.md](./SKILL.md) - Skill 定义

### 测试项目
- **t3 工作区**: `/home/water/Projects/t3`
  - LmERP2-regression: 完整回归测试（230 章节）
- **t4 工作区**: `/home/water/Projects/t4`
  - sylmerp2: 实际项目（230 章节，184 万字）
- **c2 远程工作区**: `water@8.160.160.85:/home/water/proj/c2`
  - e2e-test: 端到端测试项目

### 外部依赖
- [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) - 核心框架
- [pandoc](https://pandoc.org/) - 文档转换
- [sharp](https://sharp.pixelplumbing.com/) - 图片处理

---

## 💡 接手建议

### 快速开始

1. **了解项目**
   - 阅读 README.md
   - 查看 CHANGELOG.md 了解最近变更
   - 运行 `npm test` 确保环境正常

2. **测试现有功能**
   ```bash
   # 在本地创建测试项目
   /confwrite:init test-project
   
   # 添加测试素材
   # 将一些 markdown 文件放入 reference_material/
   
   # 运行完整流程
   /confwrite:organize test-project
   /confwrite:write test-project
   ```

3. **查看待办事项**
   - 优先处理"高优先级"任务
   - 配置系统是最需要的功能

### 注意事项

1. **构建后再测试**
   - 修改代码后必须 `npm run build`
   - pi 加载的是 `dist/` 目录的编译产物

2. **代理配置**
   - Git 操作需要配置代理
   - 远程机器访问需要 SSH 密钥

3. **测试环境**
   - 本地测试用小项目（5-10 章节）
   - 完整测试用远程 c2 工作区

4. **版本发布**
   - 修改 `package.json` 版本号
   - 更新 CHANGELOG.md
   - 提交并推送到 GitHub
   - 创建 git tag

---

## 📞 联系信息

- **GitHub**: https://github.com/clodyWp/confwrite
- **问题反馈**: 在 GitHub 创建 Issue
- **远程机器**: water@8.160.160.85

---

## 🔄 更新日志

### 2026-09-27
- ✅ 完成跨平台路径修复
- ✅ 发布 v0.12.0
- ✅ 完成端到端测试
- ✅ 创建 handoff 文档

### 2026-09-26
- ✅ 修复 Bug 50 和 Bug 51
- ✅ 推送到 GitHub
- ✅ 在远程 c2 工作区测试安装

### 更早
- 见 CHANGELOG.md
