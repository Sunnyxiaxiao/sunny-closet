import { describe, expect, it } from "vitest";
import { sortSizes } from "@/lib/sizes";

describe("sortSizes", () => {
  it("字母码按从小到大排", () => {
    expect(sortSizes(["XL", "S", "M", "L", "XS"])).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("数字码按数值排", () => {
    expect(sortSizes(["140", "110", "120"])).toEqual(["110", "120", "140"]);
  });

  it("混合时字母码在前、数字码在后，并去重", () => {
    expect(sortSizes(["120", "M", "S", "110", "M"])).toEqual(["S", "M", "110", "120"]);
  });
});
