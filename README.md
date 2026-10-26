# Sunny Closet · 雪服租赁网站

> 本文档会随里程碑逐步完善。最终版（含部署到 Vercel）将在 M5 完成。

## 技术栈

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Supabase：Postgres 数据库、Auth（管理员登录）、Storage（商品图片）
- zod 表单校验，Vitest 自动化测试

## 目录说明

| 路径 | 作用 |
|---|---|
| `src/app/[lang]/` | 网站页面（中文 `/styles`，英文 `/en/styles`，同一套页面） |
| `src/components/` | 页面上复用的组件 |
| `src/config/shop.ts` | 店名、货币、时区、联系方式 |
| `src/messages/zh-CN.ts`、`en.ts` | 界面文字，中英文各一份，结构一样 |
| `src/i18n/` | 语言设置（网址前缀、读取当前语言） |
| `src/lib/supabase/` | 连接数据库的代码 |
| `src/app/[lang]/booking/` | 顾客提交预订的服务端动作，以及预订详情页 `/booking/编号` |
| `src/app/admin/` | 管理后台（登录、订单列表、确认/拒绝/取件/归还） |
| `src/proxy.ts` | 把不带前缀的中文网址转到中文页面；访问 `/admin` 时续期管理员的登录状态 |
| `supabase/migrations/` | 数据库建表文件（按文件名顺序执行） |
| `catalog/` | 要导入的商品清单（`npm run import:catalog`） |
| `tests/` | 自动化测试 |

## 一、本地准备

1. 安装 Node.js LTS（20.9 或更高）：https://nodejs.org
2. 在 Cursor 里打开本项目，菜单 **Terminal → New Terminal** 打开终端，运行：

   ```bash
   npm install
   ```

3. 运行测试，确认环境正常：

   ```bash
   npm test
   ```

## 二、配置 Supabase

### 1. 创建项目

1. 打开 https://supabase.com ，点右上角 **Start your project**，用 GitHub 或邮箱注册并登录。
2. 点 **New project**：
   - **Name**：`sunny-closet`
   - **Database Password**：点 **Generate a password**，然后把密码保存到你自己的密码管理器（本项目日常用不到它，但请妥善保管，不要发给任何人）。
   - **Region**：选离你的顾客最近的，例如 **East US (North Virginia)**。
3. 点 **Create new project**，等待 1–2 分钟直到项目准备好。

### 2. 填写密钥

1. 在 Cursor 左侧文件列表中打开项目根目录的 `.env.local`（如果没有，就把 `.env.example` 复制一份并改名为 `.env.local`）。
2. 回到 Supabase，点顶部绿色的 **Connect** 按钮，在 **Framework** 选项卡里能看到现成的 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 两行，复制到 `.env.local` 中对应位置。
3. 打开 **Project Settings → API Keys**，在 **Secret keys** 区域点眼睛图标显示并复制（以 `sb_secret_` 开头）→ 粘贴到 `SUPABASE_SECRET_KEY=` 后面。
4. 点 **Connect → Direct（Connection string）**，复制以 `postgresql://` 开头的地址 → 粘贴到 `SUPABASE_DB_URL=` 后面，并把 `[YOUR-PASSWORD]`（连同方括号）换成你的数据库密码。
   - 忘记密码：**Project Settings → Database → Reset database password**，建议只用字母和数字。
   - 如果后面建表时报网络/地址错误，改用同一页面中 **Session pooler** 的地址。
5. 保存文件。等号前后不要加空格，也不要加引号。

> ⚠️ `.env.local` 已被 `.gitignore` 排除，不会被提交到 git。请不要把里面的内容发到聊天、截图或任何公开的地方。

### 3. 建表并导入商品

在终端运行：

```bash
npm run db:setup
```

它会按顺序执行 `supabase/migrations/` 下的建表文件。已执行过的文件会自动跳过，重复运行是安全的。

然后导入商品（图片会自动上传到 Supabase Storage）：

```bash
npm run import:catalog
```

