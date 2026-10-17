/**
 * 界面文字集中放在这里。以后加英文时，新建 en.ts 保持同样的结构即可。
 */
export const messages = {
  announcement: "取件日和归还日都计入租期 · 支持到店自取与邮寄",
  nav: {
    home: "首页",
    styles: "全部雪服",
    rentalInfo: "租赁须知",
    contact: "联系我们",
    menu: "菜单",
    close: "关闭",
  },
  home: {
    heroTitle: "这个冬天\n穿得好看去滑雪",
    heroSubtitle: "每一套都是独一无二的雪服，按天租，专业清洗，到店自取或邮寄到家。",
    browseCta: "浏览雪服",
    categoriesTitle: "按品类浏览",
    newArrivalsTitle: "新上架",
    viewAll: "查看全部",
    stepsTitle: "怎么租",
    steps: [
      { title: "挑一套喜欢的", body: "每套雪服都有单独的页面，看清尺码和细节。" },
      { title: "选日期并提交预订", body: "确认这段时间有空，填写联系方式，我们会尽快确认。" },
      { title: "取件上雪场", body: "到店自取或邮寄到家，用完按时归还即可。" },
    ],
  },
  categories: {
    suit: "成套",
    one_piece: "连体服",
    jacket: "上衣",
    pants: "裤子",
  },
  product: {
    perDay: "/ 天",
    deposit: "押金",
    size: "尺码",
    description: "商品介绍",
    rentalNotes: "租赁与清洁",
    rentalNotesBody: [
      "取件日和归还日都计入租期，例如 10 号取、12 号还按 3 天计费。",
      "押金在归还并检查无损后全额退还。",
      "每次归还后都会专业清洗消毒，并预留整理时间。",
    ],
    questions: "有疑问？",
    questionsBody: "尺码拿不准、想看更多细节图，欢迎联系我们。",
    related: "你可能还喜欢",
    sourceCredit: "图片与参数来源：",
    officialSite: "官网",
  },
  footer: {
    rights: "保留所有权利。",
    shop: "逛逛",
    help: "帮助",
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
