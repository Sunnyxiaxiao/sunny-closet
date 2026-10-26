import type { MetadataRoute } from "next";
import { HTML_LANG, LOCALES, localePath } from "@/i18n/config";
import { listStyles } from "@/lib/catalog";
import { publicOrigin } from "@/lib/site-url";

/** 给搜索引擎的网站地图（/sitemap.xml）：各栏目页和每个上架商品，中英文各一份 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await publicOrigin();
  const [outfits, helmetCovers, gloves] = await Promise.all([
    listStyles(),
    listStyles({ kind: "helmet_cover" }),
    listStyles({ kind: "gloves" }),
  ]);
  const paths = [
    "/",
    "/styles",
    "/helmet-covers",
    "/gloves",
    "/mix-and-match",
    "/rental-info",
    "/story",
    "/contact",
    ...outfits.map((s) => `/styles/${s.slug}`),
    ...helmetCovers.map((s) => `/helmet-covers/${s.slug}`),
    ...gloves.map((s) => `/gloves/${s.slug}`),
  ];
  return paths.map((path) => ({
    url: `${origin}${localePath("zh", path)}`,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], `${origin}${localePath(l, path)}`])) },
  }));
}
