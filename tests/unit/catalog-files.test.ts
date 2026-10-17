import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStyleCategory } from "@/lib/categories";
import { parseDescription } from "@/lib/description";

interface CatalogEntry {
  slug: string;
  category: string;
  name: string;
  description: string;
  images: string[];
  items: { code: string; size: string }[];
}

const dir = join(process.cwd(), "catalog");
const entries: CatalogEntry[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

describe("catalog/ 商品清单", () => {
  it("slug 和库存编号都不重复", () => {
    const slugs = entries.map((e) => e.slug);
    const codes = entries.flatMap((e) => e.items.map((i) => i.code));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("每套都有品类、图片、尺码", () => {
    for (const e of entries) {
      expect(isStyleCategory(e.category), e.slug).toBe(true);
      expect(e.images.length, e.slug).toBeGreaterThan(0);
      expect(e.items.every((i) => i.size.trim()), e.slug).toBe(true);
    }
  });

  it("介绍里没有混入儿童款", () => {
    for (const e of entries) expect(`${e.name}${e.description}`, e.slug).not.toMatch(/儿童|children|kids/i);
  });

  it("介绍能拆出 商品介绍 / 面料与科技 / 设计细节", () => {
    for (const e of entries) {
      expect(parseDescription(e.description).map((s) => s.title), e.slug).toEqual([
        null,
        "面料与科技",
        "设计细节",
      ]);
    }
  });
});
