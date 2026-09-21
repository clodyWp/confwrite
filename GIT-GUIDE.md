# Git 分支操作指南（ConfWrite 专用）

> 面向不熟悉 git 的使用者。只讲本项目实际需要的操作。

---

## 1. 一句话记住

> **切分支 → 必须 `npm run build` → 重启 pi**

漏掉中间那步，你会**静默地运行旧代码**，且不会有任何报错。

---

## 2. 为什么必须 build

| 概念 | 说明 |
|------|------|
| **源码** | `src/**.ts` — TypeScript 源文件，**git 管的是这个** |
| **产物** | `dist/**.js` — 编译结果，**pi 实际加载的是这个** |
| **git 跟踪** | `dist/` 在 `.gitignore` 里，**不被 git 跟踪** |

推论：

```
git checkout <分支>   只改 src/           ← 不生效
npm run build         才把 src/ 编译进 dist/  ← 这一步才生效
重启 pi               才重新加载 dist/     ← 最后一步
```

因为 `dist/` 不被 git 跟踪，**切分支时 git 根本不会碰它**。所以"切了分支但没 build"= 还在跑上一个分支的代码。

### 真实例子（就是当前状态）

```
源码分支：  feat/tool-least-privilege
dist/ 实际：feat/responsibility-separation 编译产物
后果：      t3 跑的是 responsibility-separation 的代码
```

验证方式见 §5。

---

## 3. 当前有哪些分支

```
master ──── 4d30e14 (v0.7.3 已发布基线)
  │
  ├── feat/responsibility-separation @ f62f85c   （已合入下方分支，已是祖先）
  │
  └── 1e502ff (tag: before-ch-level-fix)
        └── feat/tool-least-privilege           （回退点，已被取代）
              └── feat/ch-level-length @ 39fdf88 （ch 级篇幅 + bash 恢复，已验证）
                    └── a2414e0 (tag: v0.8.0)   22 个修复 + 发布
                          └── e6e6fe6           merge: 合入职责分离  ← 当前
```

| 分支 | 内容 | 状态 |
|------|------|------|
| `master` | 已发布基线（v0.7.3） | 稳定 |
| `feat/responsibility-separation` | prompt 职责分离 | ✅ **已合入**（合并时修正了其层级笔误，见 `e6e6fe6`）；已是祖先，可删除 |
| `feat/tool-least-privilege` | 工具最小权限 + turn 预算 | 被取代（回退点） |
| `feat/ch-level-length` | ch 级篇幅修正 + bash 恢复 | 已验证 |
| **`fix/diagram-and-export`** | **22 个修复 + 职责分离**（图表准确 + 图表注入 + 导出打通） | **当前**（`v0.8.0` 标签在 `a2414e0`） |

`feat/` = 功能开发，`fix/` = 缺陷修复。
**注意**：`fix/diagram-and-export` **线性包含** `feat/ch-level-length` 的全部提交；
`feat/responsibility-separation` 曾是一条独立的线，已于 `e6e6fe6` 合入并修正。

---

## 4. 核心操作（记住这 5 条）

### 4.1 看自己在哪个分支

```bash
cd /home/water/Projects/confidenceWriter
git branch --show-current
```

输出 `feat/tool-least-privilege` 表示当前在这个分支。
带 `*` 的那个就是当前分支（`git branch -v` 也能看）。

### 4.2 看所有分支

```bash
git branch -v
```

```
* feat/tool-least-privilege      a669542 docs: 工具最小权限...
  feat/responsibility-separation f62f85c refactor: 实现职责分离...
  master                         4d30e14 feat: 在 writer prompt 中...
```

`*` = 当前所在。

### 4.3 切换分支

```bash
git checkout feat/responsibility-separation
```

成功输出：`Switched to branch 'feat/responsibility-separation'`

> 如果**报错说工作区有未提交的改动**，先看 §7 坑 4。

### 4.4 编译

```bash
npm run build
```

- **没有任何输出 = 成功**
- 有 `error TS...` = 失败，源码有问题，需先修

### 4.5 重启 pi

在 t3 那个终端里：

```
Ctrl+C  或  Ctrl+D     退出 pi
pi                     重新启动
```

