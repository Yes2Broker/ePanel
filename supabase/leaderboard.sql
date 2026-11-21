-- ===========================================================================
-- Leaderboard: the monthly race for most site visits done and most closures
-- (tokens / bookings), from the daily reports.
-- Run AFTER functions.sql, notifications.sql and reports.sql.
-- Safe to re-run: it only creates what's missing and replaces functions.
--
-- Who races: active employees in the Sales department. Everyone active can see
-- the board: names, designations and the two counts only (no phone, email, salary).
--
-- Winners: on the 1st of each month the first call (the 30-minute cron via
-- push_claim, or anyone opening the panel) locks last month's winners (ties
-- share the title) and notifies everyone once. Past dates can only be filed
-- within the current month, so last month is final by then.
-- ===========================================================================

create table if not exists leaderboard_months (
  month date primary key,                 -- 1st of the month
  announced_at timestamptz not null default now()
);
create table if not exists leaderboard_winners (
  month date not null references leaderboard_months(month) on delete cascade,
  category text not null check (category in ('visits','closures')),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  value int not null,
  primary key (month, category, employee_id)
);
alter table leaderboard_months enable row level security;
alter table leaderboard_winners enable row level security;
revoke all on leaderboard_months, leaderboard_winners from anon, authenticated;

-- Each racer's totals for a date range. Only the Sales department races.
create or replace function private.lb_rows(p_from date, p_to date)
returns table (id text, name text, designation text, visits int, closures int)
language sql stable set search_path = public, private as $$
  select e.id, e.name, coalesce(e.designation, ''), coalesce(sum(r.done), 0)::int, coalesce(sum(r.tokens), 0)::int
  from employees e
  left join sales_reports r on r.employee_id = e.id and r.deleted_at is null and r.report_date between p_from and p_to
  where e.status = 'Active' and e.department = 'Sales'
  group by e.id, e.name, e.designation
$$;

-- Ranked: rank 1 = most; ties share a rank. 0 = not ranked (null).
drop function if exists private.lb_ranked(date, date);
create or replace function private.lb_ranked(p_from date, p_to date)
returns table (id text, name text, designation text, visits int, closures int, rank_visits int, rank_closures int)
language sql stable set search_path = public, private as $$
  select r.*,
    case when r.visits > 0 then (rank() over (order by r.visits desc))::int end,
    case when r.closures > 0 then (rank() over (order by r.closures desc))::int end
  from private.lb_rows(p_from, p_to) r
$$;

-- Filed a report on every working day this week so far (today counts once filed).
create or replace function private.lb_streak(p_emp text, p_week_off smallint, p_today date) returns boolean
language sql stable set search_path = public, private as $$
  with days as (
    select d::date as d from generate_series(p_today - (extract(isodow from p_today)::int - 1), p_today, interval '1 day') d
    where private.is_working_day(d::date, p_week_off)
      and (d::date < p_today or exists (select 1 from sales_reports where employee_id = p_emp and report_date = p_today and deleted_at is null))
  )
  select count(*) > 0 and bool_and(exists (select 1 from sales_reports s where s.employee_id = p_emp and s.report_date = days.d and s.deleted_at is null))
  from days
$$;

-- Locks last month's winners and tells everyone, once per month.
create or replace function private.lb_announce() returns void
language plpgsql volatile set search_path = public, private as $$
declare
  v_today date := private.today();
  v_month date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_end date := (date_trunc('month', v_today) - interval '1 day')::date;
  v_label text := to_char(v_month, 'FMMonth');
  v_visits text; v_closures text; v_body text;
  e employees;
begin
  -- Only months that had any report (no announcement for an empty month).
  if not exists (select 1 from sales_reports where deleted_at is null and report_date between v_month and v_end) then return; end if;
  insert into leaderboard_months (month) values (v_month) on conflict do nothing;
  if not found then return; end if;   -- already announced

  insert into leaderboard_winners (month, category, employee_id, value)
  select v_month, 'visits', r.id, r.visits from private.lb_ranked(v_month, v_end) r where r.rank_visits = 1 and r.visits > 0
  union all
  select v_month, 'closures', r.id, r.closures from private.lb_ranked(v_month, v_end) r where r.rank_closures = 1 and r.closures > 0;

  select string_agg(e2.name, ' & ' order by e2.name) into v_visits
  from leaderboard_winners w join employees e2 on e2.id = w.employee_id where w.month = v_month and w.category = 'visits';
  select string_agg(e2.name, ' & ' order by e2.name) into v_closures
  from leaderboard_winners w join employees e2 on e2.id = w.employee_id where w.month = v_month and w.category = 'closures';
  if v_visits is null and v_closures is null then return; end if;
  v_body := concat_ws(' · ', 'Top visits: ' || v_visits, 'Top closures: ' || v_closures) || '. The new race is on!';

  for e in select * from employees where status = 'Active' loop
    if exists (select 1 from leaderboard_winners where month = v_month and employee_id = e.id) then
      perform private.notify(e.id, 'lb_winner', '🏆 You''re the ' || v_label || ' champion!', v_body, '/leaderboard?month=' || to_char(v_month, 'YYYY-MM'));
    else
      perform private.notify(e.id, 'lb_winner', '🏆 ' || v_label || ' champions are here', v_body, '/leaderboard?month=' || to_char(v_month, 'YYYY-MM'));
    end if;
  end loop;
