import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site-url";

/** 收集 AI 训练数据的爬虫：不带来顾客，却按访问量消耗托管额度，整站不让抓（搜索引擎和 AI 搜索照常） */
const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "Diffbot",
];

/** 给 SEO 工具公司采数据的爬虫：抓得很勤，同样不带来顾客 */
const SEO_TOOL_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot"];

/**
 * 搜索引擎抓取规则（/robots.txt）：后台、购物车、订单、账号这些页面不收录。
 * 带参数的地址（筛选、日期的各种组合，数量无穷）也不让抓：每个都要查一次数据库，内容和不带参数的页面重复
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await publicOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/zh/cart", "/booking/", "/zh/booking/", "/account", "/zh/account", "/*?"],
      },
      { userAgent: [...AI_TRAINING_BOTS, ...SEO_TOOL_BOTS], disallow: "/" },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
