import { describe, expect, it } from "vitest";
import { thumbUrl } from "@/lib/images";

const base = "https://x.supabase.co/storage/v1/object/public/style-images";

describe("thumbUrl", () => {
  it("存储桶里的 JPG 换成小图，保留 ?v= 参数", () => {
    expect(thumbUrl(`${base}/pink/1-ab12cd34ef.jpg`)).toBe(`${base}/pink/1-ab12cd34ef.sm.jpg`);
    expect(thumbUrl(`${base}/pink/1.jpg?v=123`)).toBe(`${base}/pink/1.sm.jpg?v=123`);
  });

  it("已经是小图、外部图片、空值时原样返回", () => {
    expect(thumbUrl(`${base}/pink/1.sm.jpg`)).toBe(`${base}/pink/1.sm.jpg`);
    expect(thumbUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(thumbUrl(undefined)).toBeUndefined();
  });
});