> 备选方式：也可以在 Supabase 左侧 **SQL Editor** 中新建查询（注意不要选到 Logs），按文件名顺序粘贴并运行上述文件。

### 4. 检查配置

在终端运行：

```bash
npm run check:supabase
```

全部显示 ✅ 即表示数据库与密钥都配置正确。

## 三、本地运行

```bash
npm run dev
```

浏览器打开 http://localhost:3000 。按 `Ctrl + C` 停止。

## 四、预订流程与管理后台

### 顾客怎么订

1. 在雪服 / 手套 / 头盔套的详情页选好尺码和日期，确认有货后点“加入购物车”。可以加好几件（最多 10 件），右上角的购物车图标显示件数。
   购物车存在顾客自己的浏览器里（`src/lib/cart.ts`），不登录也能用。
2. 在购物车页（`/cart`）看每件的租金、押金和整单金额，填写姓名、手机号、邮箱（微信号选填）、取件方式（邮寄要填地址），提交。**此时不付款**。
   打开购物车时会重新查价格和库存（`/api/cart`）；有一件没货、不能邮寄等，标红提示，处理好才能提交。
3. 整个购物车成为一笔订单、一个预订编号，进入“待确认”，并立刻占住这几件库存（防超订由数据库保证，任何一件没货整单不成立）。
   第 1 件是主订单，其余每件是子订单（`SC-XXXXXXXX-1`……，`cart_item = true`），后台在同一张订单卡片里显示，状态跟着主订单走。
   顾客会跳转到 `/booking/SC-XXXXXXXX` 页面查看进度，这个页面不显示手机号、邮箱和地址。
4. 你在后台点“确认预订”后，顾客刷新这个页面就会看到付款方式（Zelle / Venmo）和应付金额。

### 改成你自己的付款信息

打开 `src/config/shop.ts`，把 `payment` 里的 `zelle`、`venmo` 换成你自己的账号。顾客只有在订单被你“确认”之后才能看到。

> 收到 Zelle / Venmo 款项后，请先在自己的银行或 Venmo App 里确认到账，再放货。Zelle 转账发出后无法撤销，也没有购买保护。

### 创建管理员账号（只需做一次）

1. 打开 Supabase 后台 **Authentication → Users → Add user → Create new user**，填你的邮箱和一个强密码，勾选 **Auto Confirm User**。
2. 在终端运行（把邮箱换成你自己的）：

   ```bash
   npm run admin:add -- 你的邮箱
   ```

3. 浏览器打开 http://localhost:3000/admin/login 登录。

### 后台能做什么

- 订单按 待确认 / 已确认 / 已取件 / 已归还 / 已关闭 分类，并显示数量。
- 状态只能按顺序流转：待确认 → 已确认 → 已取件 → 已归还；待确认可以拒绝，待确认和已确认可以取消。拒绝和取消会立刻释放库存。
- 每笔订单都有“内部备注”，只有你自己能看到。
- 订单列表目前显示最近 500 笔。
- **库存**（`/admin/inventory`）：所有款式一览（雪服 / 头盔套 / 手套），每件库存现在的状态和下一笔预订。点进一款可以改中英文名称、押金、单独定价、排序、上下架；加一件库存；把某件标记不可租；手动锁定日期（拍照、维修、送洗）。
- **价格**（`/admin/pricing`）：改全店的三张价目表（完整套装 / 只租外套 / 只租雪裤）和邮寄最短天数，保存后立即生效，已下的订单不变。
- **头盔套**：新增头盔套、改档位和加购价。
- 只有 `admin_users` 名单里的账号能进后台；顾客账号登录后台会被拒绝。

### 顾客账号

