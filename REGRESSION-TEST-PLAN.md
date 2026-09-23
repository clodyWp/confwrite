# 全量全流程回归测试执行计划（本地版）

## 测试环境
- **本地目录**: /home/water/Projects/t3
- **ConfWrite 包**: ../../confidenceWriter (已配置)
- **测试项目**: LmERP2-regression
- **数据来源**: 本地 t3/projects/LmERP2 的数据

## 执行阶段

### Phase 0: 环境准备
- [x] 0.1 确认 t3/.pi/settings.json 配置正确
- [x] 0.2 清理旧项目 (LmERP2-test, LmERP2-test2)
- [x] 0.3 创建新项目目录 LmERP2-regression

### Phase 0a: 项目初始化
- [x] 0a.1 启动本地 pi (在 /home/water/Projects/t3 目录)
- [x] 0a.2 发送 /confwrite:init LmERP2-regression
- [x] 0a.3 验证 project-state.json 创建成功
- [x] 0a.4 验证 currentPhase = "0a", status = "init"

### Phase 0b: 素材整理
- [x] 0b.1 同步 outline.md 到项目目录
- [x] 0b.2 同步 reference_material/ 到项目目录
- [x] 0b.3 发送 /confwrite:organize
- [x] 0b.4 验证素材索引生成
- [x] 0b.5 验证 currentPhase = "0b"

### Phase 1-2: 需求分析与大纲规划
- [x] 1.1 验证大纲解析成功
- [x] 1.2 验证章节同步到 project-state.json
- [x] 1.3 验证 currentPhase = "2"

### Phase 3: 素材准备
- [x] 3.1 验证 chapter-kits 生成
- [x] 3.2 验证每个章节的素材包完整
- [x] 3.3 验证 currentPhase = "3"

### Phase 4a: 写作阶段
- [x] 4a.1 验证 writer subagent 启动
- [x] 4a.2 监控 ch001 写作完成
- [x] 4a.3 监控 ch002 写作完成
- [x] 4a.4 监控 ch003 写作完成
- [x] 4a.5 监控 ch004 写作完成
- [x] 4a.6 监控 ch005 写作完成
- [x] 4a.7 监控 ch006 写作完成
- [x] 4a.8 监控 ch007 写作完成
- [x] 4a.9 监控 ch008 写作完成
- [x] 4a.10 验证所有草稿文件生成
- [x] 4a.11 验证 project-state.json 状态更新
- [x] 4a.12 验证 currentPhase = "4a" → "4b"

### Phase 4b-4d: 审阅与修复循环
- [x] 4b.1 验证 reviewer subagent 启动
- [x] 4b.2 监控审阅意见生成
- [x] 4c.1 验证决策逻辑 (accept/revise/reject)
- [x] 4d.1 如有需要，验证 fixer subagent 启动
- [x] 4d.2 验证修复后的草稿更新
- [x] 4d.3 验证所有章节状态 = "completed"

### Phase 5: 图表处理
- [x] 5.1 验证 mermaid 代码块提取
- [x] 5.2 验证 SVG 生成
- [x] 5.3 验证 PNG 转换
- [x] 5.4 验证图表注入到草稿
- [x] 5.5 验证 currentPhase = "5" → "6"

### Phase 6: 组装
- [x] 6.1 验证 merged-v1.md 生成
- [x] 6.2 验证章节顺序正确
- [x] 6.3 验证图表引用正确
- [x] 6.4 验证 currentPhase = "6" → "7"

### Phase 7: 定稿
- [x] 7.1 验证 final.md 生成
- [x] 7.2 验证文档统计信息
- [x] 7.3 验证 currentPhase = "7" → "8"

### Phase 8: 导出
- [x] 8.1 验证 final.docx 生成
- [x] 8.2 验证文件大小合理 (>100KB)
- [x] 8.3 验证图表嵌入成功
- [x] 8.4 验证 currentPhase = "done"

## 监控策略
- 每个阶段完成后检查 project-state.json
- 关键节点下载产物验证质量
- 遇到错误立即停止并诊断

## 审核策略
- Phase 2 (大纲规划): 自动确认通过
- Phase 4b (审阅): 自动确认通过
- Phase 7 (定稿): 自动确认通过

## 预期产物
- project-state.json (完整状态)
- drafts/chapters/ch001-v1.md ~ ch008-v1.md (8章草稿)
- figures/*.png (图表文件)
- assembly/merged-v1.md (合并稿)
- output/final.md (最终 Markdown)
- output/final.docx (最终 Word 文档)

## 成功标准
- 所有 8 章内容完整
- 图表正确生成并嵌入
- Word 文档可正常打开
- 文件大小 > 100KB
- 无严重错误日志
