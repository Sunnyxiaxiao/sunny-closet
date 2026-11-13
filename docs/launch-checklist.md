# Launch readiness

Target window: November 9–15, 2026. Audit date: November 7, 2026.
Production deployment requires Sunny's approval. Passing local checks does not mean the changes are live.

## Resume point — November 7, 2026

When Sunny says “回来处理上线待办” (or asks to resume launch preparation), read this file and resume with the next question below. Do not restart the already agreed policy discussion. This is a saved checkpoint, not a scheduled reminder or deployment authorization.

**Next discussion:** cancellation cutoff time. First check comparable rental businesses, then ask whether the 7-day / 48-hour thresholds should be calculated from 00:00 on the first rental day in America/New_York (Ithaca time). This has not been approved. Shipped-order precedence and fit / delivery-delay exceptions have already been clarified.

Working style: research direct competitors' official policies before proposing a business-policy choice; distinguish sourced practice from recommendations. Discuss one issue at a time, implement the agreed choice, then prompt the next issue. Routine code and database fixes are authorized; ask before deploying to Netlify. Never print or commit secrets.

### Claude handoff and code provenance

- Verified Git HEAD: `54d033a` — gloves add-ons, full-look shipping, order / payment / email hardening. The checkout contains additional uncommitted changes; this conversation's changes have not been committed or pushed.
- Claude reports two groups of uncommitted work. A Git diff does not record who authored individual uncommitted lines. Inspect and stage by feature before committing; do not assume all current changes belong to one agent or blindly stage everything.
- Codex work since that baseline includes atomic checkout migration 31, condition acknowledgment checks, public-link prefetch suppression, shared short-lived catalog / settings caches with admin invalidation, combined availability queries, replacement values, bilingual policy corrections, and this checklist.
- Migration 31 has been applied to the shared database. Complete sets / one-pieces have been set to ISEE MIGGA $330 (28 styles) and other brands $300 (22 styles); catalog files also carry these values. Separate jackets, pants and accessories are intentionally unchanged.
- Local code changes have NOT been deployed. Do not confuse applied database data with deployed frontend code.

### Handoff items still requiring verification

- Before deployment, set / verify Netlify `CRON_SECRET` and add / verify Stripe `charge.refunded` on the production webhook.
- Claude reports approximately 149 Netlify credits remaining; this balance has not been independently rechecked. Budget 15 credits for a production deploy and get approval first.
- Gloves add-on selection has not yet been clicked through in a real browser. This remains an explicit test before launch.
- Selling socks / keychains is not implemented; it is separate from the rental launch work.
- Catalog caching was pending in Claude's handoff. Codex has implemented it locally (60-second refresh, 300-second expiration, public data only), plus link-prefetch and availability-query reductions. It still needs production-build validation and post-deployment measurement; no particular credit savings are guaranteed.
- Latest broad suite: 430 tests passed, 6 real-database concurrency tests skipped. Subsequent copy changes passed focused tests, TypeScript and lint checks. Full production build remains unverified because the execution environment prevented Turbopack's compilation subprocess from binding a port.

### November 11 production deploy (approved by Sunny)

- Deployed the whole working tree on November 11, 2026 (Netlify deploy `6af517ddb95462a65500c14c`): catalog / settings caches, link-prefetch suppression, the audit fixes and reminder emails below. Statements elsewhere in this file that these changes are "not deployed" predate this.
- Reason: Supabase egress was 6.5 / 5 GB for the Oct 17 – Nov 17 cycle (over quota in the previous cycle too; projects are restricted from December 11 if still over). pg_stat_statements (reset October 16) showed about 75k uncached storefront renders, each reading the whole active catalog (about 200 KB) through the API: 177,054 `styles` reads and 79,602 `settings` reads by `anon` at deploy time. Images were not the cause (cached egress 0.47 GB).
- robots.txt now also disallows URLs with a query string (filter / date combinations) and seven SEO-tool crawlers.
- Measured November 13, 28.6 hours after the deploy: `styles` reads +373 and `settings` reads +376 (about 310 a day, down from about 6,800 a day), all `anon` API requests +2,460.
- Follow-up: re-read those two counters after a few days to measure the new rate; confirm the egress breakdown by service in the Supabase dashboard. If a click feels slow (about 1 s measured server response), add prefetch on hover / touch only.

