/**
 * HeadingTreeBuilder — 需求文档标题层级树构建器
 *
 * 将 Markdown 格式的需求文档解析为层级树结构，
 * 每个节点记录标题、层级、字数统计。
 *
 * 用于 Wave 3 的大纲智能展开：根据标题层级和字数估算，
 * 决定哪些节点需要展开为独立章节。
 */

export interface HeadingNode {
  /** 标题层级 (1-6) */
  level: number;
  /** 清理后的标题文本（不含编号前缀） */
  title: string;
  /** 原始编号（如 "2.1.1"） */
  number?: string;
  /** 该节点下的字符数（包含所有子节点的内容） */
  charCount: number;
  /** 该节点自身的内容字符数（不含子节点） */
  ownCharCount: number;
  /** 子节点 */
  children: HeadingNode[];
  /** 父节点 */
  parent?: HeadingNode;
}

export class HeadingTreeBuilder {
  /**
   * 将 Markdown 内容解析为标题层级树
   */
  build(content: string): HeadingNode {
    if (!content.trim()) {
      return this.createNode(0, '', undefined);
    }

    const lines = content.split('\n');
    const root = this.createNode(0, 'root', undefined);
    const stack: HeadingNode[] = [root];
    let currentContent: string[] = [];

    const flushContent = () => {
      if (currentContent.length > 0 && stack.length > 0) {
        const text = currentContent.join('\n').trim();
        const top = stack[stack.length - 1];
        top.ownCharCount += this.countChineseChars(text);
        currentContent = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        currentContent.push('');
        continue;
      }

      // 检测标题
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        flushContent();

        const level = headingMatch[1].length;
        const rawTitle = headingMatch[2].trim();

        // 提取编号
        const numberMatch = rawTitle.match(/^(\d+(?:\.\d+)*)/);
        const number = numberMatch ? numberMatch[1] : undefined;

        // 清理标题
        let cleanTitle = rawTitle;
        if (number) {
          cleanTitle = rawTitle.slice(number.length).replace(/^[\.\s]+/, '').trim();
          if (!cleanTitle) cleanTitle = rawTitle;
        }

        const node = this.createNode(level, cleanTitle, number);

        // 找到合适的父节点
        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        const parent = stack[stack.length - 1];
        node.parent = parent;
        parent.children.push(node);
        stack.push(node);
        continue;
      }

      currentContent.push(trimmed);
    }

    flushContent();

    // 递归计算每个节点的总字数（包含子节点）
    this.calculateTotalCharCount(root);

    return root;
  }

  /**
   * 创建节点
   */
  private createNode(level: number, title: string, number?: string): HeadingNode {
    return {
      level,
      title,
      number,
      charCount: 0,
      ownCharCount: 0,
      children: [],
    };
  }

  /**
   * 递归计算每个节点的总字数（自身 + 所有子节点）
   */
  private calculateTotalCharCount(node: HeadingNode): number {
    let total = node.ownCharCount;
    for (const child of node.children) {
      total += this.calculateTotalCharCount(child);
    }
    node.charCount = total;
    return total;
  }

  /**
   * 统计中文字符数（包括中文标点）
   * 英文单词按 1 个字符计算
   */
  private countChineseChars(text: string): number {
    if (!text) return 0;

    // 移除空白
    const cleaned = text.replace(/\s+/g, '');

    // 统计中文字符（包括中文标点）
    const chineseChars = cleaned.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g);
    const chineseCount = chineseChars ? chineseChars.length : 0;

    // 统计非中文字符（英文、数字等）
    const nonChinese = cleaned.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '');
    // 英文单词按单词计算（连续字母算一个）
    const words = nonChinese.match(/[a-zA-Z0-9]+/g);
    const wordCount = words ? words.length : 0;

    return chineseCount + wordCount;
  }
}
