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
| `src/app/[lang]/` | Storefront pages (English at `/styles`, Chinese at `/zh/styles`, same components) |
| `src/components/` | Shared UI components |
| `src/config/shop.ts` | Shop name, currency, time zone, contact info, payment handles |
| `src/messages/zh-CN.ts`, `en.ts` | UI strings, one file per language with an identical shape (type-checked) |
| `src/i18n/` | Locale config (URL prefixes, reading the current locale) |
| `src/lib/supabase/` | Database clients and generated types |
| `src/app/[lang]/booking/` | Order detail page `/booking/<order no.>` and its server actions |
| `src/app/admin/` | Admin dashboard (login, orders, inventory, pricing, reviews) |
| `src/proxy.ts` | Routes unprefixed URLs to the English site; refreshes the admin session under `/admin` |
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
| `card_charges` | Admin only | Server only, after checking the admin | Charges made later against the card a customer paid with (damage, loss, late return), failed attempts included |
| `profiles` | Owner | Owner | `user_id = auth.uid()` |
| `admin_users` | Own row only | Nobody through the site (added with `npm run admin:add`) | Only answers "am I an admin?"; other admins are not visible |
| `rate_limits` | Nobody | Nobody | RLS on with no policies — only `service_role` can use it |
| Storage `style-images` | Everyone (public bucket) | Admin only (upload / replace / delete) | Product images must be publicly accessible |

### Other design decisions

