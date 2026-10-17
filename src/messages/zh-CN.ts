/**
 * 界面文字集中放在这里。以后加英文时，新建 en.ts 保持同样的结构即可。
 */
export const messages = {
  nav: {
    home: "首页",
    styles: "全部款式",
    rentalInfo: "租赁须知",
    contact: "联系我们",
  },
  home: {
    heroTitle: "雪服租赁，轻装出发",
    heroSubtitle: "成人与儿童雪服按天租，专业清洗消毒，到店自取或邮寄到家。",
    browseCta: "浏览款式",
    stepsTitle: "三步租到雪服",
    steps: [
      { title: "选款式和尺码", body: "挑选喜欢的款式，选择取件与归还日期。" },
      { title: "提交预订申请", body: "填写联系方式，我们会尽快确认。" },
      { title: "取件上雪场", body: "到店自取或邮寄到家，用完按时归还。" },
    ],
  },
  footer: {
    rights: "保留所有权利。",
  },
  bookingStatus: {
    pending: "待确认",
    confirmed: "已确认",
    rejected: "已拒绝",
    picked_up: "已取件",
    returned: "已归还",
    cancelled: "已取消",
  },
  fulfillment: {
    pickup: "到店自取",
    shipping: "邮寄",
  },
} as const;

export type Messages = typeof messages;
