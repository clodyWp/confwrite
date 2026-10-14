## 问题

Issue #96: 字数截断方案导致恶性循环

**根因分析**：
1. 硬性截断破坏内容结构（truncateContent() 按字符位置截断，可能截掉整个 section）
2. 截断后无标记传递给下游（Reviewer 不知道内容被截断）
3. Fixer 无历史字数约束（只看到"补全缺失"，不知道之前因截断导致的问题）
4. 超标容忍度阶梯缺失（只有 >20% 截断和 ≤20% 报错两种处理）

**恶性循环**：
```
Writer 产出 12000 字（上限 8000）
  → OutputValidator 硬性截断至 ~7600 字（丢失 Section 1.5 等内容）
  → Reviewer 发现内容缺失/不完整，verdict = revise
  → Fixer 尝试补全缺失内容 + 保留原有内容 → 产出 14500 字（+82% 超标）
  → OutputValidator 再次截断 → 再次丢失内容
  → 循环重复，直到 maxRounds 耗尽
```

## 解决方案

### 核心变更

1. **删除硬性截断**（SM-WC-1）
   - 移除 `truncateContent()` 方法
   - 验证器不再修改文件内容

2. **渐进式超标响应**（SM-WC-2）
   - 新增 `classifyOverage()` 方法
   - 超标 0%~15%: mild（警告，不影响验证）
   - 超标 15%~30%: moderate（标记 wordCountWarning）
   - 超标 30%~50%: severe（标记 wordCountError）
   - 超标 >50%: critical（标记 wordCountCritical）

3. **内容完整性保护**（SM-WC-6）
   - 新增 `checkStructuralIntegrity()` 方法
   - 检测空 section（标题下无内容或内容 < 50 字）
   - 检测截断标记（`<!-- 内容已截断 -->`）

4. **循环收敛守护**（SM-WC-5）
   - 新增 `isConverging()` 方法
   - 检测字数是否收敛（更接近目标范围）
   - 连续 2 轮不收敛时触发干预

5. **字数不足响应**（SM-WC-7）
   - 新增 `classifyWordCount()` 方法
   - 统一字数状态分类（within/mild_over/moderate_over/.../mild_under/...）

### Spec 文件

新增 `specs/word-count-control.md`，定义 10 条不变量（SM-WC-1 到 SM-WC-10）：
- SM-WC-1: 禁止硬性截断
- SM-WC-2: 渐进式超标响应
- SM-WC-3: 字数检查信息传递给 Reviewer
- SM-WC-4: Fixer 字数收敛约束
- SM-WC-5: 循环收敛守护
- SM-WC-6: 内容完整性保护
- SM-WC-7: 字数不足响应
- SM-WC-8: 降级接受条件
- SM-WC-9: 字数统计一致性
- SM-WC-10: 超标日志可追溯

## 测试覆盖

新增 `tests/writing/word-count-control.test.ts`，包含 13 个测试用例：
- TC-WC-1: 验证器不修改文件内容（SM-WC-1）
- TC-WC-2~6: 渐进式超标响应（SM-WC-2）
- TC-WC-7~8: 内容完整性保护（SM-WC-6）
- TC-WC-9~10: 循环收敛守护（SM-WC-5）
- TC-WC-14~15: 字数不足响应（SM-WC-7）
- TC-WC-16: 字数统计一致性（SM-WC-9）

删除旧的 `tests/writing/word-count-truncation.test.ts`（截断功能已移除）。

**测试结果**：
- ✅ 1425 tests passed
- ✅ 32 tests skipped
- ✅ 0 tests failed

## 后续工作

本 PR 实现了 Phase 1（核心变更）。后续需要实现：
- Phase 2: 信息传递（SM-WC-3, SM-WC-4）— 更新 Reviewer/Fixer prompt
- Phase 3: 降级接受（SM-WC-8）— 修改 orchestrator 逻辑
- Phase 4: 日志可追溯（SM-WC-10）— 集成 EventBus

Closes #96