- **Row and column privileges together.** RLS controls which rows; sensitive columns are additionally restricted with column-level `grant` (e.g. `reviews` and `settings` only allow updating specific columns).
- **Column grants are per role**, so the admin cannot be given extra columns on its own. Admin-only full reads go through `security definer` functions that check `is_admin()` first and pin `search_path = ''` to prevent object-shadowing attacks.
- **Order pages need the customer, not just the number.** `/booking/SC-XXXXXXXX` opens only for the browser that placed the order (a signed, httpOnly cookie, HMAC keyed from the server secret), the account that placed it or whose confirmed email matches the order, or the admin (`src/lib/booking/order-access.ts`). A forwarded link alone shows a sign-in prompt; guests sign up or sign in with their order email. Paying, saving a card and reviewing check the same rule. The page never shows phone, email or address.
- **Prices are recomputed on the server.** Prices sent by the browser are not trusted; the cart is re-priced from the database when the order is placed, and the database re-validates prices and minimum rental days.
- **Abuse protection.** Rate limits per IP and per email, plus a honeypot field (see [Abuse protection](#abuse-protection)).
- **Inventory is locked before it's checked.** Placing an order locks every piece it could take (in id order, so two orders never wait on each other), and adding a manual block (`add_inventory_block`) locks the piece too, so an order and a block on the same piece can't both go through. `npm run test:concurrency` proves it against a real PostgreSQL server with two connections racing (`tests/concurrency/`).
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
2. The cart page (`/cart`) shows each item's rental fee and the order total. The customer enters name, phone, email (WeChat optional) and pickup or shipping (with an address), then submits. With Stripe configured they go straight to card payment (see below); otherwise **no payment at this point.**
   Opening the cart re-checks prices and availability (`/api/cart`, at most 120 requests per network per 10 minutes); unavailable items or items that can't ship are flagged and must be resolved before submitting. Availability is checked for the whole cart at once in the database (`cart_availability`), allocating pieces the way an order does: overlapping dates, sets sharing pieces with single items, and add-on helmet covers and gloves sharing stock with standalone ones all count. It only reads; submitting still checks for real in one transaction.
3. The whole cart becomes one order with one order number, in "pending" status, and the items are reserved immediately (the database prevents overbooking; if any item is unavailable, the whole order fails).
   The first item is the main order and every other item is a child order (`SC-XXXXXXXX-1`, …, `cart_item = true`). The admin sees them on one order card and their status follows the main order.
   The customer is redirected to `/booking/SC-XXXXXXXX` to track progress. Only that browser, the customer's account (or one with the order's email) and the admin can open it; it never shows phone, email or address.
4. With Stripe, a successful payment confirms the order automatically. Without it, the admin clicks "Confirm" (确认预订) and the customer's order page shows the payment methods (Zelle / Venmo) and the amount due.

### Set your own payment details

Only used without Stripe: in `src/config/shop.ts`, replace `zelle` and `venmo` under `payment` with your own handles. Customers only see them after you confirm the order.

> After receiving a Zelle / Venmo payment, confirm it in your bank or Venmo app before releasing the items. Zelle transfers can't be reversed and have no purchase protection.

### Card payments with Stripe (no deposit)

With `STRIPE_SECRET_KEY` set, customers pay by card when they order and there is no deposit:

- **Checkout**: submitting the cart creates the order (dates reserved, status "pending") and sends the customer to a Stripe-hosted Checkout page for rental + add-ons + shipping. The card number never touches this site.
- **Confirmation**: when Stripe reports the payment (the return URL `/api/stripe/checkout-return` and the webhook both call `completeCheckout`, which is safe to run twice), the order moves to "confirmed" and the owner and customer get their emails. The amount, card brand and last 4 digits are stored on the order.
- **One payment page per order.** Before a Checkout session is created, the database hands out the order's payment attempt (`claim_checkout_attempt`, under a row lock). The attempt key is the Stripe idempotency key and goes into the session's metadata, so two clicks at once land on the same page, "Pay now" reopens the page that's still open, and a session that Stripe created but the site failed to save can still be found (through the order's Stripe customer). A payment that lands on a cancelled order, or a second payment, is kept as a **refund due** on the order and the owner is emailed; the order card shows it until the admin marks it refunded.
- **Unpaid orders** hold their dates for 30 minutes (the session's expiry). An order is only cancelled when Stripe says for sure nothing can be paid: the webhook for the current attempt's expired session, or the **payment sweep** (`/api/cron/payments`, every hour from the Netlify scheduled function `netlify/functions/payment-sweep.mts`, protected by `CRON_SECRET`), which confirms paid sessions and cancels expired or never-created ones. A request that failed without an answer (timeout) keeps the order and is retried with the same key. The order page runs the same check when opened, so this also works locally without the webhook. Rules: `src/lib/payments/checkout.ts`.
- **Damage, loss, late returns**: the card is saved with `setup_future_usage: off_session`. On each order card the admin can enter an amount and reason and click "从卡里扣款"; the server records the charge first (status "pending", with its idempotency key), then charges the card off-session. A clear decline is "failed"; no clear answer (network error) is "unknown", and the only next step is "retry the same charge" with the same key, which can't charge twice (after 24 hours the charge is looked up at Stripe by its id instead). An order can't start a new charge while one is unknown. Rules: `src/lib/payments/card-charge.ts`. The customer agrees to this on the Stripe page. What can be charged is set out in the rental terms (`/terms`, text in `src/messages/*.ts` → `terms`; late fees and other amounts from `src/config/shop.ts`): late returns (per day: $25 per set or one-piece, $20 per single jacket or pants, $10 per accessory), extra cleaning, repairs, and retail price for items lost or beyond repair.
- **Pay in person** (local pickup only; shipped orders always pay by card), two options chosen at checkout:
  - **Card on file, no deposit** (`in_person_card`): the customer saves a card on a Stripe Checkout page in setup mode (nothing charged); the order is confirmed once the card is saved, and the rental is paid at pickup.
  - **Cash deposit** (`in_person`): rental plus a $200 deposit (`shop.payment.inPersonDepositCents`, stored per order in `cash_deposit_cents`) paid at pickup, the deposit returned in person. Confirmed as soon as it's submitted.

  Either way the order card shows the amount due and the admin clicks "标记已收款" once the rental is paid.
- **Shipping on short notice** (first ski day less than `shop.shipping.orderAheadDays` = 7 days away, but at least the 3 shipping lead days): the customer must choose at checkout between
  - **rush shipping** (USPS Priority Mail, +$15, or +$25 for far states, charged even when shipping is free; stored in `rush_fee_cents` and included in `shipping_cents`), which goes through like any order, or
  - **no rush, wait for the owner**: the customer pays as usual, but paying does **not** confirm the order. It stays pending with `acceptance_status = 'awaiting'` (holding its dates, skipped by the payment sweep) until the admin clicks "接单" (confirmed, confirmation email) or "拒单" (cancelled, the payment recorded as a refund due, the customer emailed about the full refund). The sweep reminds the owner after 12 hours and declines it automatically after 24 (`src/lib/booking/acceptance.ts`).
  
  The order and its short-notice choice are written in one transaction (`place_order`). Local pickup has no notice rule beyond availability.
- **Refunds** (cancellations) are made in the Stripe Dashboard → Payments. Orders that owe a refund (declined short-notice orders, payments after cancelling, second payments) show it on the order card until it's marked refunded, by the admin or by the `charge.refunded` webhook once Stripe's refunded total covers it (`src/lib/payments/refunds.ts`).
- **Setup**: set `STRIPE_SECRET_KEY`, and in production `CRON_SECRET` (any long random string) for the sweep. Add a webhook at Stripe → Developers → Webhooks for `https://your-domain/api/stripe/webhook` with `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed` and `charge.refunded`, and set its signing secret as `STRIPE_WEBHOOK_SECRET`.
- Without `STRIPE_SECRET_KEY` the site falls back to the manual flow: the admin confirms each order and the customer pays by Zelle / Venmo.
- Code: `src/lib/stripe.ts`, `src/app/api/stripe/`, `src/components/admin-order-payment.tsx`.

### Create the admin account (one time)

1. In Supabase, go to **Authentication → Users → Add user → Create new user**, enter your email and a strong password, and check **Auto Confirm User**.
2. Run (with your own email):

   ```bash
   npm run admin:add -- you@example.com
   ```

3. Sign in at http://localhost:3000/admin/login.

### What the admin dashboard does

- Orders are grouped as pending / confirmed / picked up / returned / closed, with counts.
- Status moves forward only: pending → confirmed → picked up → returned. Pending orders can be rejected; pending and confirmed orders can be cancelled. Orders waiting on Stripe (pay by card, or card on file) have no manual "Confirm": they confirm themselves once paid or the card is saved, and expire otherwise. Rejecting or cancelling frees the inventory immediately.
- Every order has private internal notes.
- The order list is filtered, counted and paged (50 per page) in the database, so an old pending or picked-up order is never pushed out by newer ones (`src/lib/admin/orders.ts`).
- **Late returns**: a picked-up order that isn't marked returned by its return day keeps holding its piece, rolling forward to "today + N days" every day (N = `settings.overdue_hold_days`, default 7, editable under Pricing), so the piece is never rented out again on its own; only "returned" releases it. The admin can enter an expected return date on the order card instead (holds until then plus cleaning). If the extended hold runs into an order already booked on that piece, nothing is changed: the order list shows the conflict in red and the sweep emails the owner once per affected order. The rule is applied wherever availability is checked (`booking_hold_range` in the database, mirrored for display in `src/lib/booking/overdue.ts`), under the same row locks as ordering.
- **Inventory** (`/admin/inventory`): every style (outfits / helmet covers / gloves) with each item's current status and next booking. Edit a style's Chinese and English names, custom pricing, sort order and visibility; add an item; mark an item unavailable; block dates manually (photo shoots, repairs, cleaning).
- **Condition notes**: every piece is guaranteed to be fully functional, and any minor flaw is disclosed before booking: a single item can carry a note (Chinese + English) and close-up photos of flaws worth disclosing. The product page then shows a collapsed "Condition notes" section, kept apart from the model photos (for a set, its pieces' notes). At checkout every cart item that could come with a noted piece needs a ticked "I've seen the condition notes" box, which the server re-checks against the current notes. The checkbox carries a fingerprint of the notes the customer saw, so checkout refuses it if they changed since. The database copies the exact piece's note and photos onto the booking in the same transaction that assigns the piece (`condition_snapshot`, `condition_acknowledged_at`), and refuses the order if a noted piece was assigned to an item the customer didn't confirm; the admin order card shows it, so later edits don't change what the customer agreed to. The rental terms say disclosed flaws are never charged as damage. `inventory_items` stays admin-only (it holds purchase prices); the storefront reads only the condition columns, server side (`src/lib/condition.ts`).
- **Pricing** (`/admin/pricing`): edit the three shop-wide price tables (full set / jacket only / pants only), the minimum shipping days and how long overdue pieces stay held. Changes apply immediately; existing orders keep their prices.
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
- **Order confirmed** → email to the customer. Paid by card: the amount paid and the card. Manual flow (admin clicks "Confirm"): the amount due, payment methods (Zelle / Venmo from `src/config/shop.ts`) and the order link.
- Emails are in English and sent from the shop Gmail (same account and app password as above). Set these in `.env.local` (and in the Netlify environment variables in production):
  `SMTP_USER` (shop Gmail), `SMTP_PASS` (16-character app password); set `ADMIN_NOTIFY_EMAIL` to send new-order alerts somewhere else.
- If they're not set, ordering and status changes work as usual and no email is sent. A failed send never affects the order.
- **No email is lost silently.** Every order email is logged in `email_log` before it is sent and marked sent or failed after. The payment sweep retries failed ones (and ones cut off mid-send) up to 3 attempts; whatever still failed is listed at the top of the admin dashboard with the reason, a "重发" (resend) button and a "不用发了" (dismiss) button (`src/lib/email/delivery.ts`).
- Email content is in `src/lib/email/templates.ts`; sending is in `src/lib/email/send.ts`.

### Launch: deployment and domain

1. **Deploy to Netlify** (free plan): sign in to [netlify.com](https://www.netlify.com) with GitHub → Add new project → Import an existing project → pick the `sunny-closet` repo.
   Netlify detects Next.js and fills in the build settings. Every push to `main` redeploys automatically.
2. **Environment variables** (Project configuration → Environment variables): add
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SMTP_USER` and `SMTP_PASS` from `.env.local`
   (`SUPABASE_DB_URL` is only for running migrations locally), plus `NEXT_PUBLIC_SITE_URL` = your production URL (required: links in sign-up, password-reset and order emails are built from it, never from request headers, and production refuses to send them without it) and, optionally, `NEXT_PUBLIC_GA_ID` (a Google Analytics 4 measurement ID; storefront pages load analytics only when it is set). Redeploy once for the changes to take effect.
3. **Domain**: Netlify project → Domain management → add the domain, then at your registrar point the apex `A` record to Netlify's load balancer
   and `www` (`CNAME`) to `<project>.netlify.app`. Netlify sets up HTTPS automatically once DNS resolves.
4. **Supabase**: under Authentication → URL Configuration, set Site URL to the same production URL as `NEXT_PUBLIC_SITE_URL` (one form: with or without `www`, the other redirecting to it), and list only the exact callback URLs under Redirect URLs: `https://your-domain/api/auth/callback` and, for local development, `http://localhost:3000/api/auth/callback`. No wildcards (`**`), preview-deploy URLs or other domains.
5. **Keep-alive**: free Supabase projects pause after 7 idle days; `.github/workflows/keep-supabase-awake.yml` pings it every 3 days
   (needs the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repository secrets).
6. **Search engines**: the site serves `/sitemap.xml` (all sections and active products, both languages) and `/robots.txt` (admin, cart, orders and account are excluded).
   To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://your-domain/sitemap.xml`.

### Abuse protection

At most 6 submissions per network per 10 minutes and 3 per email per hour; the cart check (`/api/cart`) allows 120 requests per network per 10 minutes. The form also has a hidden field that humans never see; bots that fill it in are rejected.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build (check before deploying) |
| `npm test` | Run all automated tests |
| `npm run test:concurrency` | Race tests on a throwaway local PostgreSQL server (needs PostgreSQL installed) |
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

The site has an English version (`/styles`, the default) and a Chinese version (`/zh/styles`), switched with "EN / 中文" in the header. Add content in both languages:

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
- **Gloves as add-ons**: gloves with an add-on price (`styles.addon_price_cents`, $10, Crystal $15, editable on the gloves form) can be added to an outfit the same way, in a chosen color / size, under the helmet covers.
- **One of each per outfit**: an outfit item takes at most one helmet cover and one pair of gloves as add-ons, and across the order there are at most as many of each as there are outfits (sets and one-pieces, plus tops paired with pants; a top or pants alone isn't one). Extra accessories are rented on their own at their usual price. Rules: `src/lib/add-ons.ts`, enforced again in `create_order` (`addon_limit`).
- **Inventory status** (available / booked / rented out / returned / cleaning / unavailable) is derived from orders and blocked dates; see `src/lib/inventory/status.ts`.
- Bulk import via `catalog/*.json` also works: set `category` to `"helmet_cover"`, add `tier` (`regular` / `premium`) and `tags`; prices default if omitted.

## Business rules at a glance

- **Tiered pricing** by category, with **no deposit** (serious damage or loss is charged at retail price to the saved card):

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
- **Maximum rental** 10 days (`settings.max_rental_days`). **Minimum rental**: 1 day for local pickup, 2 days for shipping (`settings.shipping_min_days`).
  The database re-validates prices and minimum days when the order is placed.
- **Shipping**:
  - Contiguous 48 states + Washington, DC only (no Alaska, Hawaii or territories).
  - **Free shipping** when rental + add-ons reach $99, or when the order makes a **full look**: a top, pants, a helmet cover and gloves (a set or one-piece counts as top and pants; mix-and-match and standalone accessories count too). Free-shipping orders to far states still pay $15. Otherwise one fee per order: $15, or $30 for far states (the list lives in `shop.shipping.farStates`). When the clothes are complete and only a helmet cover or the gloves is missing, the cart shows a small optional "full look ships free" tip. The rule is one pure function (`shippingFeeCents` in `src/lib/shipping.ts`) shared by the cart page and the server action; the fee is stored once on the main order (`bookings.shipping_cents`), and order total = rental + shipping (the `deposit_cents` columns remain and are always 0).
  - Shipped items have a 2-day minimum (editable under Pricing); local pickup in Ithaca starts at 1 day. Shipped orders should give about 7 days' notice (`shop.shipping.orderAheadDays` in `src/config/shop.ts`); sooner than that (but at least 3 days) takes rush shipping or the owner's approval (see "Shipping on short notice" above).
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
