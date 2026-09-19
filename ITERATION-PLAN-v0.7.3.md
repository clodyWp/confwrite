# ConfWrite v0.7.3 迭代计划

## 迭代目标
优化 LLM 执行效率，减少无效工具调用，提升写作速度

---

## 问题分析与解决方案

### 问题 1：素材包缺少文件路径信息

**问题描述**：
- 素材包的"相关文件"部分只包含文件名，不包含路径
- LLM 看到文件名后不知道去哪里读取，盲目尝试各种路径
- 日志显示 87% 的工具调用失败（47/54 次失败）

**日志证据**：
```
Tool #10: read started
Tool #10: read ended (error)
Turn #8 tool result: read (error - [{"type":"text","text":"ENOENT: no such file or directory, access '/home/water/Projects/t3/projects/LmERP2/docs/招标技术要求.md'"}])

Turn #8 tool result: read (error - [{"type":"text","text":"ENOENT: no such file or directory, access '/home/water/Projects/t3/projects/LmERP2/references/招标技术要求.md'"}])

Turn #8 tool result: read (error - [{"type":"text","text":"ENOENT: no such file or directory, access '/home/water/Projects/t3/projects/LmERP2/.confwrite-tasks/ch009-materials.md'"}])
```

**解决方案**：
在 `kit-generator.ts` 中，素材包的"相关文件"部分添加 `relativePath` 字段

**修改位置**：
- 文件：`src/organize/kit-generator.ts`
- 方法：`generate()`
- 行号：约 60 行

**修改内容**：
```typescript
// 当前代码
lines.push(`- **${file.filename}** (${file.category})`);
if (file.summary) {
  lines.push(`  - 摘要: ${file.summary.slice(0, 100)}...`);
}

// 修改后
lines.push(`- **${file.filename}** (${file.category})`);
if (file.relativePath) {
  lines.push(`  - 路径: ${file.relativePath}`);
}
if (file.summary) {
  lines.push(`  - 摘要: ${file.summary.slice(0, 100)}...`);
}
```

**预期效果**：
- LLM 第一次就能正确读取文件
- 减少 80%+ 的无效文件读取尝试
- 每个章节任务节省 3-5 分钟

---

### 问题 2：跨平台工具调用问题

**问题描述**：
- `DEFAULT_TOOLS` 硬编码了 `powershell`
- 在 Linux 上调用 `powershell` 会失败
- 日志显示多次 powershell 调用失败

**日志证据**：
```
Tool #2: powershell started
Tool #3: powershell started
Tool #3: powershell ended (error)
Tool #3: powershell ended (error)
```

**解决方案**：
根据操作系统动态选择 shell 工具
- Windows → `powershell`
- Linux/macOS → `bash`

**修改位置**：
- 文件：`src/scheduler/pi-executor.ts`
- 行号：约 32 行

**修改内容**：
```typescript
// 当前代码
const DEFAULT_TOOLS = ['read', 'write', 'edit', 'powershell'];

// 修改后
import { platform } from 'node:os';

const DEFAULT_TOOLS = ['read', 'write', 'edit', platform() === 'win32' ? 'powershell' : 'bash'];
```

**设计决策**：
- 根据平台判断而非统一用 bash，避免 Windows 上路径转义问题
- PowerShell 在 Windows 上是原生 shell，路径格式正确
- Bash 在 Linux/macOS 上是标准 shell，pi 本身依赖 bash

**预期效果**：
- 消除跨平台工具调用失败
- 减少约 5% 的无效工具调用

---

## 详细实施计划

### 阶段 1：代码修改（预计 30 分钟）

#### 1.1 修改素材包生成逻辑
- [ ] 修改 `src/organize/kit-generator.ts`
- [ ] 在"相关文件"部分添加路径信息
- [ ] 编译验证

#### 1.2 修改工具配置
- [ ] 修改 `src/scheduler/pi-executor.ts`
- [ ] 添加平台判断逻辑
- [ ] 编译验证

### 阶段 2：测试验证（预计 1 小时）

#### 2.1 重新生成素材包
- [ ] 在测试项目中运行 `/confwrite:organize`
- [ ] 检查素材包是否包含路径信息

#### 2.2 运行写作任务
- [ ] 运行 `/confwrite:write`
- [ ] 监控日志，验证：
  - 文件读取成功率提升
  - 无 powershell 调用失败（Linux 环境）
  - 任务执行时间减少

#### 2.3 性能对比
- [ ] 记录修改前后的指标：
  - 工具调用总数
  - 失败次数
  - 单章节平均耗时
  - 整体写作速度

### 阶段 3：发布（预计 15 分钟）

#### 3.1 版本更新
- [ ] 更新 `package.json` 版本号：`0.7.2` → `0.7.3`
- [ ] 更新 `CHANGELOG.md`
- [ ] 提交代码

#### 3.2 文档更新
- [ ] 更新 `README.md` 中的功能说明
- [ ] 记录性能优化效果

---

## 预期收益

### 性能提升
- **工具调用成功率**：从 13% 提升到 90%+
- **单章节耗时**：从 6-10 分钟减少到 3-5 分钟
- **整体写作速度**：提升 40-60%

### 用户体验
- 减少无效等待时间
- 降低 API 调用成本
- 提升写作质量（LLM 有更多时间专注于内容生成）

---

## 风险评估

### 低风险
- 修改范围小，只涉及 2 个文件
- 逻辑简单，不涉及核心状态机
- 向后兼容，不影响现有项目

### 缓解措施
- 修改前先备份代码
- 在测试项目上验证后再应用到生产项目
- 保留回滚能力

---

## 验收标准

1. **功能验收**
   - [ ] 素材包包含文件路径信息
   - [ ] Linux 上无 powershell 调用
   - [ ] Windows 上使用 powershell

2. **性能验收**
   - [ ] 工具调用失败率 < 10%
   - [ ] 单章节平均耗时 < 5 分钟
   - [ ] 整体写作速度提升 > 40%

3. **兼容性验收**
   - [ ] 现有项目可正常运行
   - [ ] 新旧素材包格式兼容

---

## 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段 1 | 代码修改 | 30 分钟 |
| 阶段 2 | 测试验证 | 1 小时 |
| 阶段 3 | 发布 | 15 分钟 |
| **总计** | | **1 小时 45 分钟** |

---

## 待批准

请批准后开始实施。

**批准状态**：⏳ 待批准

**批准人**：__________

**批准时间**：__________
