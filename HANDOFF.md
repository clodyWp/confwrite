# 交接状态（ConfWrite）

> 记录时间：2026-09-20 16:35
> 分支：`fix/diagram-block-formats` @ `3029c8a`
> 测试：**790 通过 / 89 文件**（连跑两次稳定）
> 本文档目的是**跨 compaction 存活** —— 恢复时先读它

---

## 1. 当前目标（用户最后确认的方向）

用户选了「**装 mmdc，拿到 23 张图的完整版 Word**」。

已完成的部分：mmdc 已装好、能独立渲染 ✓
未完成的部分：**流程（pi 扩展）里仍然报 mmdc 不可用** ✗ —— 正在诊断

---

## 2. 绝对事实清单（可直接引用，不必重新验证）

### 2.1 已完成的代码工作（都已提交）

```
3029c8a  docs: BUGS.md 补充第四轮发现的 Bug 31–35
f3b2e62  fix: 图表两种格式端到端不一致 + 孤儿图 + 缺 mmdc 静默降级（33/34/35）
ef378a7  fix: 素材包与大纲不对应时会静默拿到别的章节的素材（31）
c215db8  docs: 同步「职责分离已合入并修正」到四份文档
e6e6fe6  merge: 合入职责分离，并保留 ch 级篇幅口径（修正其层级笔误）
a2414e0  chore: 发布 v0.8.0（tag v0.8.0）  ← 22 个修复
```

分支链（后者包含前者全部提交）：

```
master
 └── … → fix/diagram-and-export       @ a2414e0 (tag v0.8.0) → c215db8
       └── fix/material-kit-sync      @ ef378a7   (Bug 31)
             └── fix/diagram-block-formats @ 3029c8a ← 当前 (Bug 33/34/35)
```

### 2.2 未提交的改动（**重要：compaction 不会丢文件，但这些尚未提交**）

```
 M src/assemble/converter.ts      pandoc 探测带 env
 M src/commands/export.ts         pandoc 调用带 env
 M src/diagrams/pipeline.ts       checkMmdc → resolveMmdc（用 findExecutable）
 M src/orchestrator/phases.ts     phase 5 结果落盘到 logs/diagram-pipeline.json
 M vitest.config.ts               testTimeout: 15000（e2e 并行时 5s 太紧）
?? src/utils/process-env.ts       buildToolEnv / findExecutable
?? tests/utils/process-env.test.ts   9 例，全过
```

这组改动的目的：**扩展运行时不能依赖 PATH**（见 §4）。
已被验证：`790 通过` ✓。但**尚未解决 mmdc 问题**（见 §3）。

### 2.3 LmERP2 项目现状

```
phase: 6 (assembling) | 章节: 8 章全部 completed
figures: 20 PNG（缺 ch001 的 3 张）
output/final.docx: 无（被清空，等待重新导出）
```

产物备份（未受影响）：
- `/home/water/Projects/t3/projects/LmERP2-20图版本备份-*` ← 20 图的完整版（docx 639,366 B）
- `/home/water/Projects/t3/projects/LmERP2-v0.8.0-交付备份-*` ← 15 章版（docx 1,472,671 B）
- `project-state.json.bak-*` 若干

---

## 3. 进行中：mmdc 在扩展里「不可用」

### 3.1 已确认的事实

| 项 | 值 |
|---|---|
| mmdc 已安装 | `/home/water/.local/share/mise/installs/node/26.7.0/bin/mmdc`（11.17.0）✓ |
| puppeteer 自带浏览器 | `/home/water/.cache/puppeteer/chrome-headless-shell/...` ✓ |
| 交互式 shell 渲染 | ✓ 成功（`/tmp/mmdtest` 里产出 SVG） |
| **pi 进程内渲染** | ✓ 成功（通过 pi 的 bash 工具跑 mmdc，`render-OK`） |
| **我的 shell 直接跑管线** | ✓ **23/23 全部生成** |
| **流程（扩展）里跑 phase 5** | ✗ **只生成 20，ch001 的 3 个 mermaid 全部降级** |

### 3.2 诊断日志（新增的持久化记录）

`LmERP2/logs/diagram-pipeline.json` 会记录每次 phase 5 的完整结果：

