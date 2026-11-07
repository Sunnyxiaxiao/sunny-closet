import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/next-path";

describe("登录 / 邮件链接之后的跳转只能留在本站", () => {
  it("本站路径照常放行（保留参数和锚点）", () => {
    expect(safeNextPath("/account", "/x")).toBe("/account");
    expect(safeNextPath("/zh/account?tab=orders#top", "/x")).toBe("/zh/account?tab=orders#top");
    expect(safeNextPath("/booking/SC-1%2F2", "/x")).toBe("/booking/SC-1%2F2");
  });

  it("指向其他网站的写法一律退回默认页", () => {
    for (const evil of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "\\evil.example",
      "/\tevil.example",
      "/\n/evil.example",
      "https://evil.example",
      "evil.example",
      "",
    ]) {
      expect(safeNextPath(evil, "/account")).toBe("/account");
    }
  });

  it("不是字符串时退回默认页", () => {
    expect(safeNextPath(null, "/account")).toBe("/account");
    expect(safeNextPath(["/a"], "/account")).toBe("/account");
  });

  it("编码过的反斜杠只是普通字符，仍留在本站", () => {
    expect(safeNextPath("/%5Cevil.example", "/account")).toBe("/%5Cevil.example");
  });
});
