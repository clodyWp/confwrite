# Spec: HTML 实体解码

> **版本**: 1.0
> **日期**: 2026-10-16
> **源码**: `src/organize/converter.ts`
> **关联 Issue**: #115
> **状态**: 有效

---

## 1. 问题背景

mammoth 将 DOCX 转换为 HTML 时生成标准 HTML 实体。
`htmlToMarkdown()` 只去除标签不解码实体，导致 Markdown 输出包含原始实体。

---

## 2. 行为规格

### HE-1: HTML 实体解码

**前置条件**: mammoth 将 DOCX 转换为 HTML
**不变量**: `htmlToMarkdown()` 必须解码以下 HTML 实体:

| 实体 | 解码为 |
|------|--------|
| `&amp;` | `&` |
| `&lt;` | `<` |
| `&gt;` | `>` |
| `&quot;` | `"` |
| `&#039;` | `'` |
| `&nbsp;` | ` ` (空格) |
| `&#NNN;` | 对应 Unicode 字符 |
| `&#xHHH;` | 对应 Unicode 字符 |

**后置条件**: Markdown 输出不包含 HTML 实体。
**验证方式**: 单元测试覆盖所有实体类型。

注意：`&amp;` 必须最先替换，避免双重解码。