### Waiting for the next deploy (batch these; Sunny wants several changes per deploy)

- Decided November 11: maximum rental 30 days. Suits +$10 per day after day 10 (day 30 = $369), jackets and pants +$5 per day (day 30 = $205 / $190), Crystal suits +$10 per day (day 30 = $389); helmet covers and gloves unchanged.
- Order matters: the display code (first 10 tiers plus an "11–30 days: +$10 per extra day" line; uncommitted, tests pass, not viewed in a browser at 30 days) must be deployed BEFORE `settings.max_rental_days` and the price tables are changed, or the live product page shows 30 price cells. Settings are still 10 days.
- Crystal jacket / pants regular tables have only 7 entries (flat from day 8). Sunny approved continuing the existing rule (standard price × 1.2) to day 30: jacket +$6 per day from day 8 (day 30 = $246), pants +$6 per day (day 30 = $228). Apply together with the 30-day switch.
- Contact page message form (uncommitted): emails the shop with the visitor as reply-to; hidden trap field, 3 per network per hour and 40 per day in total. One real test message was sent from the local site on November 12.
- Brands: `brown-camo-cargo-snow-pants` set to Skibear (database and catalog/other.json). The 15 helmet covers and `red-peony-floral-snow-suit` have no brand by Sunny's confirmation; leave empty.
- `isee-migga-pink-3d-heart-ski-suit` (SC062, the piece without the plush hearts) has its own price table set in the database on November 13: the suit table minus $10 per tier (starts at $39). The catalog file cannot record it. Extend it to 30 days with the others (suit table minus $10).
- Added November 13 (live, database only): `isee-migga-shadow-barbie-cross-ski-suit` (SC075, M) with a condition note about the faded seat and the extra black pants.
- Also uncommitted for this batch: real Zelle / Venmo handles (src/config/shop.ts); default share image public/images/share.jpg (three Crystal outfits, used by pages without their own photo); the cached catalog query no longer carries descriptions (product pages read their own) and is reused for 5 minutes instead of 1.
- Added November 13 (uncommitted): cancelling in admin now handles the money. Found in Sunny's real-card test: the "取消订单" button only changed the status, so a paid order was cancelled with no refund, no refund reminder and no email to the customer. Now a paid order asks "取消并全额退款" (refunds the checkout payment through Stripe, marks it refunded) or "取消，暂不退款" (leaves the red refund-due reminder, for partial refunds done in Stripe); every admin cancellation emails the customer (`order_cancelled`, migration 33, already applied to the database and harmless to the live code). Rules in src/lib/payments/cancel-order.ts with unit tests. Clicked through locally on November 13 against the Stripe sandbox, both choices: full refund (order cancelled, $10 refunded in Stripe, marked refunded, email sent) and refund later (cancelled, refund due shown, no Stripe refund, email sent). Not repeated with real money (Sunny declined: each test costs the card fee).
- Test order SC-Q9K6RPPM was cancelled with the old button; its $10 was marked refund due by hand on November 13 so the admin shows the reminder. Sunny refunds it in Stripe; if `charge.refunded` reaches the live webhook it flips to refunded by itself (that is the webhook check).

### November 11 site audit (Claude)