不重启的话，pi 仍在用启动时加载的旧扩展。

---

## 5. 验证：我现在跑的到底是哪一版？

这是最有用的技能。用"特征字符串"辨认：

```bash
cd /home/water/Projects/confidenceWriter

grep -c "写完就结束" dist/writing/task-executor.js
```

| 输出 | 说明 |
|------|------|
| `2` | dist 是 `feat/responsibility-separation` 编译的 |
| `0` | dist 是 `master`（或更早）编译的 |

还有其他标记可用：

| 命令 | 含义 |
|------|------|
| `grep -c "素材文件位置" dist/writing/task-executor.js` | `1` = 含素材路径说明（master 起） |
| `grep -c "TOOLS_BY_ROLE" dist/scheduler/pi-executor.js` | `>0` = 工具最小权限已实现 |
| `grep -c "budget exhausted" dist/scheduler/pi-executor.js` | `>0` = turn 预算已实现 |

### 另一个检查：是否忘了 build

比较源码与产物的修改时间：

```bash
cd /home/water/Projects/confidenceWriter
echo "源码: $(stat -c %y src/writing/task-executor.ts)"
echo "产物: $(stat -c %y dist/writing/task-executor.js)"
```

**产物时间早于源码时间 = 你忘了 build。**

> `stat -c %y` 是 GNU/Linux 写法。macOS 用 `stat -f "%Sm" <文件>`；Windows Git Bash 同上可用。

---

## 6. 标准流程（五步）

以"切换到 `feat/responsibility-separation` 并测试"为例：

```bash
# ① 进项目目录
cd /home/water/Projects/confidenceWriter

# ② 确认工作区干净（无未提交改动）
git status --short
#    无输出 = 干净，可以继续

# ③ 切分支
git checkout feat/responsibility-separation
#    看到 "Switched to branch ..." = 成功

# ④ 编译
npm run build
#    无输出 = 成功

# ⑤ 验证
grep -c "写完就结束" dist/writing/task-executor.js
#    输出 2 = 正确
```

然后去 t3：退出 pi → 重新 `pi` → 运行命令。

---

## 7. 五个常见的坑

### 坑 1：忘了 build（最常见）

**症状**：切了分支，改了 prompt，跑起来毫无变化。
**原因**：`dist/` 没更新。
**检查**：§5 的标记法。
**解法**：`npm run build`。

### 坑 2：在有测试运行时 build

**症状**：正在跑的测试结果变得无法解释。
**原因**：build 会覆盖 `dist/`，而正在运行的 pi 会话可能为每个子任务重新加载扩展。
**解法**：**测试运行期间不要 build**。等任务结束，或先停掉。
（注意：切分支本身是安全的，因为 `dist/` 不被 git 跟踪。危险的是 build。）

### 坑 3：build 了但没重启 pi

**症状**：build 成功，但行为还是旧的。
**原因**：pi 在启动时加载扩展，之后不会自动重载。
**解法**：`Ctrl+C` 退出 → 重新 `pi`。

### 坑 4：切分支时工作区有未提交改动

**症状**：

```
error: Your local changes to the following files would be overwritten by checkout
```

**原因**：你在 A 分支改了文件但没提交，git 不敢覆盖。
**两个选择**：

```bash
# 选择 A：这些改动我不要了（丢弃）
git checkout -- .

# 选择 B：这些改动我要保留（提交到当前分支）
git add -A
git commit -m "wip: 暂存"
```

处理完再切分支。

### 坑 5：以为"切了分支 = 换了行为"

**症状**：以为问题已经修好/复现，其实只是源码目录变了，运行时行为没变。
**解法**：永远用 §5 的标记法确认**运行时**版本，而不是凭"我切过分支了"。

---

## 8. 文档与多分支：怎么改才不会冲突

### 8.1 先搞清一个事实

git **不会**因为「两边都有这个文件」就报冲突。
冲突的条件是：**两边都改动了同一文件的同一区域**（相对于共同祖先）。

用本项目实际例子说明：

