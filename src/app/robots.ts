import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site-url";

/** 搜索引擎抓取规则（/robots.txt）：后台、购物车、订单、账号这些页面不收录 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await publicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/cart", "/en/cart", "/booking/", "/en/booking/", "/account", "/en/account"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
