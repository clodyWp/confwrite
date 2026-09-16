/**
 * OutlineParser - 大纲解析器
 * 
 * 解析 Markdown 格式的大纲文件，提取章节结构和 ch- 标记
 */

export class OutlineNode {
  level: number;
  title: string;
  number?: string;
  id?: string;
  spawnLevel?: boolean;
  parent?: OutlineNode;
  children: OutlineNode[];

  constructor(level: number, title: string) {
    this.level = level;
    this.title = title;
    this.children = [];
  }

  /**
   * 递归查找指定 ID 的章节
   */
  findChapter(id: string): OutlineNode | undefined {
    if (this.id === id) return this;
    
    for (const child of this.children) {
      const found = child.findChapter(id);
      if (found) return found;
    }
    
    return undefined;
  }

  /**
   * 获取所有带 ch- 标记的章节（按文档顺序）
   */
  getAllChapters(): OutlineNode[] {
    const chapters: OutlineNode[] = [];
    
    const traverse = (node: OutlineNode) => {
      if (node.id) {
        chapters.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(this);
    return chapters;
  }
}

export class OutlineParser {
  /**
   * 解析大纲内容
   */
  parse(content: string): OutlineNode {
    const lines = content.split('\n');
    
    // 找到第一个标题作为根节点
    let root: OutlineNode | null = null;
    const stack: OutlineNode[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 检测标题级别
      const headingMatch = trimmed.match(/^(#+)\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // 提取编号（如 "1.1" 或 "1"）
        const numberMatch = title.match(/^(\d+(?:\.\d+)*)/);
        const number = numberMatch ? numberMatch[1] : undefined;
        
        // 清理标题：去掉编号和后面的点号/空格
        let cleanTitle = title;
        if (number) {
          cleanTitle = title.slice(number.length).replace(/^[\.\s]+/, '').trim();
          if (!cleanTitle) cleanTitle = title; // 如果清理后为空，保留原标题
        }

        const node = new OutlineNode(level, cleanTitle);
        node.number = number;

        // 第一个标题成为根节点
        if (!root) {
          root = node;
          stack.push(root);
          continue;
        }

        // 找到合适的父节点
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length > 0) {
          node.parent = stack[stack.length - 1];
          stack[stack.length - 1].children.push(node);
        }
        
        stack.push(node);
        continue;
      }

      // 检测 ch- 标记
      const chapterMatch = trimmed.match(/^(ch\d+)\s+(.+)/i);
      if (chapterMatch && stack.length > 0) {
        const id = chapterMatch[1].toLowerCase();
        const title = chapterMatch[2].trim();

        const node = new OutlineNode(stack[stack.length - 1].level + 1, title);
        node.id = id;
        node.spawnLevel = true;

        node.parent = stack[stack.length - 1];
        stack[stack.length - 1].children.push(node);
      }
    }

    // 如果没有找到任何标题，返回空根节点
    return root || new OutlineNode(0, '');
  }
}
