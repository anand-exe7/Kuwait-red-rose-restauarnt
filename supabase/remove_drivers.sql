-- Red Rose — remove the in-house driver module.
--
-- The app no longer has drivers: deliveries are handed to a third-party
-- partner (Talabat, Keeta...), so nothing reads or writes any of this. Run
-- ONCE in the Supabase SQL editor to drop what is left behind.
--
-- This DROPS DATA (the drivers table and the per-delivery driver/handover
-- columns). Nothing in the app needs it. Take a backup first if you want the
-- old delivery history kept intact.

drop index if exists deliveries_driver_idx;

alter table deliveries drop column if exists driver_id;
alter table deliveries drop column if exists assigned_at;
alter table deliveries drop column if exists otp_issued_at;
alter table deliveries drop column if exists otp_attempts;
alter table deliveries drop column if exists otp_locked;
alter table deliveries drop column if exists call_attempts;

alter table delivery_settings drop column if exists failed_call_attempts;
alter table delivery_settings drop column if exists failed_wait_minutes;
alter table delivery_settings drop column if exists failed_policy;
alter table delivery_settings drop column if exists otp_length;
alter table delivery_settings drop column if exists otp_expiry_minutes;
alter table delivery_settings drop column if exists otp_max_attempts;

drop table if exists drivers;
