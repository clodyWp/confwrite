# Open Issue 修复计划

**创建时间**: 2026-10-12  
**最后更新**: 2026-10-12（新增 #36）  
**状态**: 待执行

## 当前 Open Issue 概览

| Issue | 标题 | 严重程度 | 优先级 | 预估工时 |
|-------|------|---------|--------|---------|
| #33 | Phase 1 状态转换绕过状态机 | P1 严重 | 🔴 最高 | 2h |
| #34 | Phase 1 不生成 requirements.json | P2 警告 | 🟡 高 | 3h |
| #35 | 组装后章节数与大纲不一致 | P2 警告 | 🟡 中 | 4h |
| #36 | store.ts 使用模板字符串拼接路径 | P2 警告 | 🟢 低 | 0.5h |
| #25 | Enforce PR evidence and Node compatibility gates | Feature | 🔵 最低 | 8h |

---

## 修复计划

### 阶段 1: 修复根本问题 (#33)

**目标**: 修复 Phase 1 状态转换绕过状态机的问题

**修复方案**:
1. 移除 `src/orchestrator/phase1.ts` 第 63-69 行的直接状态修改代码
2. 让状态机的 exit condition 来处理 Phase 1 → Phase 2 的转换
3. 添加单元测试验证状态机转换逻辑

**代码变更**:
```typescript
// src/orchestrator/phase1.ts - 删除以下代码
// const state = this.store.load();
// if (state) {
//   state.currentPhase = '2';  // ❌ 直接修改 phase
//   state.lastUpdated = new Date().toISOString();
//   this.store.save(state);
// }
```

**验证方法**:
- 单元测试：验证 Phase 1 execute() 不修改 state.currentPhase
- 集成测试：验证状态机正确执行 exit condition 检查

**预估工时**: 2 小时

---

### 阶段 2: 验证并修复 #34

**目标**: 验证 Phase 1 是否正确生成 requirements.json

**步骤**:
1. 修复 #33 后，执行 E2E 测试验证 Phase 1 行为
2. 检查 `assets/requirements.json` 是否正确生成
3. 如果问题仍然存在，调查 `RequirementExtractor` 的实现

**可能原因**:
- `allRequirements` 为空数组（RequirementExtractor 未提取到需求）
- 路径拼接错误
- 文件写入权限问题

**验证方法**:
```bash
# 检查文件是否存在
ls -la assets/requirements.json

# 检查文件内容
cat assets/requirements.json | jq 'length'
```

**预估工时**: 3 小时（包括调查和修复）

**依赖**: 阶段 1 完成

---

### 阶段 3: 修复 #35

**目标**: 修复组装后章节数与大纲不一致的问题

**步骤**:
1. 执行 E2E 测试复现问题
2. 检查 `outline.md` 和 `output/final.md` 的标题数量
3. 调查 `src/assemble/assembler.ts` 和 `src/assemble/finalizer.ts` 的逻辑
4. 确定是组装逻辑问题还是 Writer 生成了多余的标题

**可能原因**:
- 文档标题被算作章节
- Writer 在某个章节中额外添加了二级标题
- 组装器的章节计数逻辑与大纲解析不一致

**验证方法**:
```bash
# 检查大纲章节数
grep -c "^ch[0-9]" outline.md

# 检查文档二级标题数
grep -c "^## " output/final.md

# 检查 finalization.json
cat output/finalization.json | jq '.stats.level2Headings'
```

**预估工时**: 4 小时（包括调查和修复）

**依赖**: 无（可独立进行）

---

### 阶段 4: 修复 #36

**目标**: 修复 store.ts 中的路径拼接问题

**修复方案**:
```typescript
// src/state/store.ts:16
// ❌ 当前
this.statePath = `${projectDir}/project-state.json`;

// ✅ 修复
import { join } from 'node:path';
this.statePath = join(projectDir, 'project-state.json');
```

**验证方法**:
- 单元测试：验证 statePath 使用正确的路径分隔符
- 在 Windows 和 Linux 上分别运行测试

**预估工时**: 0.5 小时

**依赖**: 无（可独立进行）

---

### 阶段 5: 功能增强 #25

**目标**: 实现 PR evidence 和 Node compatibility gates

**说明**: 这是一个功能增强，不是 bug 修复。优先级最低，可以在所有 bug 修复完成后进行。

**预估工时**: 8 小时

**依赖**: 无

---

## 执行顺序

```
阶段 1 (#33) ──→ 阶段 2 (#34)
                  ↓
              阶段 3 (#35)  ←── 可与阶段 2 并行
              阶段 4 (#36)  ←── 可独立进行
                  ↓
              阶段 5 (#25)
```

**总预估工时**: 17.5 小时

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| #33 修复后引入新问题 | 高 | 添加充分的单元测试和集成测试 |
| #34 根因不在 Phase 1 | 中 | 先验证 #33 修复效果，再决定是否深入调查 |
| #35 需要大量重构 | 中 | 先调查清楚根因，再决定修复方案 |
| #36 修复影响状态持久化 | 低 | 改动极小，仅路径拼接方式变更 |

---

## 验收标准

### #33 验收标准
- [ ] Phase 1 execute() 不修改 state.currentPhase
- [ ] 状态机正确执行 exit condition 检查
- [ ] 单元测试通过
- [ ] 集成测试通过

### #34 验收标准
- [ ] Phase 1 执行后 `assets/requirements.json` 存在
- [ ] 文件内容包含提取的需求列表
- [ ] `/confwrite:outline` 命令可以正常执行

### #35 验收标准
- [ ] 组装后章节数与大纲一致
- [ ] finalization.json 中的 level2Headings 与大纲章节数匹配
- [ ] E2E 测试通过

### #36 验收标准
- [ ] `src/state/store.ts` 使用 `path.join()` 拼接路径
- [ ] Windows 和 Linux 上测试通过
- [ ] 无混合分隔符路径

---

## 下一步行动

1. **立即执行**: 阶段 1 (#33)
2. **可并行**: 阶段 3 (#35) 和阶段 4 (#36) 可以独立进行
3. **等待**: 阶段 2 (#34) 需要等阶段 1 完成
4. **最后**: 阶段 5 (#25) 在所有 bug 修复后进行

---

## 备注

- 所有修复都需要遵循 AGENTS.md 中的开发规范
- 修复后需要执行 `npm run build && npm test`
- 修复完成后需要更新 CHANGELOG.md
- 每个阶段完成后需要创建 PR 并关联对应的 issue
