/**
 * 店铺基础配置。改店名、货币、联系方式等只需改这里。
 * 缓冲天数等需要在后台调整的配置存放在数据库 settings 表中。
 */
export const shop = {
  name: "Sunny Closet",
  currency: "USD",
  /** 用于计算“今天”是哪一天（例如禁止选择过去的日期）。 */
  timeZone: "America/New_York",
  fulfillmentMethods: ["pickup", "shipping"] as const,
  /**
   * 首页大图：按图片原本的比例完整显示（电脑上铺满宽度，手机上左右滑动看全图）。
   * 换图：把图片放到 public 文件夹，再改这里的文件名和宽高（像素）。
   */
  heroImage: { src: "/hero.jpg", width: 3200, height: 667 },
  /** 地址和营业时间要写中英两种，在 src/messages/zh-CN.ts 和 en.ts 的 contact 里改 */
  contact: {
    email: "sunnycloset.rentals@gmail.com",
    /** 只收短信，不接电话（网站上会注明，并用“发短信”链接） */
    phone: "(857) 310-6276",
  },
  /**
   * 顾客的预订被你“确认”之后（付款备注的提示文字在 messages 的 bookingPage.paymentNote），会在预订详情页看到这里的付款方式。
   * 上线前请改成你自己的 Zelle 邮箱或手机号、Venmo 用户名（中英文页面都显示这里的值）。
   */
  payment: {
    zelle: "zelle@example.com",
    venmo: "@your-venmo",
  },
} as const;

export type FulfillmentMethod = (typeof shop.fulfillmentMethods)[number];