- 顾客可以注册（`/signup`）、登录（`/login`）、忘记密码（`/forgot-password`），右上角的人像图标进“我的账号”（`/account`）。
- “我的账号”里可以保存姓名、手机号、微信号（下单时自动填好），看到自己的预订（登录后下的单，以及用同一个已确认邮箱下的单）。
- **上线前一定要在 Supabase 里设置发信**：注册确认、忘记密码都要发邮件，而 Supabase 自带的发信只能发给项目成员（真实顾客收不到）。
  免费的做法是用店铺的 Gmail 发：
  1. 登录店铺 Gmail → Google 账号 → 安全性 → 打开**两步验证**；再搜索 **App passwords（应用专用密码）**，新建一个（名字写 Supabase），记下 16 位密码。
  2. Supabase → **Authentication → Emails → SMTP Settings** → 打开 Enable custom SMTP：
     Sender email 填店铺 Gmail，Sender name 填 `Sunny Closet`，Host `smtp.gmail.com`，Port `465`，
     Username 填店铺 Gmail，Password 填第 1 步的 16 位应用专用密码。
  3. 同一页的 **Templates**：把 `supabase/email-templates/confirm-signup.html` 和 `reset-password.html` 的内容分别贴到
     “Confirm signup”和“Reset Password”（文件开头注释里有建议的邮件主题）。邮件是英文的，链接换手机打开也能用。
  4. **Authentication → URL Configuration**：Site URL 填网站地址（本地是 `http://localhost:3000`，上线后改成正式网址），
     Redirect URLs 加上 `http://localhost:3000/**` 和 `https://你的网址/**`。
  Gmail 免费，每天大约能发 500 封，小店够用。以后量大了可以换 Resend 等发信服务（需要自己的域名）。

### 防刷

同一网络 10 分钟最多提交 6 次，同一邮箱 1 小时最多 3 次；表单里还有一个真人看不到的隐藏输入框，机器人填了就会被拒绝。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发预览 |
| `npm run build` | 生产构建（部署前检查） |
| `npm test` | 运行全部自动化测试 |
| `npm run db:setup` | 把建表文件写入 Supabase |
| `npm run import:catalog` | 导入 `catalog/` 里的商品（已存在的跳过；加 `-- --update` 覆盖更新） |
| `npm run check:supabase` | 检查 Supabase 配置 |
| `npm run admin:add -- 邮箱` | 把已创建的 Supabase 用户设为管理员 |

## 商品怎么组织

- **每套雪服 = 一个“款式” = 一个展示页**。你的每套雪服都不一样，所以每套单独建一个款式，下面挂 1 件库存（填尺码和编号）。只有一个尺码时，详情页直接显示“尺码 M”，不用顾客选。
- 每个款式有 **品牌**（可留空，例如 ISEE MIGGA）和 **品类**：成套 / 连体服 / 上衣 / 裤子。列表页可以按品类筛选。
- 商品清单放在 `catalog/*.json`（目前是 `catalog/iseemigga.json`），运行 `npm run import:catalog` 会读取图片、压缩后上传到 Supabase Storage，并写入款式和库存。
- 每个款式可以填 `brand`（品牌），列表页会自动出现对应的品牌筛选。
- 填了 `sourceUrl` 的款式，详情页底部会注明“图片与参数来源：品牌 官网”并链接到原商品页；不填就不显示。

### 上架新款（用自己下载或截图的图片）

1. 新建文件夹 `catalog/images/<slug>/`（slug 用小写英文和连字符，例如 `pink-bow-ski-suit`），把图片放进去。
   图片按文件名排序，**第一张是封面**，建议命名为 `1.jpg`、`2.jpg`……（`10` 会排在 `9` 后面）。
   JPG / PNG / WebP / HEIC（iPhone 照片）都可以，脚本会自动转正、压缩成长边 2000px 以内的 JPG，不用自己处理大小。
   截图请先裁掉手机状态栏和淘宝的按钮，只留衣服。
2. 在 `catalog/` 下的任意 `.json` 文件里加一条（可以新建一个文件，例如 `catalog/other.json`，内容是 `[ … ]` 数组）：

   ```json
   {
     "slug": "pink-bow-ski-suit",
     "brand": "品牌名",
     "category": "suit",
     "name": "粉色蝴蝶结滑雪套装",
     "dailyPrice": 49,
     "deposit": 200,
     "sortOrder": 200,
     "items": [{ "code": "SC020", "size": "M" }],
     "description": "一句话介绍颜色和款式。\n\n## 设计细节\n- ……"
   }
   ```

   不写 `images` 就会自动用 `catalog/images/<slug>/` 里的图；也可以写 `"images": ["images/pink-bow-ski-suit/封面.jpg", "https://…"]` 手动指定顺序，本地路径和网址可以混用。
   `category` 可选 `suit`（成套）、`one_piece`（连体服）、`jacket`（上衣）、`pants`（裤子）；库存编号 `code` 不能和已有的重复。
