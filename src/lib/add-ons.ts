/**
 * Add-ons and outfits: an outfit (set, one-piece, top or pants) can take a helmet cover and a pair of gloves at a flat add-on
 * price for the whole rental. Across an order there are at most as many of each as there are outfits; more are rented
 * as standalone items. The database checks the same (create_order, cart_outfit_count).
 */

export const ADD_ON_CATEGORIES = ["helmet_cover", "gloves"] as const;
export type AddOnCategory = (typeof ADD_ON_CATEGORIES)[number];

export function isAddOnCategory(category: string): category is AddOnCategory {
  return (ADD_ON_CATEGORIES as readonly string[]).includes(category);
}

/** Categories that can take add-ons */
export const OUTFIT_CATEGORIES = new Set(["suit", "one_piece", "jacket", "pants"]);
/** A set or one-piece is both a top and pants */
const TOP_CATEGORIES = new Set(["suit", "one_piece", "jacket"]);
const PANTS_CATEGORIES = new Set(["suit", "one_piece", "pants"]);

/** One item in an order: its category and its add-ons' categories */
export interface OutfitLine {
  category: string;
  addOnCategories: readonly string[];
}

/** Outfits in an order: sets and one-pieces, plus tops paired with pants (a top or pants on its own isn't one) */
export function outfitCount(categories: readonly string[]): number {
  const count = (c: string) => categories.filter((x) => x === c).length;
  return count("suit") + count("one_piece") + Math.min(count("jacket"), count("pants"));
}

/** Indexes of the items whose add-ons go past one helmet cover and one pair of gloves per outfit (counted in cart order) */
export function linesOverAddOnLimit(lines: readonly OutfitLine[]): Set<number> {
  const outfits = outfitCount(lines.map((l) => l.category));
  const used: Record<AddOnCategory, number> = { helmet_cover: 0, gloves: 0 };
  const over = new Set<number>();
  lines.forEach((line, index) => {
    for (const category of line.addOnCategories) {
      if (!isAddOnCategory(category)) continue;
      used[category] += 1;
      if (used[category] > outfits) over.add(index);
    }
  });
  return over;
}

/** Which parts of a full look (a top, pants, a helmet cover, gloves; rented or added on) the order has */
export function fullLookParts(lines: readonly OutfitLine[]) {
  const all = lines.flatMap((l) => [l.category, ...l.addOnCategories]);
  return {
    top: all.some((c) => TOP_CATEGORIES.has(c)),
    pants: all.some((c) => PANTS_CATEGORIES.has(c)),
    helmetCover: all.includes("helmet_cover"),
    gloves: all.includes("gloves"),
  };
}

export function isFullLook(lines: readonly OutfitLine[]): boolean {
  const parts = fullLookParts(lines);
  return parts.top && parts.pants && parts.helmetCover && parts.gloves;
}

/** Clothes complete, only a helmet cover or the gloves missing (the cart's gentle "full look ships free" note) */
export function oneAccessoryShort(lines: readonly OutfitLine[]): boolean {
  const parts = fullLookParts(lines);
  return parts.top && parts.pants && parts.helmetCover !== parts.gloves;
}
