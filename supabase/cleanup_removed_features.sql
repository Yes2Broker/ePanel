-- ONE TIME: removes what's left in the database of three removed features:
-- Lock a month, Payslips, and the "Top performers" leaderboard.
--
-- Run AFTER attendance.sql, reports.sql and notifications.sql (they no longer
-- call any of this). This file stops without changing anything if
-- attendance.sql hasn't been re-run yet. It drops only what's listed below.
--
-- Want to look first? Rows in the tables this drops:
--   select count(*) from attendance_locks;
--   select count(*) from attendance_lock_log;
--   select count(*) from payslip_months;
--   select count(*) from payslips;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('att_import', 'att_set_day', 'att_delete_upload')
               and (p.prosrc like '%att_assert_unlocked%' or p.prosrc like '%att_month_locked%')) then
    raise exception 'Run supabase/attendance.sql first, then this file.';
  end if;
end $$;

-- Lock a month: the check on every attendance change, and its functions.
drop trigger if exists attendance_days_lock_guard on attendance_days;
drop function if exists private.att_days_lock_guard();
drop function if exists private.att_assert_unlocked(date);
drop function if exists private.att_month_locked(date);
drop function if exists public.att_lock_month(text, date, boolean);
drop function if exists public.att_lock_log(text, date);
drop function if exists public.att_month_status(text, date);
drop function if exists private.att_set_lock(public.employees, date, boolean, text);

-- Payslips.
drop function if exists public.publish_payslips(text, date);
drop function if exists public.unpublish_payslips(text, date);
drop function if exists public.my_payslips(text);
drop function if exists public.my_payslip(text, date);
drop function if exists private.payslip_data(public.employees, date);

-- Leaderboard.
drop function if exists public.report_leaderboard(text, date);

-- Tables (payslip snapshots and month locks).
drop table if exists payslips;
drop table if exists payslip_months;
drop table if exists attendance_lock_log;
drop table if exists attendance_locks;