| 分支 | 有 `TODO.md` 吗 | 合并到 `fix/diagram-and-export` |
|---|---|---|
| `feat/ch-level-length` | 有（同一个 blob） | 快进合并，**不冲突** |
| `feat/tool-least-privilege` | 有（旧版 7 KB） | 它是祖先，**不冲突** |
| `feat/responsibility-separation` | 没有 | 只有一边「新增」→ **不冲突** |

所以现在很安全。但若**两个分支都从「已有 TODO.md」的基点各自改它**，
下次合并就会冲突。

### 8.2 约定：文档按「新增」而非「修改」组织

| 文档类型 | 放哪 | 为什么 |
|---|---|---|
| 迭代计划/完成报告（`ITERATION-PLAN-vX.md`） | 分支内**新增**，文件名带版本号 | 各分支只新增自己的文件 → 永不冲突（已见效） |
| 专项方案（`PLAN-<feature>.md`） | 同上 | 同上 |
| `BUGS.md` | 跟着**修复分支**走 | 它是「这一轮修了什么」，随分支合并 |
| `TODO.md` | 只在**主干线**改 | 它是「当前状态摘要」，不是历史 → 合并时选一边即可 |
| `GIT-GUIDE.md` | 只在 `master` 改 | 与具体功能无关的通用文档 |

**一句话：历史性内容各写各的文件，状态性内容只在主干改。**

### 8.3 真的冲突了怎么办

状态型文档（`TODO.md`）冲突后**不要手工编辑**，直接选一边：

```bash
# 看两边差异（可选）
git diff --name-only --diff-filter=U     # 列出所有冲突文件

# 保留当前分支的版本
git checkout --ours TODO.md

# 或保留传入分支的版本
git checkout --theirs TODO.md

# 标记为已解决并提交
git add TODO.md
git commit -m "merge: 解决 TODO.md 冲突（取当前分支版本）"
```

> ⚠️ `--ours` / `--theirs` 的含义容易搞反：
> `--ours` = **你当前所在**的分支；`--theirs` = **被合并进来**的那个分支。

> ❌ 不推荐 `.gitattributes` 的 `merge=union`：
> 它会把两个版本直接拼接，产生重复段落，比冲突更难清理。

### 8.4 怎么提前知道会不会冲突

```bash
# 合之前先干跑一次（不真合并，只报告）
git merge --no-commit --no-ff <分支名>
git merge --abort        # 看完就取消

# 或者看两个分支分叉后都改了哪些文件
git diff --name-only $(git merge-base A B) A > /tmp/a.txt
git diff --name-only $(git merge-base A B) B > /tmp/b.txt
comm -12 <(sort /tmp/a.txt) <(sort /tmp/b.txt)   # 两边都改过的文件 = 可能冲突
```

---

## 9. 撤销与回退

```bash
# 丢弃某个文件的所有未提交改动
git checkout -- src/writing/task-executor.ts

# 丢弃全部未提交改动（危险，不可恢复）
git checkout -- .

# 看某分支上某文件的内容（不切换分支）
git show feat/responsibility-separation:src/writing/task-executor.ts

# 看最近提交历史
git log --oneline -10

# 看某分支比 master 多了哪些提交
git log --oneline master..feat/responsibility-separation
```

---

## 10. 速查表

| 我想… | 命令 |
|-------|------|
| 看当前分支 | `git branch --show-current` |
| 看所有分支 | `git branch -v` |
| 切到 X 分支 | `git checkout X` |
| 编译 | `npm run build` |
| 确认跑的哪版 | `grep -c "写完就结束" dist/writing/task-executor.js` |
| 确认是否忘 build | 比较 `src/` 与 `dist/` 的 `stat -c %y` 时间 |
| 看工作区是否干净 | `git status --short` |
| 丢弃未提交改动 | `git checkout -- .` |
| 看历史 | `git log --oneline -10` |

---

## 11. 需要我代劳时

你只需要说清楚两件事，我可以帮你执行：

1. **切到哪个分支**
2. **是否要 build**

例如：「切到 master 并 build」「切到 responsibility-separation，先别 build」。

**但有一个限制**：如果 t3 的任务正在运行，请先告诉我它停了没有——否则我不会执行 build（避免坑 2）。
