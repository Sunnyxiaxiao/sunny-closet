/**
 * 店铺基础配置。改店名、货币、联系方式等只需改这里。
 * 缓冲天数等需要在后台调整的配置存放在数据库 settings 表中。
 */
export const shop = {
  name: "Sunny Closet",
  tagline: "雪服租赁 · 轻松上雪场",
  locale: "zh-CN",
  currency: "USD",
  /** 用于计算“今天”是哪一天（例如禁止选择过去的日期）。 */
  timeZone: "America/New_York",
  fulfillmentMethods: ["pickup", "shipping"] as const,
  contact: {
    email: "hello@example.com",
    phone: "(000) 000-0000",
    address: "（门店地址占位）",
    hours: "周一至周日 9:00–18:00",
  },
} as const;

export type FulfillmentMethod = (typeof shop.fulfillmentMethods)[number];
