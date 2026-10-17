/**
 * 商品介绍的简单排版规则（后台编辑时只需记住两条）：
 *   "## 标题"  开始一个新的折叠段落
 *   "- 内容"   一条列表项
 * 其余文字按段落显示，空行分段。第一个标题之前的内容是“商品介绍”。
 */

export type DescriptionBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export interface DescriptionSection {
  /** null 表示第一个标题之前的开头部分 */
  title: string | null;
  blocks: DescriptionBlock[];
}

export function parseDescription(text: string): DescriptionSection[] {
  const sections: DescriptionSection[] = [{ title: null, blocks: [] }];
  let current = sections[0];
  let block: DescriptionBlock | null = null;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      block = null;
      continue;
    }
    if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), blocks: [] };
      sections.push(current);
      block = null;
    } else if (line.startsWith("- ")) {
      if (block?.type !== "list") {
        block = { type: "list", items: [] };
        current.blocks.push(block);
      }
      block.items.push(line.slice(2).trim());
    } else if (block?.type === "paragraph") {
      block.text += `\n${line}`;
    } else {
      block = { type: "paragraph", text: line };
      current.blocks.push(block);
    }
  }

  return sections.filter((s) => s.title !== null || s.blocks.length > 0);
}