- Fixed: hreflang on every page pointed at the home page (now per-page canonical / hreflang / Open Graph with product image, src/lib/seo.ts); 10-tier price strip overlapping on phones; shop name colliding with header icons on narrow phones; cart showing "0 days" and a premature "Free shipping" tag while loading, and no retry after a failed quote; damaged saved cart dates could crash the cart page; payment-return errors sent a paying customer to the home page; duplicate brand spellings in the filter; ESLint was linting .netlify build output (12k false problems).
- Data to tidy in the admin: one style's brand is "Swagli" while six are "SwagLi" (the filter now merges them); 17 active styles have an empty brand.
- Added the same day (also uncommitted, not deployed): pickup-day and last-ski-day reminder emails from the hourly sweep (migration 32, applied to the shared database; rules in src/lib/booking/reminders.ts); with dates entered, booked items stay listed greyed at the end instead of hidden, and phones get a visible date bar on the three list pages; "text us / email us" prompts for size help and for booked dates on product pages (prefilled sms: / mailto: links, no waitlist table).
- Sunny's decisions: cancellations stay "contact us" (no self-service cancel button); no automatic size recommendation.
- Open question for Sunny: settings.max_rental_days is 10 and price tables have 10 tiers; she expected a 30-day cap at +$10 per extra day. Not changed; needs her confirmation of the tables for each category.
- Still open: Zelle / Venmo handles in src/config/shop.ts are placeholders (only shown when Stripe is off).

## Decisions

- [x] Keep the current production rental price tables. Do not restore the previously discussed $89 two-day set price or the 7–10 day cap.
- [x] Full sets and one-pieces use a listed new-replacement value: ISEE MIGGA $330, other brands $300. These are Sunny's specified amounts, not independently verified manufacturer-wide retail prices.
- [ ] Decide separate jacket / pants and accessory replacement values; no new amounts have been assigned to these categories.
- [x] Fit returns: contact and hand back to USPS within 24 hours of delivery, indoor try-on only / otherwise unused and original condition; refund rental fees to the original payment method, not credit. Orders charged no shipping deduct $15 once (capped at the refunded rental fees). Orders charged shipping retain that charge without another $15 deduction, including far-state returns. Shop errors do not incur the fit-return deduction.
- [x] Ordinary cancellations: refund all paid shipping charges (including surcharges / rush fees) before shipment; apply the existing rental-fee cancellation schedule separately. After shipment, shipping is nonrefundable for cancellation. Fit returns and shop errors retain their separate rules.
- [ ] Clarify which local payment methods are actually available. Zelle and Venmo handles in shop config are still placeholders; do not present them as real payment details.
- [ ] Verify the applicable sales-tax setup before accepting live orders.

## Customer-facing consistency

- [x] Replace blanket deposit-free wording with payment-specific wording.
- [x] Explain that short-notice orders submitted for owner approval are not confirmed merely by payment; show this at checkout and in the terms.
- [x] Derive surcharge-state disclosures and rush-fee amounts from configuration.
- [x] Remind customers that qualifying full-look / subtotal orders still pay far-state surcharges and optional rush fees.
- [x] Remove the address placeholder and unsupported fixed opening hours; pickup is by appointment in Ithaca.
- [x] Remove hard-coded glove rates from the overview; each product displays its actual price table and rental limit.
- [x] Enable retail replacement-price entry and display for outfits, in addition to accessories. Full-set / one-piece values were subsequently populated on November 7; separate pieces and accessories were left unchanged.
- [x] Resolve conflicting Auth redirect instructions and outdated example prices in the README.
- [ ] Confirm a precise cancellation cutoff time and time zone, and clarify that already-shipped orders take precedence over the advance-notice refund tiers.
- [x] Delivery-delay rental refunds: all rental fees can be refunded if no booked rental day is usable (arrange return of unused items); if later days remain usable, agree a proportional refund based on days actually missed. No fixed average-day or tier-difference formula.
- [x] Delivery-delay shipping refunds: if no booked day is usable and the unused items are returned by arrangement, refund rental plus paid shipping in full, with no $15 deduction. If later days remain usable, retain paid shipping and agree a proportional rental refund.
- [ ] Retain the accepted terms version and the applicable replacement valuation with each booking, rather than relying solely on today's website text.

## Before production deployment

