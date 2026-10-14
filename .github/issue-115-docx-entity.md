## 缺陷描述

DOCX 转 Markdown 时，HTML 实体未被解码，导致特殊字符显示为转义形式。

## 复现步骤

1. 准备一个包含 `<` 和 `>` 字符的 DOCX 文件（如 `NFR-001：系统响应时间 < 2秒`）
2. 运行 `/confwrite:organize` 或 `/confwrite:outline`（会触发 DOCX 转换）
3. 查看输出的 Markdown 文件

## 实际结果

```
NFR-001：系统响应时间 &lt; 2秒（95%请求）
```

## 期望结果

```
NFR-001：系统响应时间 < 2秒（95%请求）
```

## 根因

`src/organize/converter.ts` 的 `htmlToMarkdown()` 方法没有处理 HTML 实体解码。

mammoth 将 DOCX → HTML 时，`<` 被转义为 `&lt;`，`>` 被转义为 `&gt;`，但 `htmlToMarkdown` 只做标签移除，没有反转义实体。

## 影响范围

- 所有通过 DOCX 导入的需求文档中包含 `<`、`>`、`&` 等特殊字符的内容
- 影响 Phase 1 需求提取（OutlineGenerator 读取转换后的 MD）
- 影响素材整理（FormatConverter 转换 DOCX）

## 修复方案

在 `htmlToMarkdown()` 末尾添加 HTML 实体解码：

```typescript
// HTML 实体解码
md = md.replace(/&lt;/g, '<');
md = md.replace(/&gt;/g, '>');
md = md.replace(/&amp;/g, '&');
md = md.replace(/&quot;/g, '"');
md = md.replace(/&#39;/g, "'");
md = md.replace(/&ge;/g, '≥');
md = md.replace(/&le;/g, '≤');
md = md.replace(/&nbsp;/g, ' ');
```

## 验收标准

- DOCX 中的 `<` 在转换后正确显示为 `<`
- DOCX 中的 `>` 在转换后正确显示为 `>`
- DOCX 中的 `≥` 在转换后正确显示为 `≥`
- 不影响正常 Markdown 内容

## E2E 证据

smoke-test 数据集，`inputs/requirements.docx` 转换后：
- `NFR-001：系统响应时间 &lt; 2秒` ← 错误
- `AC-003：用户验收测试通过率 ≥ 95%` ← ≥ 正常（mammoth 可能直接输出 Unicode）
