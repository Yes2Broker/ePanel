-- Y2B Assist (the AI helper). Run after functions.sql, reports.sql, leave.sql
-- and attendance.sql. Safe to re-run; it doesn't change any existing data.
--
-- The assistant only READS, through the same functions the panel uses, with
-- the person's own session token, so it sees exactly what they may see.
-- No chat text is stored: only a count of questions per person per day.

create table if not exists assist_usage (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  day date not null,
  questions int not null default 0,
  primary key (employee_id, day)
);
alter table assist_usage enable row level security;
revoke all on assist_usage from anon, authenticated;

create or replace function private.assist_daily_limit() returns int language sql immutable as $$ select 30 $$;

-- Called once per question by /api/assist: checks the "Y2B Assist" permission
-- and the daily limit, and counts the question.
create or replace function public.assist_use(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_module(p_token, 'assist');
  n int;
begin
  insert into assist_usage as u (employee_id, day, questions) values (me.id, private.today(), 1)
  on conflict (employee_id, day) do update set questions = u.questions + 1
    where u.questions < private.assist_daily_limit()
  returning questions into n;
  if n is null then
    raise exception 'Daily limit reached.' using errcode = 'P0429';
  end if;
  return jsonb_build_object('id', me.id, 'name', me.name, 'role', me.role, 'today', private.today(),
    'remaining', private.assist_daily_limit() - n);
end $$;

-- The signed-in person's pending site visits from today on (plus overdue ones).
create or replace function public.assist_my_visits(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('client', v.client_name, 'date', coalesce(v.reschedule_date, v.visit_date),
             'report', private.report_title(v.report_type, v.project_id),
             'overdue', coalesce(v.reschedule_date, v.visit_date) < private.today())
           order by coalesce(v.reschedule_date, v.visit_date), v.client_name)
    from (select * from site_visits where employee_id = me.id and status = 'Pending'
          and coalesce(reschedule_date, visit_date) >= private.today() - 7
          order by coalesce(reschedule_date, visit_date) limit 60) v), '[]'::jsonb);
end $$;

-- HR / Admin: who hasn't filed today's report(s) yet (same rules as the
-- daily reminder: active, has the report, not on leave or weekly off).
create or replace function public.assist_not_filed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_today date := private.today();
begin
  return jsonb_build_object('date', v_today,
    'notFiled', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'missing', x.missing) order by x.name)
      from (
        select e.name, (
          select jsonb_agg(t.title order by t.sort) from (
            select 'Normal Daily Report' as title, '0' as sort
            where coalesce((private.permissions_json(e) ->> 'normalReport')::boolean, false)
              and not exists (select 1 from sales_reports where deleted_at is null and employee_id = e.id and report_date = v_today and report_type = 'Normal')
            union all
            select 'Sole Selling – ' || p.name, '1' || lower(p.name)
            from employee_projects ep join projects p on p.id = ep.project_id
            where ep.employee_id = e.id and p.status = 'Active' and coalesce((private.permissions_json(e) ->> 'soleSelling')::boolean, false)
              and not exists (select 1 from sales_reports where deleted_at is null and employee_id = e.id and report_date = v_today
                              and report_type = 'Sole Selling' and project_id = p.id)
          ) t) as missing
        from employees e
        where e.status = 'Active' and e.role <> 'Admin' and private.day_off(e, v_today) is null
      ) x where x.missing is not null), '[]'::jsonb),
    'off', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'off', private.day_off(e, v_today)) order by e.name)
                     from employees e where e.status = 'Active' and e.role <> 'Admin' and private.day_off(e, v_today) is not null), '[]'::jsonb));
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('assist_use', 'assist_my_visits', 'assist_not_filed')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