end $$;

create or replace function private.lb_winners_json(p_month date, p_me text) returns jsonb
language sql stable set search_path = public, private as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', w.category, 'id', e.id, 'name', e.name,
           'designation', coalesce(e.designation, ''), 'value', w.value, 'me', e.id = p_me) order by w.category desc, e.name), '[]'::jsonb)
  from leaderboard_winners w join employees e on e.id = w.employee_id where w.month = p_month
$$;

-- The board for one month (default: this month).
create or replace function public.leaderboard(p_token text, p_month date) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_today date := private.today();
  v_from date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_end date := (date_trunc('month', coalesce(p_month, v_today)) + interval '1 month - 1 day')::date;
  v_to date := least(v_end, v_today);
  v_live boolean := v_end >= v_today;
begin
  if v_from > v_today then raise exception 'That month hasn''t started yet.' using errcode = '22023'; end if;
  perform private.lb_announce();
  return jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'live', v_live,
    'daysLeft', case when v_live then v_end - v_today + 1 else 0 end,
    -- Midnight after the last day, India time (for the countdown).
    'endsAt', to_char(((v_end + 1)::timestamp at time zone private.tz()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'minMonth', coalesce((select to_char(min(report_date), 'YYYY-MM') from sales_reports where deleted_at is null), to_char(v_today, 'YYYY-MM')),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'designation', r.designation,
        'visits', r.visits, 'closures', r.closures, 'rankVisits', r.rank_visits, 'rankClosures', r.rank_closures,
        -- Yesterday's rank, for the ▲▼ arrows (this month only, from the 2nd).
        'prevVisits', y.rank_visits, 'prevClosures', y.rank_closures,
        'titles', (select count(*) from leaderboard_winners w where w.employee_id = r.id),
        'streak', v_live and private.lb_streak(r.id, e.week_off, v_today),
        'me', r.id = v_me.id) order by r.name)
      from private.lb_ranked(v_from, v_to) r
      join employees e on e.id = r.id
      left join private.lb_ranked(v_from, v_today - 1) y on y.id = r.id and v_live and v_today > v_from), '[]'::jsonb),
    'winners', private.lb_winners_json(v_from, v_me.id),
    'racing', v_me.department = 'Sales',
    -- Hall of fame: the last 12 announced months.
    'hall', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'winners', private.lb_winners_json(m.month, v_me.id)) order by m.month desc)
                      from (select month from leaderboard_months order by month desc limit 12) m), '[]'::jsonb)
  );
end $$;

-- Dashboard: last month's champions (for 3 days after they're announced) and
-- where I stand in this month's race.
create or replace function public.leaderboard_banner(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_today date := private.today();
  v_from date := date_trunc('month', v_today)::date;
  v_end date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_m leaderboard_months;
  r record;
  v_race jsonb;
begin
  perform private.lb_announce();
  select * into v_m from leaderboard_months
  where (announced_at at time zone private.tz())::date >= v_today - 2 order by month desc limit 1;

  select * into r from private.lb_ranked(v_from, v_today) x where x.id = v_me.id;
  if found then
    v_race := jsonb_build_object(
      'visits', r.visits, 'closures', r.closures, 'rankVisits', r.rank_visits, 'rankClosures', r.rank_closures,
      'players', (select count(*) from private.lb_rows(v_from, v_today)),
      -- How many more to move up a place (null = already first).
      'visitsToNext', (select min(x.visits) - r.visits from private.lb_rows(v_from, v_today) x where x.visits > r.visits),
      'closuresToNext', (select min(x.closures) - r.closures from private.lb_rows(v_from, v_today) x where x.closures > r.closures),
      'daysLeft', v_end - v_today + 1);
  end if;

  return jsonb_build_object(
    'champions', case when v_m.month is null then null else jsonb_build_object(
      'month', to_char(v_m.month, 'YYYY-MM'), 'winners', private.lb_winners_json(v_m.month, v_me.id)) end,
    'race', v_race);
end $$;

-- Add the notification type (Settings → Notifications can turn it off).
create or replace function private.notify_types() returns text[]
language sql immutable as $$
  select array['leave_decision','att_updated','att_day','report_changed','report_reminder',
               'leave_request','leave_cancelled','att_checked','email_failed','visit_today','lb_winner']
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('leaderboard','leaderboard_banner')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