```json
{
  "at": "...", "runtimePath": "<扩展进程的 process.env.PATH>",
  "total": 23, "generated": 20, "skipped": 0, "failed": 0,
  "mermaidKeptAsCode": 3,
  "errors": [], "warnings": [{ "diagramId": "ch001-fig1", "warnings": ["未渲染为图片（mmdc 不可用）…"] }]
}
```

### 3.3 已经排除的假设

| 假设 | 结论 |
|---|---|
| 环境变量差异 | ✗ 排除 —— pi 进程的 env 与我的 shell 几乎相同（`comm` 对比：pi 独有键 0 个） |
| PATH 缺 mmdc 目录 | ✗ **排除** —— 日志里 `runtimePath` **包含** `/home/water/.local/share/mise/installs/node/26.7.0/bin` |
| 浏览器缺失 | ✗ 排除 —— puppeteer 自带浏览器已装且可用 |
| cwd 依赖（puppeteer 配置） | ✗ 已不相关（现在用自带浏览器，不再需要 `.puppeteerrc.cjs`，那两个文件已删除） |
| pi 没加载新 dist | ⚠️ **未确认** —— 最近两次重启的 `agent start` 输出被重定向到 /dev/null，没检查是否真的重启成功 |

> 早期一次日志显示 `runtimePath` 为空，后来又显示完整路径 —— **前后不一致，未解释**。
> 可能是「某次 pi 未真正重启、跑了旧 dist」造成的。

### 3.4 下一步（按顺序做）

1. **确认 pi 真的加载了新 dist**
   ```bash
   # 启动时不要吞掉输出
   timeout 15 herdr agent send-keys wD:p1 ctrl+d; sleep 4
   timeout 60 herdr agent start pi --kind pi --pane wD:p1 --timeout 45000   # 看返回，确认不是 agent_name_taken
   ```
   并用 dist 标记确认：`grep -c 'resolveMmdc' dist/diagrams/pipeline.js` → >0

2. **增强诊断日志**：把下面三项也写进 `logs/diagram-pipeline.json`
   - `process.execPath`（判断 mmdc 是否与 node 同目录）
   - `findExecutable('mmdc')` 的返回值（null 还是绝对路径）
   - `resolveMmdc()` 里 `mmdc --version` 的异常信息（含 stderr）

   最小实现：在 `resolveMmdc()` 的 catch 里把错误存到一个字段，phase 5 落盘时带上。

3. **根据结果二选一**
   - 若 `findExecutable` 返回 null → 说明候选目录都不对，扩 `extraDirs`
   - 若返回路径但 `--version` 抛错 → 是子进程环境问题，检查 `buildToolEnv()` 传的 env

4. 修好后重跑：`rm -rf figures/* && 状态置 phase 5 && 发命令` → 应得 23 张
5. 再走 `6 →（人工确认）→ 7 → 8` 出 docx，验证 **23 张内嵌图**

---

## 4. 本轮（8 章全量重跑）发现的 bug

见 `BUGS.md` §1c，共 5 个：**31、32、33、34、35**（31/33/34/35 已修，32 未修）。

而正在处理的 mmdc 问题 **尚未编号**，若最终确认为代码缺陷，可记为 **Bug 36**：

> **扩展运行时不能依赖 PATH，也不保证外部工具可解析**
> 现象：`execFileSync('mmdc')` 在扩展里失败，同一台机器在 shell 里正常。
> 已排除 PATH 缺失（PATH 里就有），待定位。

---

## 5. 环境关键事实（恢复时直接用）

### 5.1 路径

```
扩展仓库      /home/water/Projects/confidenceWriter
LmERP2 项目   /home/water/Projects/t3/projects/LmERP2
pi 会话工作区 /home/water/Projects/t3        ← pi 进程的 cwd（pid 用 /proc 查）
herdr 面板    wC:p1 = confidenceWriter（我）   wD:p1 = t3（被控）
```

### 5.2 外部依赖

| 工具 | 位置 | 状态 |
|---|---|---|
| pandoc | `/usr/bin/pandoc` (3.10.2) | ✓ |
| mmdc | `~/.local/share/mise/installs/node/26.7.0/bin/mmdc` (11.17.0) | ✓ 装好 |
| puppeteer 浏览器 | `~/.cache/puppeteer/chrome-headless-shell/linux-153.0.8010.36/...` | ✓ |
| chromium | `/usr/bin/chromium` | ✓（现在用不到，puppeteer 用自带的） |