3. 运行 `npm run import:catalog`。之后换了图片或改了文字，运行 `npm run import:catalog -- --update`。

### 商品介绍怎么写

`description` 里用两条简单规则排版，详情页会自动变成可展开的段落：

```text
官方款名：……            ← 第一个标题之前的内容显示为“商品介绍”
一句话介绍颜色和款式。

## 面料与科技             ← “## ”开头：新的一段，标题是“面料与科技”
- 防水指数 ＞20000mmH₂O   ← “- ”开头：一条列表项
```

#### ISEE 雪服模板（没有官网链接时）

ISEE MIGGA 的雪服面料和细节基本一样，统一放在 `catalog/templates/isee-migga.md`。新款只要：

1. 照片放进 `catalog/images/<slug>/`（按文件名排序，第一张是封面）；
2. 在商品清单里加一条，写 `"template": "isee-migga"`，`description` / `descriptionEn` 只写这一套的外观（中英文各一两句）；不写 `sourceUrl`；
3. 运行 `npm run import:catalog`。

导入时会把模板里的「面料与科技」「设计细节」接在后面（英文用 `isee-migga.en.md`）。示例见 `catalog/templates/isee-migga.example.json`。某一套参数不一样时，不写 `template`，直接在 `description` 里写完整介绍即可。

### 中英文

网站有中文（`/styles`）和英文（`/en/styles`）两版，右上角「EN / 中文」切换。加内容时两种语言都要加：

- **商品**：清单里 `name` / `description` 是中文，`nameEn` / `descriptionEn` 是英文，都要填（测试会检查漏填和英文里混进中文）。只改了文字时运行 `npm run import:catalog -- --text`，不会重新上传图片。
- **后台新增头盔套**：表单里有「英文名称」「英文介绍」。
- **界面文字**：`src/messages/zh-CN.ts` 加一句，`src/messages/en.ts` 同一个位置加英文（漏了类型检查会报错）。
- **新的颜色名**（库存尺码里写的中文颜色，例如「芭比玫红 · S」）：在 `en.ts` 的 `sizeNames` 加上英文。
- **后台**只有中文。

### 换图片

- **商品图**：竖版 3:5（例如 930×1550 或 1200×2000），第一张作为封面。
- **首页大图**：现在是 `public/hero.jpg`（滑雪板图案，3200×667）。按原比例完整显示：电脑上铺满宽度，手机上左右滑动看全图。换图时把新图放进 `public`，再改 `src/config/shop.ts` 里 `heroImage` 的文件名和宽高。

## 头盔套

- 头盔套也是“款式”（`styles.category = 'helmet_cover'`），库存、排期、防超订和雪服共用同一套表和数据库约束。
- **后台管理**：登录 `/admin` → 顶部切到“头盔套”，可以新增 / 编辑、上传图片、设置经典款 / 精选款、价格、重置价值、
  标签，标记某件可租 / 不可租，查看即将到来的预订，手动锁定日期。
- **单租**：默认 1 天 $15、2–3 天 $20、4–7 天 $25（整个租期的总价，不按天相乘），存在 `styles.rental_prices_cents`。
- **搭配雪服加购**：经典款 +$8、精选款 +$12，整个租期一口价。雪服页的“Complete the Look ✨”里选择；
  加购的头盔套是一笔子订单（`bookings.parent_booking_id`），日期和雪服相同，雪服订单改状态时自动跟着改。
  目前每套雪服最多加购 1 件（`MAX_ADD_ONS_PER_OUTFIT`）。
