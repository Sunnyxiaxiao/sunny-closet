-- Sunny Closet: pay by card at checkout (or in person at pickup), card on file instead of a deposit
--
-- Three ways to pay (payment_method):
--   'card'           — rental + shipping with Stripe Checkout when ordering; the card is saved. Confirmed once paid.
--   'in_person_card' — local pickup: rental paid in person, card saved on Stripe instead of a deposit (nothing charged). Confirmed once the card is saved.
--   'in_person'      — local pickup: rental and a cash deposit (cash_deposit_cents) paid in person, deposit returned in person. Confirmed right away.
-- A saved card is charged later only for serious damage or loss (at retail price) or a late return.
-- Per-style deposits are dropped: every style's deposit becomes 0, so orders carry no deposit in deposit_cents
-- (create_booking still checks the deposit against the style, which now means 0).

update public.styles set deposit_cents = 0 where deposit_cents <> 0;

alter table public.bookings
  -- See above; null = manual flow (admin confirms, Zelle / Venmo)
  add column payment_method text check (payment_method in ('card', 'in_person_card', 'in_person')),
  -- Cash deposit taken at pickup for 'in_person' orders (0 otherwise)
  add column cash_deposit_cents integer not null default 0 check (cash_deposit_cents >= 0),
  -- The latest Checkout session for this order; an expired session only cancels the order if it is still the latest one
  add column stripe_checkout_session_id text,
  add column stripe_payment_intent_id text unique,
  add column paid_cents integer check (paid_cents >= 0),
  add column paid_at timestamptz;

-- With no deposit, charges against the saved card are damage / loss / late-return charges
alter table public.deposit_charges rename to card_charges;
alter index public.deposit_charges_booking_id_idx rename to card_charges_booking_id_idx;
alter policy deposit_charges_admin_select on public.card_charges rename to card_charges_admin_select;
