import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStyleCategory } from "@/lib/categories";
import { GLOVES_CATEGORY } from "@/lib/gloves";
import { HELMET_COVER_CATEGORY } from "@/lib/helmet-covers";
import { parseDescription } from "@/lib/description";
import { resolveDescription } from "../../scripts/catalog-template.mjs";

interface CatalogEntry {
  slug: string;
  category: string;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  template?: string;
  images?: string[];
  tier?: string;
  items: { code: string; size: string; image?: number }[];
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

  it("每套都有品类、图片（或图片文件夹）、尺码", () => {
    for (const e of entries) {
      const isHelmet = e.category === HELMET_COVER_CATEGORY;
      expect(isStyleCategory(e.category) || isHelmet || e.category === GLOVES_CATEGORY, e.slug).toBe(true);
      if (isHelmet) expect(["regular", "premium"], e.slug).toContain(e.tier);
      const hasImages = (e.images?.length ?? 0) > 0 || existsSync(join(dir, "images", e.slug));
      expect(hasImages, e.slug).toBe(true);
      expect(e.items.every((i) => (i.size ?? "均码").trim()), e.slug).toBe(true);
    }
  });

  it("颜色对应的图片序号在图片范围内（从 1 数）", () => {
    for (const e of entries) {
      for (const item of e.items.filter((i) => i.image !== undefined)) {
        expect(item.image, `${e.slug} ${item.code}`).toBeGreaterThanOrEqual(1);
        expect(item.image, `${e.slug} ${item.code}`).toBeLessThanOrEqual(e.images?.length ?? 0);
      }
    }
  });

  it("每套都有英文名称和英文介绍，英文里没有漏翻的中文", () => {
    for (const e of entries) {
      expect(e.nameEn?.trim(), `${e.slug} 缺英文名称 nameEn`).toBeTruthy();
      const english = resolveDescription(e, dir, "en");
      expect(english.trim(), `${e.slug} 缺英文介绍 descriptionEn`).toBeTruthy();
      expect(`${e.nameEn}${english}`, e.slug).not.toMatch(/[\u3400-\u9fff]/);
      // 中英文介绍的段落结构一样（标题数量相同）
      expect(parseDescription(english).length, e.slug).toBe(parseDescription(resolveDescription(e, dir)).length);
    }
  });

  it("ISEE 介绍模板 + 每套自己的开头 = 商品介绍 / 面料与科技 / 设计细节", () => {
    const example: CatalogEntry[] = JSON.parse(
      readFileSync(join(dir, "templates", "isee-migga.example.json"), "utf8"),
    );
    for (const e of example) {
      const sections = parseDescription(resolveDescription(e, dir));
      expect(sections.map((s) => s.title)).toEqual([null, "面料与科技", "设计细节"]);
      expect(sections[0].blocks.length).toBeGreaterThan(0);
    }
    expect(() => resolveDescription({ slug: "x", description: "", template: "missing" }, dir)).toThrow(/不存在/);
  });

  it("介绍里没有混入儿童款", () => {
    for (const e of entries) expect(`${e.name}${e.description}`, e.slug).not.toMatch(/儿童|children|kids/i);
  });

  it("雪服介绍能拆出 商品介绍 / 面料与科技 / 设计细节", () => {
    for (const e of entries.filter((entry) => isStyleCategory(entry.category))) {
      expect(parseDescription(resolveDescription(e, dir)).map((s) => s.title), e.slug).toEqual([
        null,
        "面料与科技",
        "设计细节",
      ]);
    }
  });
});
