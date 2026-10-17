import { describe, expect, it } from "vitest";
import { parseDescription } from "@/lib/description";

describe("商品介绍排版", () => {
  it("没有标题时整段作为开头部分", () => {
    expect(parseDescription("第一行\n第二行\n\n第二段")).toEqual([
      {
        title: null,
        blocks: [
          { type: "paragraph", text: "第一行\n第二行" },
          { type: "paragraph", text: "第二段" },
        ],
      },
    ]);
  });

  it("## 开始新段落，- 是列表项", () => {
    const text = "开头介绍\n\n## 面料与科技\n- 防水\n- 透气\n\n## 设计细节\n说明\n- 口袋";
    expect(parseDescription(text)).toEqual([
      { title: null, blocks: [{ type: "paragraph", text: "开头介绍" }] },
      { title: "面料与科技", blocks: [{ type: "list", items: ["防水", "透气"] }] },
      {
        title: "设计细节",
        blocks: [
          { type: "paragraph", text: "说明" },
          { type: "list", items: ["口袋"] },
        ],
      },
    ]);
  });

  it("没有开头内容时不产生空的开头部分", () => {
    expect(parseDescription("## 标题\n- a")).toEqual([
      { title: "标题", blocks: [{ type: "list", items: ["a"] }] },
    ]);
  });

  it("空文字返回空数组，兼容 Windows 换行", () => {
    expect(parseDescription("")).toEqual([]);
    expect(parseDescription("- a\r\n- b")).toEqual([
      { title: null, blocks: [{ type: "list", items: ["a", "b"] }] },
    ]);
  });
});
