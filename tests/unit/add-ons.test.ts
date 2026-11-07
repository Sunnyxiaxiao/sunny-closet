import { describe, expect, it } from "vitest";
import { isFullLook, linesOverAddOnLimit, outfitCount } from "@/lib/add-ons";

const line = (category: string, addOnCategories: string[] = []) => ({ category, addOnCategories });

describe("几套衣服", () => {
  it("套装、连体服各算一套；上衣和裤子要配对才算", () => {
    expect(outfitCount(["suit", "one_piece"])).toBe(2);
    expect(outfitCount(["jacket"])).toBe(0);
    expect(outfitCount(["jacket", "pants", "pants"])).toBe(1);
    expect(outfitCount(["gloves", "helmet_cover"])).toBe(0);
  });
});

describe("加购限量：每套衣服一顶头盔套、一副手套", () => {
  it("一套衣服：一顶头盔套 + 一副手套可以", () => {
    expect(linesOverAddOnLimit([line("suit", ["helmet_cover", "gloves"])])).toEqual(new Set());
  });

  it("单租上衣加购：超出（要配上裤子才行）", () => {
    expect(linesOverAddOnLimit([line("jacket", ["helmet_cover"])])).toEqual(new Set([0]));
    expect(linesOverAddOnLimit([line("jacket", ["helmet_cover"]), line("pants")])).toEqual(new Set());
  });

  it("两套衣服各加购一份可以；第三顶头盔套超出，标在多出来的那件上", () => {
    expect(
      linesOverAddOnLimit([line("suit", ["helmet_cover"]), line("suit", ["helmet_cover"]), line("jacket", ["helmet_cover"])]),
    ).toEqual(new Set([2]));
  });
});

describe("full look", () => {
  it("上衣、裤子、头盔套、手套都有才算；配件单租也算", () => {
    expect(isFullLook([line("suit", ["helmet_cover", "gloves"])])).toBe(true);
    expect(isFullLook([line("jacket"), line("pants"), line("helmet_cover"), line("gloves")])).toBe(true);
    expect(isFullLook([line("suit", ["helmet_cover"])])).toBe(false);
    expect(isFullLook([line("pants", ["helmet_cover", "gloves"])])).toBe(false);
  });
});
