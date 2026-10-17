const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** 尺码排序：字母码按 XS→XXL，数字码按大小，其余按字母顺序放在最后 */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string): [number, number, string] => {
    const upper = size.toUpperCase();
    const letter = LETTER_ORDER.indexOf(upper);
    if (letter >= 0) return [0, letter, upper];
    const num = Number(size);
    if (Number.isFinite(num)) return [1, num, upper];
    return [2, 0, upper];
  };
  const [ga, na, sa] = rank(a);
  const [gb, nb, sb] = rank(b);
  return ga - gb || na - nb || sa.localeCompare(sb);
}

export function sortSizes(sizes: Iterable<string>): string[] {
  return [...new Set(sizes)].sort(compareSizes);
}
