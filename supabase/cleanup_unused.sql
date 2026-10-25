-- ===========================================================================
-- One-time cleanup: removes database functions and old tables the panel no
-- longer uses. Run it AFTER schema.sql, functions.sql, reports.sql,
-- leave.sql and attendance.sql. Safe to run more than once.
--
-- Rows in the old tables (check before running if you want to keep them):
--   select count(*) from attendance;        -- first check-in prototype
--   select count(*) from leave_requests;    -- first leave prototype
--   select count(*) from tasks;             -- personal tasks (never launched)
--   select count(*) from daily_reports;     -- first report prototype
--   select count(*) from holidays;          -- company holidays (removed)
--   select count(*) from comp_off_claims;   -- comp-offs (removed)
--
-- A table is dropped ONLY if no other table, view or function signature
-- still depends on it; otherwise it's kept and a notice says why.
-- (comp_off_claims is still referenced by leave_applications and
-- leave_history, so it stays.)
-- ===========================================================================

-- 1. Functions nothing calls any more (every overload of each name).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
            'att_code_maps','att_missed','att_team_day','cancel_leave','check_in','check_out',
            'comp_off_cancel','comp_off_claim','comp_off_decide','comp_off_list',
            'delete_report','delete_task','holiday_delete','holiday_list','holiday_save',
            'leave_calendar','leave_month_summary','list_leave_requests','list_tasks','list_team_reports',
            'my_attendance','my_leaves','my_reports','request_leave','review_leave','review_report',
            'save_report','save_task','set_attendance','set_task_status','team_attendance'))
       or (n.nspname = 'private' and p.proname in (
            'att_sync_comp_off','claim_json','comp_off_days','is_holiday','late_after','report_json',
            'report_module','tracking_start','rate_start','attendance_json','task_json','attendance_rate'))
       -- Only the old overload that takes a leave_requests row.
       or (n.nspname = 'private' and p.proname = 'leave_json'
           and pg_get_function_identity_arguments(p.oid) like '%leave_requests%')
  loop
    execute format('drop function %s', f.sig);
    raise notice 'Dropped function %', f.sig;
  end loop;
end $$;

-- 2. Old tables, only when nothing else depends on them.
do $$
declare
  t text;
  v_deps text;
begin
  foreach t in array array['attendance','leave_requests','tasks','daily_reports','holidays','comp_off_claims'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    select string_agg(distinct coalesce(c.relname, p.proname, 'something'), ', ')
    into v_deps
    from pg_depend d
    left join pg_constraint k on d.classid = 'pg_constraint'::regclass and k.oid = d.objid
    left join pg_class c on c.oid = coalesce(k.conrelid, (select r.ev_class from pg_rewrite r where d.classid = 'pg_rewrite'::regclass and r.oid = d.objid))
    left join pg_proc p on d.classid = 'pg_proc'::regclass and p.oid = d.objid
    where d.refobjid in (('public.' || t)::regclass, (select reltype from pg_class where oid = ('public.' || t)::regclass))
      and d.deptype = 'n'
      and (k.contype = 'f' and k.conrelid <> ('public.' || t)::regclass
           or d.classid = 'pg_rewrite'::regclass
           or d.classid = 'pg_proc'::regclass);
    if v_deps is null then
      execute format('drop table public.%I', t);
      raise notice 'Dropped table %', t;
    else
      raise notice 'Kept table % (still used by: %)', t, v_deps;
    end if;
  end loop;
end $$;
