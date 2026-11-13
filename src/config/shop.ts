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
   * 包邮条件（满足其一）：租金 + 加购满 $99（不含押金），或订单里有一整套 full look：上衣、裤子、头盔套、手套各一件
   * （官方套装、连体服或自己混搭都算；配件单租或加购都算，见 src/lib/add-ons.ts）。远区包邮也补一点运费。
   * 不包邮就按收件州收一次运费：远区 $30，其余（东北部、中西部等）$15。
   * 邮寄最短租期在后台“价格”里改（settings.shipping_min_days）；到店自取 1 天起。
   */
  shipping: {
    /** 文案里写的“邮寄需提前约几天下单” */
    orderAheadDays: 7,
    freeSubtotalCents: 9900,
    feeCents: 1500,
    farFeeCents: 3000,
    /** 远区的包邮订单补的运费 */
    farFreeFeeCents: 1500,
    /**
     * 首个滑雪日不到 orderAheadDays 天的邮寄单（急单），顾客二选一：
     * 加急（USPS Priority Mail，加收这笔，包邮订单也收），或者不加急、先付款等店主确认（24 小时内没处理自动拒单）
     */
    rushFeeCents: 1500,
    rushFarFeeCents: 2500,
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
   * Zelle 手机号、Venmo 用户名（中英文页面都显示这里的值）。
   */
  payment: {
    zelle: "857-310-6276",
    venmo: "@Yu-Zou-2",
    /** 到店自取、选“当面付租金 + 押金”时，每单当面收的押金（分），归还后当面退 */
    inPersonDepositCents: 20000,
  },
  /**
   * 逾期归还，每件每晚一天收的钱（分）。固定收费而不是按日租金补收，免得顾客下单时少选天数、晚还也只补一点租金，占掉后面的预约。
   * 租赁条款（/terms）直接用这里的数；“租赁须知”损坏与遗失那段文字里也写了 $25 / $20 / $10，改的话一起改。
   */
  lateFees: {
    /** 一整套：套装、连体服 */
    setCents: 2500,
    /** 单件上衣或裤子 */
    pieceCents: 2000,
    /** 配件：手套、头盔套 */
    accessoryCents: 1000,
  },
} as const;

export type FulfillmentMethod = (typeof shop.fulfillmentMethods)[number];