- **库存状态**（可租 / 已预订 / 已出租 / 已归还 / 清洁中 / 不可租）由订单和锁定日期自动推算，见 `src/lib/inventory/status.ts`。
- 也可以用 `catalog/*.json` 批量导入：`category` 写 `"helmet_cover"`，填 `tier`（`regular` / `premium`）和 `tags`，价格不填用默认值。

## 业务规则速查

- **阶梯定价**（按品类，另加押金）：

  | 租期 | 只租外套 | 只租雪裤 | 完整套装（成套 / 连体服） |
  |---|---|---|---|
  | 1 天 | $35 | $25 | $49 |
  | 2 天 | $50 | $35 | $79 |
  | 3 天 | $60 | $45 | $94 |
  | 4 天 | $70 | $55 | $109 |
  | 5 天 | $80 | $65 | $119 |
  | 6 天 | $85 | $70 | $129 |
  | 7 天 | $90 | $75 | $139 |

  价目表存在数据库 `settings` 里（单位：美分，第 n 项 = 租 n 天，超出的天数用最后一档）：
  完整套装 `rental_prices_cents`、外套 `jacket_prices_cents`、雪裤 `pants_prices_cents`。
  要改价格在 Supabase 的 SQL Editor 里执行，例如
  `update public.settings set pants_prices_cents = array[2500,3500,4500,5500,6500,7000,7500] where id;`。
  外套、雪裤会出现在 **Mix & Match** 页（`/mix-and-match`）。头盔套、手套用自己的价目表。
- **押金**：完整套装 $200，单租外套 $150、雪裤 $100（商品清单里 `deposit` 不填时按这个默认值）。
- **最长租期** 7 天（`settings.max_rental_days`）。**最短租期**：到店自取 1 天，邮寄 2 天（`settings.shipping_min_days`）。
  下单时数据库会再校验一遍价格和最短租期。
- **邮寄与运费**：
  - 只寄美国本土 48 州 + 华盛顿特区（不含阿拉斯加、夏威夷和海外地区），**全美包邮，不收运费**；订单合计 = 租金 + 押金。
  - 邮寄每件最短 2 天（后台“价格”里改）；Ithaca 本地自取 1 天起。邮寄需提前约 7 天下单（`src/config/shop.ts` 的 `shop.shipping.orderAheadDays`）。
  - 邮寄的订单一起寄出，所以购物车里每件的滑雪日必须相同（到店自取可以不同）。
  - 邮寄地址分成街道、城市、州（下拉，只能选本土 48 州 + DC）、邮编四个字段，州和邮编会校验格式；提交时拼成一行存进订单的 `shipping_address`。
  - 文案（款式页、结算表单、租赁须知页）里的天数从设置和配置读取，改了自动同步。
- **只按滑雪日计费**：顾客选第一个和最后一个滑雪日，租期天数 = 最后一天 − 第一天 + 1。
- **取件 / 归还 / 运输不收费，但占用库存**（前置 / 后置天数，存在 `settings`，可以按实际物流修改）：
  - 到店自取：前一晚起可取件，最后一个滑雪日的次日中午前归还 → 前 1 天、后 1 天（`pickup_lead_days` / `pickup_tail_days`）
  - 邮寄：提前 3 天寄出；顾客次日前寄回，回程按 3 天算 → 前 3 天、后 4 天（`shipping_lead_days` / `shipping_tail_days`）
  - 之后再加清洁缓冲天数（`buffer_days`，默认 1 天）。每笔订单下单时记下当时的天数，以后改设置不影响已有订单。
  - 例：周六、周日滑雪，到店自取 → 周五晚取、周一中午前还、周二清洁，按 2 天计费；下一位最早周四滑雪（周三晚取件）。
  - 修改示例：`update public.settings set shipping_tail_days = 5 where id;`
- “待确认 / 已确认 / 已取件 / 已归还” 的订单占用库存；“已拒绝 / 已取消” 释放库存。
- 防超订由数据库的排他约束（`bookings_no_overlap`）保证，并发提交也不会重复分配同一件。
