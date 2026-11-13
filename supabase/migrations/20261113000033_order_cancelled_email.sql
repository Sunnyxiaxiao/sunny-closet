-- Sunny Closet: cancellation email to customers
--
-- One more order email: order_cancelled, sent when the owner cancels an order in admin
-- (with the refund, if the order was paid). Logged in email_log like every order email.

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in (
  'new_order', 'order_confirmed', 'refund_due', 'awaiting_acceptance', 'order_declined', 'acceptance_reminder',
  'pickup_reminder', 'return_reminder', 'order_cancelled'
));