- [x] Complete a production build. `next build` passed locally on November 11, 2026 (with NEXT_PUBLIC_SITE_URL set); 436 tests, TypeScript and lint also pass. Not deployed.
- [x] Verify production CRON_SECRET and the hourly payment sweep are configured and operational. Checked November 13: the production endpoint returns 401 without the secret and 200 with the local one, with Stripe enabled (`payments` is not null).
- [ ] Verify Stripe live account payouts / bank details, live key permissions, and webhook events including charge.refunded.
  - November 13: the live account's status is UNKNOWN from here. The local key in .env.local belongs to a Stripe sandbox ("SC 沙盒", created October 30), which is a separate account: its `details_submitted` / `charges_enabled` / `payouts_enabled` are always false and say nothing about the live account (an earlier note here wrongly concluded the account was not activated). Sunny says she completed verification. Every checkout session in the database so far is `cs_test_`. The production key's mode could not be read (Netlify masks it). Still to confirm in the Stripe dashboard (live mode, not the sandbox): payments and payouts enabled, Netlify `STRIPE_SECRET_KEY` is an `sk_live_` key, and a live webhook exists for the site with checkout.session.completed / expired and charge.refunded, its signing secret set as `STRIPE_WEBHOOK_SECRET`.
  - November 13, real-card test by Sunny: order SC-Q9K6RPPM ($10, local pickup) paid through a `cs_live_` session, was confirmed and marked paid about 2 minutes after it was placed, and both emails (`new_order`, `order_confirmed`) were sent on the first attempt. So production uses the live key and live payments work. Not yet tested: refunding this order (which also exercises `charge.refunded`).
- [ ] Verify SMTP credentials, signup confirmation, password reset, and order email delivery on the production domain.
- [ ] Rotate the Supabase service secret that appeared in earlier terminal/chat output and update every consuming environment. Order-access cookies derive from this secret and will be invalidated by rotation.
- [ ] Review mobile and desktop: home, lists, product details, condition notes, cart, checkout and booking access, in both languages.
- [x] Get Sunny's approval and deploy the reviewed version once (done November 11, 2026). Do not enable automatic production builds as part of this work.

## After the approved deployment

- [ ] With Sunny's authorization, place and refund a real-card order; verify the booking, webhook, amount, emails and released inventory.
- [ ] Verify both local-pickup options, including the per-order $200 cash deposit and card-on-file flow.
- [ ] Check that a forwarded booking link cannot expose the order to an unrelated account.
- [ ] Compare request counts, client types and function compute over 3–7 days. Do not treat browser-classified requests as verified human visitors.
- [ ] Confirm the remaining monthly Netlify budget and preserve the last working deployment for rollback.

## Operational policy reference

Prices are maintained in the admin dashboard / production settings. Shipping is computed by src/lib/shipping.ts and src/config/shop.ts: $99 rental-plus-add-ons or a full look qualifies for the shipping discount; near states pay $0 when qualified / $15 otherwise, and surcharge states pay $15 when qualified / $30 otherwise. Optional rush shipping adds $15 / $25 respectively. Deposits never count toward the threshold. Pickup has a one-day minimum; shipped rentals have a two-day minimum under the current settings.

Do not change production prices or unresolved business policies merely to make a document agree with an older conversation.

## Valuation references reviewed

- [Slope Threads terms](https://slopethreads.com/pages/terms-conditions): associates the liability cap with original retail value stated on its site/app.
- [KIT LENDER terms](https://www.kitlender.com/terms-of-use/): describes repair / replacement charges and a retail-value-based cap.
- [Stripe saved-payment guidance](https://docs.stripe.com/payments/save-and-reuse.md?payment-ui=elements): requires advance agreement covering later charges, how amounts are determined, and records of consent. This is not a guarantee of legal enforceability or dispute outcomes.

These are examples, not a requirement to adopt their policies. Sunny chose listed new-replacement values for full sets and one-pieces; separate pieces and accessories remain to be decided.
