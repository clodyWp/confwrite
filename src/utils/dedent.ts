/**
 * 去掉整段文本的公共缩进
 *
 * 为什么需要它
 * ------------
 * 写手经常把 diagram 块当成示例那样**缩进**书写（提示词里的示例本身
 * 就缩进了 4 格）。而 diagram 块的解析是**行首敏感**的：
 *   · `hasStructuredFormat` 用 `^(containers|nodes|edges):` 匹配顶层键
 *   · `parseDiagramBlock` 用 `!/^\s/` 判断"是否顶层键"
 * 一旦整块缩进，这两处全部失配 —— 实测后果是**解析出 0 个节点、
 * description 为空**，也就是这一章凭空少一张图，而且悄无声息。
 *
 * 只去掉**公共**缩进，块标量（`description: |`）内部的相对缩进原样保留，
 * 所以段落结构不会被破坏。
 */
export function dedent(text: string): string {
  const lines = text.split('\n');

  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)![0].length;
    if (indent < min) min = indent;
  }

  if (!Number.isFinite(min) || min === 0) return text;

  return lines.map(line => (line.trim() === '' ? line : line.slice(min))).join('\n');
}
