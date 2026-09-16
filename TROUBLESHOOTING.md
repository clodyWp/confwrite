# ConfWrite 排障指南 (Troubleshooting)

本文档列出了常见问题及其解决方案。

---

## 目录

- [安装与配置](#安装与配置)
- [命令执行](#命令执行)
- [素材整理](#素材整理)
- [写作流程](#写作流程)
- [导出](#导出)
- [状态文件](#状态文件)

---

## 安装与配置

### 问题：`pi install` 失败

**症状**：
```
Error: Cannot find module 'confwrite-0.1.0.tgz'
```

**原因**：未执行 `npm pack` 或打包文件不在当前目录。

**解决方案**：
```bash
# 1. 确保在项目目录
cd confidenceWriter

# 2. 构建
npm run build

# 3. 打包
npm pack

# 4. 安装
pi install confwrite-0.1.0.tgz
```

---

### 问题：命令不可用

**症状**：在 pi 中输入 `/confwrite:` 后没有自动补全。

**原因**：扩展未正确安装或 `dist/` 目录不存在。

**解决方案**：
```bash
# 1. 检查 dist/ 是否存在
ls dist/

# 2. 如果不存在，构建
npm run build

# 3. 重新打包和安装
npm pack
pi install confwrite-0.1.0.tgz --force

# 4. 重启 pi
```

---

### 问题：Node.js 版本不兼容

**症状**：
```
Error: Required Node.js version >= 18
```

**解决方案**：
```bash
# 检查当前版本
node --version

# 如果 < 18，升级 Node.js
# macOS
brew upgrade node

# Windows (使用 nvm-windows)
nvm install 20
nvm use 20

# Linux (使用 nvm)
nvm install 20
nvm use 20
```

---

## 命令执行

### 问题：`/confwrite:init` 报告 "项目已存在"

**症状**：
```
项目 "my-project" 已存在: /path/to/projects/my-project
```

**解决方案**：
- 如果要重新初始化，先删除旧项目：
  ```bash
  rm -rf projects/my-project
  ```
- 或者使用不同的 slug：
  ```
  /confwrite:init my-project-v2
  ```

---

### 问题：`/confwrite:init` 报告 "Invalid slug"

**症状**：
```
初始化失败: Invalid slug: "My Project". Only lowercase letters, numbers, and hyphens allowed.
```

**原因**：slug 只能包含 `[a-z0-9-]`。

**解决方案**：使用合法的 slug：
```
# 错误
/confwrite:init My Project
/confwrite:init my_project
/confwrite:init my.project

# 正确
/confwrite:init my-project
/confwrite:init project2024
```

---

### 问题：`/confwrite:write` 只显示 JSON，没有实际执行

**症状**：
```
📝 [4a] 写作: Phase 4a: 12 章待写
待执行:
{
  "action": "spawn_writers",
  "params": { "chapters": ["ch001", "ch002", ...] }
}
```

**原因**：**Dispatcher 层未实现**（已知问题）。状态机返回了 action，但没有代码实际执行它。

**解决方案**：这是当前版本的限制。需要实现 Dispatcher（详见 `HANDOFF.md §5`）。

**临时绕过**：手动根据 action 内容调用 subagent（不推荐，容易出错）。

---

### 问题：`/confwrite:status` 报告 "未找到项目状态文件"

**症状**：
```
未找到项目状态文件
```

**原因**：当前目录不是项目目录，或 `project-state.json` 不存在。

**解决方案**：
```bash
# 1. 确认在项目目录
pwd
# 应该显示 /path/to/projects/<slug>

# 2. 检查 project-state.json 是否存在
ls project-state.json

# 3. 如果不存在，可能需要初始化
/confwrite:init <slug>

# 4. 或者指定项目目录
/confwrite:status /path/to/projects/my-project
```

---

## 素材整理

### 问题：`/confwrite:organize` 报告 "0 个文件"

**症状**：
```
扫描: 0 个文件
```

**原因**：`reference_material/` 目录为空或不存在。

**解决方案**：
```bash
# 1. 确认资料文件已放入正确目录
ls reference_material/

# 2. 如果为空，复制资料文件
cp ~/docs/*.md reference_material/
cp ~/docs/*.pdf reference_material/

# 3. 重新整理
/confwrite:organize
```

---

### 问题：PDF/DOCX 文件未被处理

**症状**：资料中有 PDF/DOCX 文件，但整理后没有对应的 Markdown 文件。

**原因**：PDF/DOCX 转换当前为**桩实现**（stub），只处理 HTML。

**解决方案**：
- 手动将 PDF/DOCX 转换为 Markdown：
  ```bash
  # 使用 pandoc
  pandoc input.docx -t markdown -o output.md
  pandoc input.pdf -t markdown -o output.md  # 需要 pdftotext
  
  # 或使用在线工具转换后放入 reference_material/
  ```
- 或者只使用 Markdown 格式的资料

---

### 问题：素材包内容为空

**症状**：`assets/chapter-kits/ch001.md` 存在但内容为空或只有模板。

**原因**：大纲中没有 `ch` 标记，或 `outline.md` 不存在。

**解决方案**：
```bash
# 1. 检查 outline.md 是否存在
ls outline.md

# 2. 检查是否有 ch 标记
grep "^ch" outline.md

# 3. 如果没有，编辑大纲添加 ch 标记
# 例如：
# ch001 1.1 系统概述
# ch002 1.2 建设目标

# 4. 重新整理
/confwrite:organize
```

---

### 问题：章节映射不正确

**症状**：素材包中的"相关文件"与实际内容不匹配。

**原因**：`ChapterMapper` 使用简单的关键词/分类匹配，可能不准确。

**解决方案**：
- 手动编辑素材包 `assets/chapter-kits/chXXX.md`，调整"相关文件"列表
- 或在资料文件名/目录名中使用更明确的关键词

---

## 写作流程

### 问题：章节状态一直是 "pending"

**症状**：`/confwrite:status` 显示所有章节都是 pending，没有进展。

**原因**：Dispatcher 未实现，subagent 没有被实际调用。

**解决方案**：见 [写作流程 - write 只显示 JSON](#问题confwritewrite-只显示-json没有实际执行)

---

### 问题：章节状态卡在 "written"

**症状**：章节写完了但没有进入审阅阶段。

**原因**：状态机需要再次 tick 才能检查退出条件并进入下一阶段。

**解决方案**：
```bash
# 继续执行状态机
/confwrite:write
```

---

### 问题：审阅报告没有生成

**症状**：`review/` 目录为空。

**原因**：Reviewer subagent 没有被调用（Dispatcher 未实现）。

**解决方案**：同 Dispatcher 问题。

---

### 问题：轮次 (round) 不断增加

**症状**：`/confwrite:status` 显示 round > 1，且持续增长。

**原因**：Reviewer 持续给出 `reject` 决定，导致章节反复重写。

**解决方案**：
1. 检查审阅报告 `review/chXXX-review.md`，了解被拒绝的原因
2. 检查素材包 `assets/chapter-kits/chXXX.md`，确保提供了足够的上下文
3. 检查数据基线 `assets/data-baseline.json`，确保数据正确
4. 如果是审阅标准过严，可以手动编辑审阅报告，将 `reject` 改为 `revise`

---

## 导出

### 问题：`/confwrite:export` 报告 "No chapters found"

**症状**：
```
导出失败: No chapters found in outline
```

**原因**：`outline.md` 中没有 `ch` 标记，或 `drafts/chapters/` 目录为空。

**解决方案**：
```bash
# 1. 检查大纲
grep "^ch" outline.md

# 2. 检查草稿
ls drafts/chapters/

# 3. 如果没有草稿，需要先完成写作流程
```

---

### 问题：DOCX/PDF 导出失败

**症状**：
```
Pandoc conversion failed: pandoc: command not found
```

**原因**：未安装 Pandoc。

**解决方案**：
```bash
# macOS
brew install pandoc

# Windows (使用 chocolatey)
choco install pandoc

# Windows (使用 scoop)
scoop install pandoc

# Linux (Ubuntu/Debian)
sudo apt-get install pandoc

# 验证安装
pandoc --version
```

---

### 问题：PDF 导出中文乱码

**症状**：导出的 PDF 中中文字符显示为方块或乱码。

**原因**：LaTeX 引擎未配置中文字体。

**解决方案**：
```bash
# 使用 xelatex 引擎并指定中文字体
pandoc input.md -o output.pdf --pdf-engine=xelatex -V CJKmainfont="Noto Sans CJK SC"

# 或在 export 命令中指定（如果支持）
```

---

### 问题：导出的 HTML 格式不对

**症状**：导出的 HTML 中列表、表格等格式不正确。

**原因**：内置的 Markdown → HTML 转换器使用简单正则，不支持所有 Markdown 语法。

**解决方案**：
- 集成 `marked` 库（`package.json` 已声明依赖但未使用）
- 或导出为 Markdown 后用其他工具转换

---

## 状态文件

### 问题：`project-state.json` 损坏

**症状**：
```
Error: Unexpected token } in JSON at position 1234
```

**原因**：进程崩溃时正在写入状态文件。

**解决方案**：
```bash
# 1. 检查是否有备份
ls project-state.json.bak

# 2. 如果有备份，恢复
cp project-state.json.bak project-state.json

# 3. 如果没有备份，手动修复 JSON
# 使用 JSON 验证工具检查语法错误
vim project-state.json

# 4. 或者重新初始化（会丢失进度）
rm project-state.json
/confwrite:init <slug>
```

---

### 问题：状态文件中的章节与实际不符

**症状**：`project-state.json` 中的章节列表与 `outline.md` 不一致。

**原因**：修改了大纲但没有同步状态。

**解决方案**：
```bash
# 1. 手动编辑 project-state.json，添加/删除章节
vim project-state.json

# 2. 或者重新初始化（会丢失进度）
```

**建议**：后续版本应实现自动同步（大纲变更 → 自动更新状态）。

---

### 问题：如何手动重置章节状态

**场景**：某个章节一直失败，想重新开始。

**解决方案**：
```bash
# 1. 编辑 project-state.json
vim project-state.json

# 2. 找到对应章节，修改状态
{
  "chapters": {
    "ch001": {
      "id": "ch001",
      "status": "pending",  // 改为 pending
      "attempt": 0,         // 重置尝试次数
      "round": 1            // 重置轮次
    }
  }
}

# 3. 保存后继续
/confwrite:write
```

---

## 其他问题

### 问题：测试失败

**症状**：`npm test` 报告测试失败。

**解决方案**：
```bash
# 1. 运行所有测试，查看失败详情
npm test

# 2. 运行特定测试文件
npx vitest run tests/path/to/test.test.ts

# 3. 如果是新代码导致的，检查是否破坏了现有功能
# 4. 如果是环境问题的，确保依赖已安装
npm install
```

---

### 问题：TypeScript 编译错误

**症状**：`npx tsc --noEmit` 报告类型错误。

**解决方案**：
```bash
# 1. 查看详细错误
npx tsc --noEmit

# 2. 修复类型错误
# 3. 重新检查
npx tsc --noEmit
```

---

## 获取帮助

如果以上方案都无法解决问题：

1. 查看 `DESIGN.md` 了解架构设计
2. 查看 `HANDOFF.md` 了解已知问题
3. 查看 `GLOSSARY.md` 了解术语定义
4. 提交 GitHub Issue，附上：
   - 错误信息
   - 复现步骤
   - `project-state.json` 内容
   - Node.js 版本 (`node --version`)
   - npm 版本 (`npm --version`)
