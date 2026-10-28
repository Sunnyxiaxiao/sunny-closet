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
   * 邮寄：只寄美国本土 48 州 + DC。
   * 包邮条件（满足其一）：订单里有一套套装/连体服租满 2 天，或租金 + 加购满 $99（不含押金）。
   * 不满足就按收件州收一次运费：远区 $25，其余（东北部、中西部等）$15。
   * 邮寄最短租期在后台“价格”里改（settings.shipping_min_days）；到店自取 1 天起。
   */
  shipping: {
    /** 文案里写的“邮寄需提前约几天下单” */
    orderAheadDays: 7,
    freeSetMinDays: 2,
    freeSubtotalCents: 9900,
    feeCents: 1500,
    farFeeCents: 2500,
    /** 收远区运费的州，以后可以按真实运费调整 */
    farStates: ["FL", "TX", "LA", "OK", "KS", "NE", "SD", "ND", "CO", "UT", "WY", "MT", "ID", "NV", "AZ", "NM", "CA", "OR", "WA"],
  },
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
