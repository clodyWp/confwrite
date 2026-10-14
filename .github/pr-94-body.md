## Summary

Issue #94: 变更影响分析工具

### Changes
- 新增 `scripts/impact-analysis.js` — 影响分析脚本
- 新增 `scripts/impact-analysis-config.json` — 映射配置文件
- 新增 `tests/scripts/impact-analysis.test.ts`（19 tests）
- 新增 spec `specs/impact-analysis.md`

### Features

**影响分析算法**：
1. **镜像映射** (IA-1~4): `src/<module>/<file>.ts` → `tests/<module>/<file>*.test.ts`
2. **跨模块依赖** (IA-5~6): 显式声明的跨模块测试关联
3. **全局测试** (IA-7~8): 任何 src/ 改动时运行的全局回归测试
4. **确定性** (IA-9~12): 相同输入产生相同、去重、排序的输出

**用法**：
```bash
# 分析指定文件
node scripts/impact-analysis.js src/scheduler/runner.ts

# 详细模式
node scripts/impact-analysis.js --verbose src/state/store.ts

# 多个文件
node scripts/impact-analysis.js src/writing/orchestrator.ts src/state/store.ts
```

### Spec Coverage
- IA-1~4: 镜像映射规则
- IA-5~6: 跨模块依赖
- IA-7~8: 全局测试
- IA-9~12: 算法不变量（确定性、幂等性、过滤、排序）
- IA-15~17: 配置文件规范
- IA-18~19: 错误处理

Closes #94