**由我创建、事后可删的文件**（都已删除，此处仅备注）：
`/home/water/.puppeteerrc.cjs`、`/home/water/Projects/t3/.puppeteerrc.cjs` —— 已 `rm`。

### 5.3 常用命令

```bash
# 构建 + 测试
cd /home/water/Projects/confidenceWriter && npm run build && npm test

# 控制 t3 的 pi
timeout 15 herdr agent list
timeout 15 herdr agent read wD:p1 --lines 40
timeout 15 herdr agent send-keys wD:p1 ctrl+d      # 退出（ctrl+c 无效）
timeout 60 herdr agent start pi --kind pi --pane wD:p1 --timeout 45000
timeout 30 herdr agent prompt wD:p1 "/confwrite:write projects/LmERP2"

# 重置到 phase 5 重跑（先清产物）
cd /home/water/Projects/t3/projects/LmERP2
rm -rf figures/* assembly/* output/*
python3 -c "
import json;p='project-state.json';s=json.load(open(p))
s['currentPhase']='5';s['status']='writing';s['waitPoint']=None
s['executionLog']=[e for e in s.get('executionLog',[]) if e.get('phase') not in ('6','7','8','done')]
json.dump(s,open(p,'w'),ensure_ascii=False,indent=2)"
```

### 5.4 恢复上下文时注意

- **不要用 `sed 's/^/  /'` 查看缩进** —— 它会加 2 个空格，我已经因此两次误判缩进、改错文件。用 `python3 -c "print(repr(...))"`。
- **phase 5 的出口条件是 `hasFile('figures/manifest.json')`** —— 想让它重跑必须先删 manifest 或整个 figures/。
- **`notify()` 的内容不进 pi 会话转录**（只是 UI 通知），TUI 重绘后就看不到 —— 所以要看过程信息必须落盘。
- 提交信息里含反引号时**不要用 `git commit -m "..."`**（会被 shell 吃掉），用 `git commit -F 文件`。

---

## 6. 待办总览（按用户上次确认的优先级）

| # | 事项 | 状态 |
|---|---|---|
| 1 | **修好 mmdc 在扩展里不可用** → 拿到 23 张图的完整 Word | 🔄 进行中（见 §3.4） |
| 2 | 对齐图表格式约定（知识库要求 mermaid vs 项目用 diagram-start） | ⬜ 未做 |
| 3 | Bug 32（turn 预算耗尽无条件判失败）+ Bug 3（4c 死锁 `round>1`） | ⬜ 未做 |
| 4 | 方案 B（知识库驱动的图表布局；ch003/ch004 被判「33 节点超出布局能力」） | ⬜ 未做 |
| 5 | 删除已合入的 `feat/responsibility-separation`（已是祖先，安全） | ⬜ 未做 |
| 6 | 合并到 master（v0.8.0 目前在功能分支上） | ⬜ 未做 |

---

## 7. 已修 bug 的历史提交（备查）

```
beccb97  17 分层配色 + 18 跨平台字体
32a6238  19 全角冒号 + 20 列表前缀 + 21 多跳链
ebae90b  14 init 复制错目录
ed05a4d  12 图表注入 + 15 path-adjuster 死代码
1c438a8  10 waitPoint 跳过 execute + 22 组装缺文档标题
8e06fcf  9 phase8 真导出 + 16 依赖预检
a43dece  1 熔断空转 + 2 stoppedReason 被覆盖
54897b3  18 漏网（连接线标签字体）
d449a45  23 TOC 锚点 + 24 标题层级 + 25 分隔符致 pandoc 失败
17db496  26 图片未嵌入 + 27 导出未传 title
b9b119f  28 残留产物让阶段跳过自己的工作
637e8b9  29 图表缓存不查产物是否存在
1f1a17c  30 done 之后收尾报错
ef378a7  31 素材包与大纲不对应
f3b2e62  33/34/35 图表格式不一致 / 孤儿图 / 缺 mmdc 静默降级
```
