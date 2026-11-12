-- Sunny Closet: reminder emails to customers
--
-- Two more order emails, sent by the scheduled sweep (src/lib/booking/reminders.ts):
--   pickup_reminder: local pickup orders, on the day the pieces can be picked up
--   return_reminder: on the last ski day, when and how to return
-- Each is logged in email_log like every order email, and at most once per order: the unique index makes a second
-- sweep running at the same moment fail to log (and so not send) a duplicate.

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in (
  'new_order', 'order_confirmed', 'refund_due', 'awaiting_acceptance', 'order_declined', 'acceptance_reminder',
  'pickup_reminder', 'return_reminder'
));

create unique index email_log_one_reminder_idx on public.email_log (booking_id, kind)
  where kind in ('pickup_reminder', 'return_reminder');
