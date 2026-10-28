# Sunny Closet · Snowboard Apparel Rental

A bilingual (English / Chinese) rental shop for snowboard outfits, gloves and helmet covers, built for a small real-world business in Ithaca, NY. Customers browse styles, check date-based availability, put several items in a cart and place one order; the owner confirms, ships or hands over, and tracks returns from an admin dashboard.

**Highlights**

- **Double-booking is impossible by construction** — a Postgres exclusion constraint on each inventory item's occupied date range (including shipping and cleaning buffer days), not application-level checks.
- **Defense-in-depth data access** — default-deny grants, RLS on every table, column-level grants, and `security definer` functions for the few admin-only reads. See [Security model](#security-model).
- **Database tests that run anywhere** — every migration runs in in-memory Postgres (PGlite), and tests assert what each role can and cannot do.
- **Tiered, per-category pricing** with a cart that is re-priced and re-checked for availability on the server before an order is written.
- Bilingual UI with locale-prefixed routes, customer accounts, order emails, reviews with moderation, sitemap / robots, and a catalog import pipeline that generates thumbnails and content-hashed image names.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth (customers and admin), Storage (product images)
- zod for validation, Vitest for tests (PGlite for database tests)

## Project layout

| Path | Purpose |
|---|---|
| `src/app/[lang]/` | Storefront pages (Chinese at `/styles`, English at `/en/styles`, same components) |
| `src/components/` | Shared UI components |
| `src/config/shop.ts` | Shop name, currency, time zone, contact info, payment handles |
| `src/messages/zh-CN.ts`, `en.ts` | UI strings, one file per language with an identical shape (type-checked) |
| `src/i18n/` | Locale config (URL prefixes, reading the current locale) |
| `src/lib/supabase/` | Database clients and generated types |
| `src/app/[lang]/booking/` | Order detail page `/booking/<order no.>` and its server actions |
| `src/app/admin/` | Admin dashboard (login, orders, inventory, pricing, reviews) |
| `src/proxy.ts` | Routes unprefixed URLs to the Chinese site; refreshes the admin session under `/admin` |
| `supabase/migrations/` | Database migrations (applied in filename order) |
| `catalog/` | Product catalog to import (`npm run import:catalog`) |
| `tests/` | Automated tests |

## Security model

Principle: **deny by default, grant only what is needed.** The migrations first revoke every default privilege from `anon` / `authenticated`, then grant access table by table and column by column. RLS is enabled on every table.

### Three roles

| Role | Who | How it connects |
|---|---|---|
| `anon` | Visitors who are not signed in | Publishable key (browser or server), subject to RLS |
| `authenticated` | Signed-in customers and the admin | Session-bound client, subject to RLS. The admin uses this role too and is distinguished by `is_admin()` |
| `service_role` | Server only | Secret key, bypasses RLS. Used only in `server-only` modules: placing orders, writing reviews, looking up an order by number, rate limiting |

The admin dashboard never uses the secret key: every admin query goes through RLS, so even a bug in admin code cannot read more than an admin is allowed to.

### Who can read and write each table

| Table | Read | Write | Why |
|---|---|---|---|
| `styles` | Everyone: active styles; admin: all | Admin (insert, update; no delete — styles are deactivated instead) | The catalog is public; unreleased styles stay hidden |
| `settings` | **Everyone** (`using (true)`) | Admin (specific columns only) | The storefront needs price tiers and buffer days. **This table holds only public configuration**; anything internal goes in a separate table |
| `inventory_items` | Admin only | Admin only | Contains purchase cost. Visitors only get counts through `get_availability()` |
| `inventory_blocks` | Admin only | Admin only | Internal scheduling (photo shoots, repairs, cleaning) |
| `bookings` | Admin only | Admin can change status / notes only; **nobody can insert or delete directly** | Holds customer names, phone numbers and addresses. Orders go through the server-side `create_order()`, which writes the whole cart in one transaction; an exclusion constraint (`exclude using gist`) guarantees at the database level that an item's occupied dates never overlap |
| `reviews` | Visitors and signed-in users: published reviews, **display columns only** (no `booking_id` or `status`); admin: everything via `admin_list_reviews()` | Admin (`status`, `published_at` only); customers submit through the server | The server verifies the order number and that the order was returned before writing; one review per order |
| `profiles` | Owner | Owner | `user_id = auth.uid()` |
| `admin_users` | Own row only | Nobody through the site (added with `npm run admin:add`) | Only answers "am I an admin?"; other admins are not visible |
| `rate_limits` | Nobody | Nobody | RLS on with no policies — only `service_role` can use it |
| Storage `style-images` | Everyone (public bucket) | Admin only (upload / replace / delete) | Product images must be publicly accessible |

### Other design decisions

- **Row and column privileges together.** RLS controls which rows; sensitive columns are additionally restricted with column-level `grant` (e.g. `reviews` and `settings` only allow updating specific columns).
- **Column grants are per role**, so the admin cannot be given extra columns on its own. Admin-only full reads go through `security definer` functions that check `is_admin()` first and pin `search_path = ''` to prevent object-shadowing attacks.
- **Order numbers are access tokens.** `/booking/SC-XXXXXXXX` opens without signing in, so the number is 8 characters from a 32-symbol alphabet (~40 random bits from `gen_random_uuid()`) and cannot be enumerated. The page selects display fields only — never phone, email or address.
- **Prices are recomputed on the server.** Prices sent by the browser are not trusted; the cart is re-priced from the database when the order is placed, and the database re-validates prices and minimum rental days.
- **Abuse protection.** Rate limits per IP and per email, plus a honeypot field (see [Abuse protection](#abuse-protection)).
- **Tests back every rule.** `tests/db/` runs all migrations in in-memory Postgres (PGlite) and checks, as `anon` / `authenticated` / `service_role`, that allowed actions succeed and everything else is rejected — e.g. visitors cannot read `booking_id`, and regular customers cannot call `admin_list_reviews()`.
- **No secrets in the repo.** `.env*` is git-ignored (only an empty `.env.example` is committed), and the full commit history has been scanned with gitleaks.

## 1. Local setup

1. Install Node.js LTS (20.9 or later): https://nodejs.org
2. Open the project in your editor, open a terminal and run:

   ```bash
   npm install
   ```

3. Run the tests to confirm the environment works:

   ```bash
   npm test
   ```

## 2. Configure Supabase

### 1. Create a project

1. Go to https://supabase.com, click **Start your project**, and sign up with GitHub or email.
2. Click **New project**:
   - **Name**: `sunny-closet`
   - **Database Password**: click **Generate a password** and save it in your password manager (the app doesn't use it day to day, but keep it safe and never share it).
   - **Region**: the one closest to your customers, e.g. **East US (North Virginia)**.
3. Click **Create new project** and wait 1–2 minutes until it is ready.

### 2. Fill in the keys

1. Open `.env.local` in the project root (if it doesn't exist, copy `.env.example` and rename it to `.env.local`).
2. In Supabase, click the green **Connect** button. The **Framework** tab shows `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; copy them into `.env.local`.
3. Open **Project Settings → API Keys**, reveal and copy the key under **Secret keys** (starts with `sb_secret_`), and paste it after `SUPABASE_SECRET_KEY=`.
4. Click **Connect → Direct (Connection string)**, copy the address starting with `postgresql://`, paste it after `SUPABASE_DB_URL=`, and replace `[YOUR-PASSWORD]` (including the brackets) with your database password.
   - Forgot the password: **Project Settings → Database → Reset database password**. Letters and digits only is easiest.
   - If migrations later fail with a network / host error, use the **Session pooler** address from the same page instead.
5. Save the file. No spaces around `=` and no quotes.

> ⚠️ `.env.local` is excluded by `.gitignore` and never committed. Don't paste its contents into chats, screenshots or anywhere public.

### 3. Create tables and import products

```bash
npm run db:setup
```

This applies the files in `supabase/migrations/` in order. Already-applied migrations are skipped, so it is safe to run again.

Then import the products (images are uploaded to Supabase Storage automatically):

```bash
npm run import:catalog
```

> Alternative: in Supabase's **SQL Editor**, create a new query and paste and run the migration files in filename order.

### 4. Verify the configuration

```bash
npm run check:supabase
```

All ✅ means the database and keys are configured correctly.

## 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000. Press `Ctrl + C` to stop.

## 4. Ordering flow and admin dashboard

### How customers order

1. On an outfit / gloves / helmet cover page, pick a size and dates, and click "Add to cart" once it shows as available. Up to 10 items; the cart icon shows the count.
   The cart lives in the customer's browser (`src/lib/cart.ts`), so no account is required.
2. The cart page (`/cart`) shows each item's rental fee, deposit and the order total. The customer enters name, phone, email (WeChat optional) and pickup or shipping (with an address), then submits. **No payment at this point.**
   Opening the cart re-checks prices and availability (`/api/cart`); unavailable items or items that can't ship are flagged and must be resolved before submitting.
3. The whole cart becomes one order with one order number, in "pending" status, and the items are reserved immediately (the database prevents overbooking; if any item is unavailable, the whole order fails).
   The first item is the main order and every other item is a child order (`SC-XXXXXXXX-1`, …, `cart_item = true`). The admin sees them on one order card and their status follows the main order.
   The customer is redirected to `/booking/SC-XXXXXXXX` to track progress; that page never shows phone, email or address.
4. After the admin clicks "Confirm" (确认预订), the customer's order page shows the payment methods (Zelle / Venmo) and the amount due.

### Set your own payment details

In `src/config/shop.ts`, replace `zelle` and `venmo` under `payment` with your own handles. Customers only see them after you confirm the order.

> After receiving a Zelle / Venmo payment, confirm it in your bank or Venmo app before releasing the items. Zelle transfers can't be reversed and have no purchase protection.

### Create the admin account (one time)

1. In Supabase, go to **Authentication → Users → Add user → Create new user**, enter your email and a strong password, and check **Auto Confirm User**.
2. Run (with your own email):

   ```bash
   npm run admin:add -- you@example.com
   ```

3. Sign in at http://localhost:3000/admin/login.

### What the admin dashboard does

- Orders are grouped as pending / confirmed / picked up / returned / closed, with counts.
- Status moves forward only: pending → confirmed → picked up → returned. Pending orders can be rejected; pending and confirmed orders can be cancelled. Rejecting or cancelling frees the inventory immediately.
- Every order has private internal notes.
- The order list shows the latest 500 orders.
- **Inventory** (`/admin/inventory`): every style (outfits / helmet covers / gloves) with each item's current status and next booking. Edit a style's Chinese and English names, deposit, custom pricing, sort order and visibility; add an item; mark an item unavailable; block dates manually (photo shoots, repairs, cleaning).
- **Pricing** (`/admin/pricing`): edit the three shop-wide price tables (full set / jacket only / pants only) and the minimum shipping days. Changes apply immediately; existing orders keep their prices.
- **Helmet covers**: add helmet covers and edit their tier and add-on price.
- Only accounts in `admin_users` can enter the dashboard; customer accounts are rejected.
- The dashboard UI is Chinese only.

### Customer accounts

- Customers can sign up (`/signup`), sign in (`/login`) and reset their password (`/forgot-password`). The person icon in the header opens "My account" (`/account`).
- "My account" stores name, phone and WeChat (prefilled at checkout) and lists the customer's orders (orders placed while signed in, plus orders placed with the same confirmed email).
- **Set up email sending in Supabase before launch.** Sign-up confirmation and password reset need email, and Supabase's built-in sender only delivers to project members.
  The free option is the shop's Gmail:
  1. In the shop's Google account → Security, turn on **2-Step Verification**, then search for **App passwords**, create one named Supabase, and note the 16-character password.
  2. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
     Sender email = shop Gmail, Sender name = `Sunny Closet`, Host `smtp.gmail.com`, Port `465`,
     Username = shop Gmail, Password = the 16-character app password.
  3. On the same page under **Templates**, paste `supabase/email-templates/confirm-signup.html` and `reset-password.html` into
     "Confirm signup" and "Reset Password" (suggested subjects are in the comment at the top of each file). The emails are in English and their links work when opened on another device.
  4. **Authentication → URL Configuration**: set Site URL to the site address (`http://localhost:3000` locally, the production URL after launch),
     and add `http://localhost:3000/**` and `https://your-domain/**` to Redirect URLs.
  Gmail is free and sends roughly 500 emails a day, which is plenty for a small shop. At higher volume, switch to a service like Resend (requires your own domain).

### Order emails

- **New order** → email to the owner with every item, dates, pickup / shipping address, customer contact info and a dashboard link; replying goes straight to the customer.
- **Admin clicks "Confirm"** → email to the customer with the amount due, payment methods (Zelle / Venmo from `src/config/shop.ts`) and the order link.
- Emails are in English and sent from the shop Gmail (same account and app password as above). Set these in `.env.local` (and in Vercel environment variables in production):
  `SMTP_USER` (shop Gmail), `SMTP_PASS` (16-character app password); set `ADMIN_NOTIFY_EMAIL` to send new-order alerts somewhere else.
- If they're not set, ordering and status changes work as usual and no email is sent (the server log says the send was skipped). A failed send never affects the order.
- Email content is in `src/lib/email/templates.ts`; sending is in `src/lib/email/send.ts`.

### Launch: deployment, domain, analytics

1. **Deploy to Vercel**: sign in to [vercel.com](https://vercel.com) with GitHub → Add New Project → pick the `sunny-closet` repo → Deploy.
   Every push to `main` redeploys automatically.
2. **Environment variables** (Vercel project → Settings → Environment Variables): add
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SMTP_USER` and `SMTP_PASS` from `.env.local`
   (`SUPABASE_DB_URL` is only for running migrations locally), plus `NEXT_PUBLIC_SITE_URL` = your production URL. Redeploy once for the changes to take effect.
3. **Domain**: buy a domain (Namecheap, GoDaddy, Squarespace, …) → Vercel project → Settings → Domains → add it,
   then add the DNS records it asks for at your registrar. It takes minutes to hours; Vercel sets up HTTPS automatically.
4. **Supabase**: under Authentication → URL Configuration, change Site URL to the production URL and add `https://your-domain/**` to Redirect URLs.
5. **Analytics**: Vercel project → Analytics → Enable, to see daily visitors, top pages and referrers.
   No cookies and no consent banner; admin pages and local development are not tracked.
6. **Search engines**: the site serves `/sitemap.xml` (all sections and active products, both languages) and `/robots.txt` (admin, cart, orders and account are excluded).
   To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://your-domain/sitemap.xml`.

### Abuse protection

At most 6 submissions per network per 10 minutes and 3 per email per hour. The form also has a hidden field that humans never see; bots that fill it in are rejected.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build (check before deploying) |
| `npm test` | Run all automated tests |
| `npm run db:setup` | Apply migrations to Supabase |
| `npm run import:catalog` | Import products from `catalog/` (existing ones are skipped; add `-- --update` to overwrite) |
| `npm run check:supabase` | Verify the Supabase configuration |
| `npm run admin:add -- <email>` | Make an existing Supabase user an admin |

## How products are organized

- **One outfit = one "style" = one product page.** Every outfit is unique, so each gets its own style with one inventory item (size and code). When there is only one size, the page simply shows "Size M" with nothing to choose.
- Each style has a **brand** (optional, e.g. ISEE MIGGA) and a **category**: set / one-piece / jacket / pants. Listing pages can filter by category, and a brand filter appears automatically for brands in use.
- The catalog lives in `catalog/*.json`. `npm run import:catalog` reads the images, compresses them, uploads them to Supabase Storage, and writes the styles and inventory.
- Styles with a `sourceUrl` show "Images and specs: <brand> official site" at the bottom of the page, linking to the original product; without it nothing is shown.

### Adding a new style (with your own photos or screenshots)

1. Create `catalog/images/<slug>/` (lowercase letters and hyphens, e.g. `pink-bow-ski-suit`) and put the images in it.
   Images are sorted by filename and **the first one is the cover**; name them `1.jpg`, `2.jpg`, … (`10` sorts after `9`).
   JPG / PNG / WebP / HEIC (iPhone photos) all work. The script auto-rotates and compresses them to JPGs with a long edge of at most 2000px.
   Crop phone status bars and shopping-app buttons out of screenshots first.
2. Add an entry to any `.json` file in `catalog/` (or create a new one such as `catalog/other.json` containing a `[ … ]` array):

   ```json
   {
     "slug": "pink-bow-ski-suit",
     "brand": "Brand name",
     "category": "suit",
     "name": "粉色蝴蝶结滑雪套装",
     "nameEn": "Pink Bow Ski Suit",
     "dailyPrice": 49,
     "deposit": 200,
     "sortOrder": 200,
     "items": [{ "code": "SC020", "size": "M" }],
     "description": "一句话介绍颜色和款式。\n\n## 设计细节\n- ……",
     "descriptionEn": "One sentence about the color and style.\n\n## Design details\n- …"
   }
   ```

   Without `images`, the files in `catalog/images/<slug>/` are used; you can also set `"images": ["images/pink-bow-ski-suit/cover.jpg", "https://…"]` to control the order, mixing local paths and URLs.
   `category` is one of `suit`, `one_piece`, `jacket`, `pants`; inventory `code`s must be unique.
3. Run `npm run import:catalog`. After changing images or text later, run `npm run import:catalog -- --update`.

### Writing product descriptions

`description` uses two simple rules, and the product page turns them into collapsible sections:

```text
Official name: …            ← text before the first heading is shown as the product description
One sentence about the color and style.

## Fabric & technology       ← a line starting with "## " starts a new section with that title
- Waterproof rating >20,000 mm H₂O   ← a line starting with "- " is a list item
```

#### ISEE outfit template (when there is no official product page)

ISEE MIGGA outfits share almost the same fabric and details, kept in `catalog/templates/isee-migga.md`. For a new outfit:

1. Put the photos in `catalog/images/<slug>/` (sorted by filename, first is the cover);
2. Add an entry with `"template": "isee-migga"`, and write only this outfit's look in `description` / `descriptionEn` (a sentence or two in each language); leave out `sourceUrl`;
3. Run `npm run import:catalog`.

The import appends the template's "Fabric & technology" and "Design details" sections (English uses `isee-migga.en.md`). See `catalog/templates/isee-migga.example.json`. When an outfit's specs differ, skip `template` and write the full description instead.

### Chinese and English

The site has a Chinese version (`/styles`) and an English version (`/en/styles`), switched with "EN / 中文" in the header. Add content in both languages:

- **Products**: `name` / `description` are Chinese and `nameEn` / `descriptionEn` are English; both are required (tests catch missing English and Chinese text leaking into English). For text-only changes run `npm run import:catalog -- --text`, which skips re-uploading images.
- **Helmet covers added in the dashboard**: the form has English name and description fields.
- **UI strings**: add to `src/messages/zh-CN.ts` and the same place in `src/messages/en.ts` (the type checker flags anything missing).
- **New color names** (Chinese color names in inventory sizes, e.g. 「芭比玫红 · S」): add the English name to `sizeNames` in `en.ts`.
- The **admin dashboard** is Chinese only.

### Replacing images

- **Product images**: portrait 3:5 (e.g. 930×1550 or 1200×2000); the first image is the cover.

## Helmet covers

- Helmet covers are styles too (`styles.category = 'helmet_cover'`) and share the same inventory, scheduling and overbooking constraints as outfits.
- **Admin**: sign in at `/admin` → "Helmet covers" (头盔套) to add / edit, upload images, set classic / premium tier, prices, replacement value and
  tags, mark items available / unavailable, see upcoming bookings and block dates.
- **Standalone rental**: by default $15 for 1 day, $20 for 2–3 days, $25 for 4–7 days (a flat price for the whole rental, not per day), stored in `styles.rental_prices_cents`.
- **Add-on to an outfit**: classic +$8, premium +$12, flat for the whole rental, chosen under "Complete the Look ✨" on outfit pages.
  The add-on is a child order (`bookings.parent_booking_id`) with the same dates as the outfit, and follows the outfit order's status automatically.
  Currently at most one add-on per outfit (`MAX_ADD_ONS_PER_OUTFIT`).
- **Inventory status** (available / booked / rented out / returned / cleaning / unavailable) is derived from orders and blocked dates; see `src/lib/inventory/status.ts`.
- Bulk import via `catalog/*.json` also works: set `category` to `"helmet_cover"`, add `tier` (`regular` / `premium`) and `tags`; prices default if omitted.

## Business rules at a glance

- **Tiered pricing** by category, plus a deposit:

  | Days | Jacket only | Pants only | Full set (set / one-piece) | Crystal set |
  |---|---|---|---|---|
  | 1 | $35 | $25 | $49 | $58 |
  | 2 | $50 | $35 | $89 | $108 |
  | 3 | $60 | $45 | $99 | $118 |
  | 4 | $70 | $55 | $109 | $128 |
  | 5 | $80 | $65 | $119 | $138 |
  | 6 | $85 | $70 | $129 | $158 |
  | 7–10 | $90 | $75 | $139 | $168 |

  The price tables live in `settings` (in cents; item n = n days, longer rentals use the last tier):
  full set `rental_prices_cents`, jacket `jacket_prices_cents`, pants `pants_prices_cents`.
  They can be edited in the dashboard or with SQL, e.g.
  `update public.settings set pants_prices_cents = array[2500,3500,4500,5500,6500,7000,7500] where id;`.
  Jackets and pants also appear on the **Mix & Match** page (`/mix-and-match`). Helmet covers and gloves have their own price tables.
- **Deposit**: $200 for a full set, $150 for a jacket, $100 for pants (defaults when `deposit` is omitted in the catalog).
- **Maximum rental** 10 days (`settings.max_rental_days`). **Minimum rental**: 1 day for local pickup, 2 days for shipping (`settings.shipping_min_days`).
  The database re-validates prices and minimum days when the order is placed.
- **Shipping**:
  - Contiguous 48 states + Washington, DC only (no Alaska, Hawaii or territories).
  - **Free shipping** when the order has a full set (suit / one-piece) rented for 2+ days, or rental + add-ons reach $99 (deposit excluded). Otherwise one fee per order: $15, or $25 for far states (the list lives in `shop.shipping.farStates`). The rule is one pure function (`shippingFeeCents` in `src/lib/shipping.ts`) shared by the cart page and the server action; the fee is stored once on the main order (`bookings.shipping_cents`), and order total = rental + deposit + shipping.
  - Shipped items have a 2-day minimum (editable under Pricing); local pickup in Ithaca starts at 1 day. Shipped orders need about 7 days' notice (`shop.shipping.orderAheadDays` in `src/config/shop.ts`).
  - Shipped items go out together, so every item in the cart must have the same ski dates (pickup orders can differ).
  - The shipping address is split into street, city, state (dropdown, 48 states + DC only) and ZIP, with state and ZIP validated; it is stored as one line in the order's `shipping_address`.
  - Day counts in copy (style pages, checkout, rental info page) are read from settings and config, so they stay in sync.
- **Only ski days are billed**: customers pick their first and last ski day; rental days = last − first + 1.
- **Pickup / return / transit days are free but occupy inventory** (lead / tail days in `settings`, adjustable to match real logistics):
  - Local pickup: pick up the evening before, return by noon the day after the last ski day → 1 day before, 1 day after (`pickup_lead_days` / `pickup_tail_days`).
  - Shipping: ships 3 days ahead; the customer ships it back the next day and return transit counts as 3 days → 3 days before, 4 days after (`shipping_lead_days` / `shipping_tail_days`).
  - A cleaning buffer follows (`buffer_days`, default 1). Each order records the values in effect when it was placed, so changing settings never affects existing orders.
  - Example: skiing Saturday and Sunday with local pickup → pick up Friday evening, return by Monday noon, clean Tuesday, billed as 2 days; the next customer can ski as early as Thursday (picking up Wednesday evening).
  - To change: `update public.settings set shipping_tail_days = 5 where id;`
- Pending / confirmed / picked-up / returned orders occupy inventory; rejected / cancelled orders release it.
- Overbooking is prevented by the exclusion constraint `bookings_no_overlap`, so even concurrent submissions can never be assigned the same item.
