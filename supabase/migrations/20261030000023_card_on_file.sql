-- Sunny Closet: card on file instead of a cash deposit
--
-- Customers can save a card with Stripe instead of paying the deposit up front. Nothing is charged when the card is saved;
-- the admin charges it later only for damage, loss or late returns, up to the order's deposit.
-- The card fields live on the main order. They are written only by the server (service_role) after Stripe confirms the card.
-- Card details stay at Stripe: only the brand and last 4 digits are kept here for display.

alter table public.bookings
  add column stripe_customer_id text,
  add column stripe_payment_method_id text,
  add column card_brand text,
  add column card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  add column card_saved_at timestamptz;

-- Charges made against a saved card. Failed attempts are kept too, so the admin sees why a charge didn't go through.
create table public.deposit_charges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (length(reason) between 1 and 200),
  status text not null check (status in ('succeeded', 'processing', 'failed')),
  stripe_payment_intent_id text unique,
  failure_message text,
  created_at timestamptz not null default now()
);

create index deposit_charges_booking_id_idx on public.deposit_charges (booking_id);

alter table public.deposit_charges enable row level security;

-- The admin reads charges with their own session; only the server (after checking the admin) writes them
revoke all on public.deposit_charges from public, anon, authenticated;
grant select on public.deposit_charges to authenticated;
grant all on public.deposit_charges to service_role;

create policy deposit_charges_admin_select on public.deposit_charges
  for select to authenticated
  using (public.is_admin());
