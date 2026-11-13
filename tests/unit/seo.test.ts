import { describe, expect, it } from "vitest";
import { pageSeo, productSummary } from "@/lib/seo";

describe("pageSeo", () => {
  it("points hreflang and canonical at the page itself, in each language", () => {
    const seo = pageSeo("zh", "/styles/pink-suit", { title: "Pink Suit" });
    expect(seo.alternates).toEqual({
      canonical: "/zh/styles/pink-suit",
      languages: { "zh-CN": "/zh/styles/pink-suit", en: "/styles/pink-suit", "x-default": "/styles/pink-suit" },
    });
  });

  it("maps the home page to / and /zh", () => {
    expect(pageSeo("en", "/", { title: "Home" }).alternates).toMatchObject({
      canonical: "/",
      languages: { "zh-CN": "/zh", en: "/" },
    });
  });

  it("uses the page's own description and photo when given, the shop's share image otherwise", () => {
    const plain = pageSeo("en", "/terms", { title: "Terms" });
    expect(plain.description).toBeUndefined();
    expect(plain.openGraph).toMatchObject({ images: [{ url: "/images/share.jpg", width: 1200, height: 630 }] });

    const product = pageSeo("en", "/styles/a", { title: "A", description: "Nice", image: "https://img.example/a.jpg" });
    expect(product.description).toBe("Nice");
    expect(product.openGraph).toMatchObject({ title: "A", description: "Nice", images: [{ url: "https://img.example/a.jpg" }] });
  });
});

describe("productSummary", () => {
  it("uses the intro before the first heading, on one line", () => {
    expect(productSummary("Soft pink set.\nJacket + bibs.\n\n## Fabric\n- 3L shell")).toBe("Soft pink set. Jacket + bibs.");
  });

  it("is undefined without an intro", () => {
    expect(productSummary("## Fabric\n- 3L shell")).toBeUndefined();
    expect(productSummary(null)).toBeUndefined();
  });

  it("shortens long intros", () => {
    const summary = productSummary("word ".repeat(100));
    expect(summary!.length).toBeLessThanOrEqual(160);
    expect(summary!.endsWith("…")).toBe(true);
  });
});
