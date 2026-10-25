-- ===========================================================================
-- Leave: unpaid leave, comp-offs and company holidays.
--
-- Run AFTER schema.sql, functions.sql and reports.sql. Safe to run again on a
-- live database: it only creates what's missing and replaces functions. The
-- old leave_requests table (from the first prototype) is left untouched.
--
-- Rules (decided by the owner):
--   * All leave is unpaid. No quota, no balance, no carry forward.
--   * "Comp-off" = a paid day off, using a comp-off credit. A credit is earned
--     by filing a daily report on your weekly off or a company holiday,
--     claimed, approved by HR/Admin, and expires 30 days after that date.
--   * Half days (first / second half) count 0.5.
--   * Each person's weekly off and company holidays never count as leave.
--   * Dates: up to 7 days in the past, any date in the future.
--   * HR or Admin approve. Nobody approves their own. HR can't act on an
--     Admin's leave; an Admin's own leave is approved automatically.
--   * Every action is written to leave_history.
-- ===========================================================================

create table if not exists holidays (
  holiday_date date primary key,
  name text not null check (length(trim(name)) > 0),
  created_by text references employees(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists comp_off_claims (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  worked_date date not null,
  note text not null default '',
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  decided_by text references employees(id) on update cascade on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists comp_off_claims_one_per_day on comp_off_claims (employee_id, worked_date)
  where status in ('Pending','Approved');

create table if not exists leave_applications (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  kind text not null check (kind in ('Leave','Comp-off')),
  start_date date not null,
  end_date date not null,
  half text check (half in ('first','second')),
  reason text not null check (length(trim(reason)) > 0),
  comp_off_id uuid references comp_off_claims(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  decided_by text references employees(id) on update cascade on delete set null,
  decided_at timestamptz,
  decision_note text,
  -- Set when HR/Admin cancel the rest of a leave that has already started:
  -- days from this date on no longer count.
  cancelled_from date,
  cancelled_by text references employees(id) on update cascade on delete set null,
  cancelled_at timestamptz,
  cancel_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (half is null or start_date = end_date)
);
create index if not exists leave_applications_emp_idx on leave_applications (employee_id, start_date);
create index if not exists leave_applications_dates_idx on leave_applications (start_date, end_date);
-- A comp-off credit can back only one live application.
create unique index if not exists leave_applications_comp_off_once on leave_applications (comp_off_id)
  where comp_off_id is not null and status in ('Pending','Approved');

-- Optional medical note etc. (image or PDF, max 5 MB), kept in the database
-- so it's only reachable through the functions below.
create table if not exists leave_attachments (
  application_id uuid primary key references leave_applications(id) on delete cascade,
  file_name text not null,
  mime text not null,
  size_bytes int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- Attachments arrive in chunks before the application is sent.
create table if not exists leave_uploads (
  upload_id uuid not null,
  seq int not null,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  data bytea not null,
  created_at timestamptz not null default now(),
  primary key (upload_id, seq)
);

create table if not exists leave_history (
  id bigint generated always as identity primary key,
  application_id uuid references leave_applications(id) on delete cascade,
  claim_id uuid references comp_off_claims(id) on delete cascade,
  employee_id text references employees(id) on update cascade on delete cascade,
  actor_id text references employees(id) on update cascade on delete set null,
  action text not null,
  details text,
  at timestamptz not null default clock_timestamp()
);
create index if not exists leave_history_app_idx on leave_history (application_id);
create index if not exists leave_history_claim_idx on leave_history (claim_id);

alter table holidays enable row level security;
alter table comp_off_claims enable row level security;
alter table leave_applications enable row level security;
alter table leave_attachments enable row level security;
alter table leave_uploads enable row level security;
alter table leave_history enable row level security;
revoke all on holidays, comp_off_claims, leave_applications, leave_attachments, leave_uploads, leave_history
  from anon, authenticated;

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function private.comp_off_days() returns int language sql immutable as $$ select 30 $$;
create or replace function private.leave_past_days() returns int language sql immutable as $$ select 7 $$;
create or replace function private.leave_max_upload() returns int language sql immutable as $$ select 5 * 1024 * 1024 $$;

create or replace function private.fmt_day(d date) returns text
language sql immutable as $$ select to_char(d, 'Dy DD Mon') $$;

create or replace function private.is_holiday(d date) returns boolean
language sql stable set search_path = public as $$ select exists (select 1 from holidays where holiday_date = d) $$;

-- The days a range counts as leave for one person: weekly off and holidays left out.
create or replace function private.leave_days(p_emp text, p_start date, p_end date, p_half text)
returns table (day date, portion numeric)
language sql stable set search_path = public, private as $$
  select g::date, case when p_half is null then 1.0 else 0.5 end
  from employees e, generate_series(p_start, p_end, interval '1 day') g
  where e.id = p_emp and p_end >= p_start
    and private.is_working_day(g::date, e.week_off)
    and not exists (select 1 from holidays h where h.holiday_date = g::date)
$$;

-- The days an application counts (after any "cancel remaining days").
create or replace function private.app_days(a public.leave_applications)
returns table (day date, portion numeric)
language sql stable set search_path = public, private as $$
  select * from private.leave_days(a.employee_id, a.start_date,
    least(a.end_date, coalesce(a.cancelled_from - 1, a.end_date)), a.half)
$$;

create or replace function private.app_total(a public.leave_applications) returns numeric
language sql stable set search_path = public, private as $$ select coalesce(sum(portion), 0) from private.app_days(a) $$;

-- How much of a day someone is on leave (0, 0.5 or 1). Approved only, unless asked.
create or replace function private.leave_portion(p_emp text, p_day date, p_with_pending boolean default false) returns numeric
language sql stable set search_path = public, private as $$
  select least(coalesce(sum(x.portion), 0), 1)
  from leave_applications a, lateral private.app_days(a) x
  where a.employee_id = p_emp and p_day between a.start_date and a.end_date and x.day = p_day
    and (a.status = 'Approved' or (p_with_pending and a.status = 'Pending'))
$$;

-- Why someone isn't expected at work on a day, or null. Used by Daily Reports
-- (Team view and the 10 PM email); reports.sql has a stand-in until this runs.
create or replace function private.day_off(e public.employees, d date) returns text
language plpgsql stable set search_path = public, private as $$
declare
  v numeric;
begin
  if private.is_holiday(d) then return 'Holiday'; end if;
  if not private.is_working_day(d, e.week_off) then return 'Weekly off'; end if;
  v := private.leave_portion(e.id, d);
  if v >= 1 then return 'On leave'; end if;
  if v > 0 then return 'Half-day leave'; end if;
  return null;
end $$;

-- Approved leave days (paid + unpaid) in a period.
create or replace function private.leave_taken(p_emp text, p_from date, p_to date) returns numeric
language sql stable set search_path = public, private as $$
  select coalesce(sum(x.portion), 0)
  from leave_applications a, lateral private.app_days(a) x
  where a.employee_id = p_emp and a.status = 'Approved'
    and a.start_date <= p_to and a.end_date >= p_from and x.day between p_from and p_to
$$;

-- May "me" approve / reject / cancel things for "emp"?
create or replace function private.can_decide(me public.employees, emp public.employees) returns boolean
language sql immutable as $$
  select me.role in ('HR','Admin') and me.id <> emp.id and not (me.role = 'HR' and emp.role = 'Admin')
$$;

create or replace function private.leave_log(p_app uuid, p_claim uuid, p_emp text, p_actor text, p_action text, p_details text)
returns void language sql volatile set search_path = public as $$
  insert into leave_history (application_id, claim_id, employee_id, actor_id, action, details)
  values (p_app, p_claim, p_emp, p_actor, p_action, p_details)
$$;

create or replace function private.person_json(p_id text) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', e.id, 'name', e.name, 'department', e.department, 'role', e.role)
  from employees e where e.id = p_id
$$;

create or replace function private.ename(p_id text) returns text
language sql stable set search_path = public as $$ select name from employees where id = p_id $$;

-- Warnings for the approver: weekend days, projects left with nobody on
-- site, and how many people are already off that day.
create or replace function private.leave_warnings(a public.leave_applications) returns jsonb
language sql stable set search_path = public, private as $$
  with days as (select * from private.app_days(a)),
  weekend as (
    select 'Weekend: peak site-visit day (' || string_agg(private.fmt_day(day), ', ' order by day) || ')' as msg
    from days where extract(isodow from day) in (6, 7) having count(*) > 0
  ),
  nobody as (
    select p.name || ' will have nobody on site on ' || private.fmt_day(d.day) as msg, d.day, p.name
    from days d
    join employee_projects ep on ep.employee_id = a.employee_id
    join projects p on p.id = ep.project_id and p.status = 'Active'
    where d.portion >= 1
      and not exists (
        select 1 from employee_projects o join employees oe on oe.id = o.employee_id
        where o.project_id = p.id and o.employee_id <> a.employee_id and oe.status = 'Active'
          and coalesce((private.permissions_json(oe) ->> 'soleSelling')::boolean, false)
          and private.day_off(oe, d.day) is distinct from 'On leave'
          and private.day_off(oe, d.day) is distinct from 'Weekly off'
          and private.day_off(oe, d.day) is distinct from 'Holiday')
  ),
  busy as (
    select 'Already ' || n || case when n = 1 then ' person' else ' people' end || ' on leave on ' || private.fmt_day(day) as msg, day
    from (
      select d.day, (select count(distinct o.employee_id) from leave_applications o, lateral private.app_days(o) ox
                     where o.employee_id <> a.employee_id and o.status = 'Approved'
                       and d.day between o.start_date and o.end_date and ox.day = d.day) as n
      from days d
    ) c where n > 0
  )
  select coalesce(jsonb_agg(msg order by s, day, k), '[]'::jsonb) from (
    select msg, 1 as s, null::date as day, '' as k from weekend
    union all select msg, 2, day, name from nobody
    union all select msg, 3, day, '' from busy
  ) w
$$;

-- An application as JSON, with what the viewer may do with it.
create or replace function private.leave_json(a public.leave_applications, me public.employees) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'id', a.id, 'employee', private.person_json(a.employee_id), 'kind', a.kind,
    'start', a.start_date, 'end', a.end_date, 'half', a.half, 'reason', a.reason,
    'days', private.app_total(a),
    'dayList', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'portion', portion) order by day) from private.app_days(a)), '[]'::jsonb),
    'status', a.status,
    'decidedBy', private.ename(a.decided_by), 'decidedAt', a.decided_at, 'decisionNote', a.decision_note,
    'cancelledFrom', a.cancelled_from, 'cancelledBy', private.ename(a.cancelled_by), 'cancelledAt', a.cancelled_at, 'cancelNote', a.cancel_note,
    'createdAt', a.created_at,
    'compOffDate', (select worked_date from comp_off_claims where id = a.comp_off_id),
    'attachment', (select jsonb_build_object('name', file_name, 'mime', mime, 'size', size_bytes) from leave_attachments where application_id = a.id),
    'canCancel', (a.status = 'Pending' and a.employee_id = me.id)
                 or (a.status = 'Approved' and a.start_date > private.today()
                     and (a.employee_id = me.id or private.can_decide(me, e))),
    'canCancelRemaining', a.status = 'Approved' and a.start_date <= private.today()
                 and least(a.end_date, coalesce(a.cancelled_from - 1, a.end_date)) >= private.today()
                 and (private.can_decide(me, e) or (a.employee_id = me.id and me.role = 'Admin')),
    'canDecide', a.status = 'Pending' and private.can_decide(me, e)
  )
  from employees e where e.id = a.employee_id
$$;

create or replace function private.claim_json(c public.comp_off_claims, me public.employees) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'id', c.id, 'employee', private.person_json(c.employee_id), 'workedDate', c.worked_date,
    'reason', case when private.is_holiday(c.worked_date) then 'Holiday: ' || (select name from holidays where holiday_date = c.worked_date)
                   else 'Weekly off' end,
    'note', c.note, 'status', c.status,
    'expires', c.worked_date + private.comp_off_days(),
    'usedBy', (select jsonb_build_object('id', a.id, 'date', a.start_date, 'status', a.status)
               from leave_applications a where a.comp_off_id = c.id and a.status in ('Pending','Approved') limit 1),
    'expired', c.status = 'Approved' and private.today() > c.worked_date + private.comp_off_days()
               and not exists (select 1 from leave_applications a where a.comp_off_id = c.id and a.status in ('Pending','Approved')),
    'decidedBy', private.ename(c.decided_by), 'decidedAt', c.decided_at, 'decisionNote', c.decision_note,
    'createdAt', c.created_at,
    'canCancel', c.status = 'Pending' and c.employee_id = me.id,
    'canDecide', c.status = 'Pending' and private.can_decide(me, e)
  )
  from employees e where e.id = c.employee_id
$$;

-- Client visits due on the given days that the person must move or hand over.
create or replace function private.visits_on(p_emp text, p_days date[]) returns setof public.site_visits
language sql stable set search_path = public as $$
  select * from site_visits v
  where v.employee_id = p_emp and v.status = 'Pending'
    and coalesce(v.reschedule_date, v.visit_date) = any (p_days)
  order by coalesce(v.reschedule_date, v.visit_date), v.created_at
$$;

-- Days for a proposed application, checking every rule. Raises on problems.
create or replace function private.check_leave(
  me public.employees, p_kind text, p_start date, p_end date, p_half text, p_comp_off uuid
) returns date[]
language plpgsql stable set search_path = public, private as $$
declare
  v_days date[];
  c comp_off_claims;
begin
  if p_kind not in ('Leave','Comp-off') then
    raise exception 'Choose Leave or Comp-off.' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'The end date must be on or after the start date.' using errcode = '22023';
  end if;
  if p_half is not null and p_half not in ('first','second') then
    raise exception 'Choose first half or second half.' using errcode = '22023';
  end if;
  if p_half is not null and p_start <> p_end then
    raise exception 'A half day must be a single date.' using errcode = '22023';
  end if;
  if p_start < private.today() - private.leave_past_days() then
    raise exception 'Leave can be applied at most % days back.', private.leave_past_days() using errcode = '22023';
  end if;
  if p_end > private.today() + 366 then
    raise exception 'Leave can be applied up to a year ahead.' using errcode = '22023';
  end if;
  select array_agg(day order by day) into v_days from private.leave_days(me.id, p_start, p_end, p_half);
  if v_days is null then
    raise exception 'These dates are all your weekly off or company holidays — no leave needed.' using errcode = '22023';
  end if;
  if exists (
    select 1 from leave_applications a, lateral private.app_days(a) x
    where a.employee_id = me.id and a.status in ('Pending','Approved')
      and a.start_date <= p_end and a.end_date >= p_start and x.day = any (v_days)
      and not (a.half is not null and p_half is not null and a.half <> p_half)
  ) then
    raise exception 'You already have leave on some of these dates.' using errcode = '23505';
  end if;
  if p_kind = 'Comp-off' then
    if p_half is not null or array_length(v_days, 1) <> 1 then
      raise exception 'A comp-off covers exactly one full working day.' using errcode = '22023';
    end if;
    select * into c from comp_off_claims where id = p_comp_off and employee_id = me.id;
    if not found or c.status <> 'Approved' then
      raise exception 'Choose one of your approved comp-off credits.' using errcode = '22023';
    end if;
    if exists (select 1 from leave_applications a where a.comp_off_id = c.id and a.status in ('Pending','Approved')) then
      raise exception 'That comp-off credit is already used.' using errcode = '23505';
    end if;
    if v_days[1] <= c.worked_date or v_days[1] > c.worked_date + private.comp_off_days() then
      raise exception 'This comp-off can be used between % and %.', private.fmt_day(c.worked_date + 1),
        private.fmt_day(c.worked_date + private.comp_off_days()) using errcode = '22023';
    end if;
  end if;
  return v_days;
end $$;

-- ===========================================================================
-- Employee side
-- ===========================================================================

-- Everything the "My leave" screen needs.
create or replace function public.leave_overview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  v_today date := private.today();
begin
  return jsonb_build_object(
    'today', v_today,
    'canApply', coalesce((private.permissions_json(me) ->> 'leave')::boolean, false),
    'weekOff', me.week_off,
    'stats', jsonb_build_object(
      'month', private.leave_taken(me.id, date_trunc('month', v_today)::date, (date_trunc('month', v_today) + interval '1 month - 1 day')::date),
      'year', private.leave_taken(me.id, date_trunc('year', v_today)::date, (date_trunc('year', v_today) + interval '1 year - 1 day')::date)),
    'applications', coalesce((
      select jsonb_agg(private.leave_json(a, me) order by a.start_date desc, a.created_at desc)
      from leave_applications a where a.employee_id = me.id and a.end_date >= v_today - 400), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(private.claim_json(c, me) order by c.worked_date desc)
      from comp_off_claims c where c.employee_id = me.id and c.worked_date >= v_today - 120), '[]'::jsonb),
    -- Days in the last 30 where a report was filed on a weekly off or holiday, not yet claimed.
    'claimable', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'reason',
               case when private.is_holiday(d) then 'Holiday: ' || (select name from holidays where holiday_date = d) else 'Weekly off' end) order by d desc)
      from (select distinct r.report_date as d from sales_reports r
            where r.employee_id = me.id and r.report_date between v_today - private.comp_off_days() and v_today) x
      where (private.is_holiday(d) or not private.is_working_day(d, me.week_off))
        and not exists (select 1 from comp_off_claims c where c.employee_id = me.id and c.worked_date = d and c.status in ('Pending','Approved'))
    ), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(jsonb_build_object('date', holiday_date, 'name', name) order by holiday_date)
      from holidays where holiday_date >= date_trunc('year', v_today) and holiday_date < date_trunc('year', v_today) + interval '2 years'), '[]'::jsonb)
  );
end $$;

-- One chunk of an attachment (base64). Chunks are joined when the leave is sent.
create or replace function public.leave_upload_chunk(p_token text, p_upload uuid, p_seq int, p_data text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  v_size bigint;
begin
  delete from leave_uploads where created_at < now() - interval '1 day';
  if exists (select 1 from leave_uploads where upload_id = p_upload and employee_id <> me.id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  insert into leave_uploads (upload_id, seq, employee_id, data)
  values (p_upload, p_seq, me.id, decode(p_data, 'base64'))
  on conflict (upload_id, seq) do update set data = excluded.data;
  select sum(length(data)) into v_size from leave_uploads where upload_id = p_upload;
  if v_size > private.leave_max_upload() then
    delete from leave_uploads where upload_id = p_upload;
    raise exception 'The attachment is larger than 5 MB.' using errcode = '22023';
  end if;
end $$;

-- What an application would look like before sending: days, client visits to
-- deal with (and who could take them over).
create or replace function public.leave_preview(p_token text, p_kind text, p_start date, p_end date, p_half text, p_comp_off uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_module(p_token, 'leave');
  v_days date[] := private.check_leave(me, p_kind, p_start, p_end, p_half, p_comp_off);
begin
  return jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object('date', day, 'portion', portion) order by day)
             from private.leave_days(me.id, p_start, p_end, p_half)),
    'total', (select sum(portion) from private.leave_days(me.id, p_start, p_end, p_half)),
    'skipped', (select count(*) from generate_series(p_start, p_end, interval '1 day') g where not (g::date = any (v_days))),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'client', v.client_name, 'date', coalesce(v.reschedule_date, v.visit_date),
               'type', v.report_type, 'title', private.report_title(v.report_type, v.project_id),
               'colleagues', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name)
                  from employees o
                  where o.status = 'Active' and o.id <> me.id
                    and private.can_file(o, v.report_type, v.project_id)
                    and private.leave_portion(o.id, coalesce(v.reschedule_date, v.visit_date)) < 1), '[]'::jsonb)))
      from private.visits_on(me.id, v_days) v), '[]'::jsonb)
  );
end $$;

-- Send a leave application. p_data:
-- { kind, start, end, half?, reason, compOffId?, uploadId?, fileName?, mime?,
--   visits: [{ visitId, action: 'reschedule' | 'handover', date?, to? }] }
create or replace function public.leave_apply(p_token text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_module(p_token, 'leave');
  v_kind text := p_data ->> 'kind';
  v_start date := (p_data ->> 'start')::date;
  v_end date := (p_data ->> 'end')::date;
  v_half text := nullif(p_data ->> 'half', '');
  v_comp uuid := nullif(p_data ->> 'compOffId', '')::uuid;
  v_reason text := trim(coalesce(p_data ->> 'reason', ''));
  v_upload uuid := nullif(p_data ->> 'uploadId', '')::uuid;
  v_days date[];
  a leave_applications;
  v site_visits;
  d jsonb;
  o employees;
  v_file bytea;
  v_mime text := lower(coalesce(p_data ->> 'mime', ''));
begin
  v_days := private.check_leave(me, v_kind, v_start, v_end, v_half, v_comp);
  if v_reason = '' then
    raise exception 'Please give a reason.' using errcode = '22023';
  end if;

  insert into leave_applications (employee_id, kind, start_date, end_date, half, reason, comp_off_id)
  values (me.id, v_kind, v_start, v_end, v_half, v_reason, case when v_kind = 'Comp-off' then v_comp end)
  returning * into a;
  perform private.leave_log(a.id, null, me.id, me.id, 'Applied',
    format('%s · %s%s · %s day(s)', a.kind, private.fmt_day(a.start_date),
           case when a.end_date <> a.start_date then ' – ' || private.fmt_day(a.end_date) else '' end
           || case when a.half is not null then ' (' || a.half || ' half)' else '' end, private.app_total(a)));

  -- Every client visit on these days must be rescheduled or handed over.
  -- (Any problem here undoes the whole application.)
  for v in select * from private.visits_on(me.id, v_days) loop
    select x.val into d from jsonb_array_elements(coalesce(p_data -> 'visits', '[]'::jsonb)) as x(val) where x.val ->> 'visitId' = v.id::text limit 1;
    if d is null then
      raise exception 'Reschedule or hand over the visit with % first.', v.client_name using errcode = '22023';
    end if;
    if d ->> 'action' = 'reschedule' then
      if nullif(d ->> 'date', '') is null or (d ->> 'date')::date < private.today() or (d ->> 'date')::date = any (v_days) then
        raise exception 'Pick a new date for % that isn''t during your leave (today or later).', v.client_name using errcode = '22023';
      end if;
      update site_visits set reschedule_date = (d ->> 'date')::date where id = v.id;
      perform private.leave_log(a.id, null, me.id, me.id, 'Visit rescheduled',
        format('%s: %s → %s', v.client_name, private.fmt_day(coalesce(v.reschedule_date, v.visit_date)), private.fmt_day((d ->> 'date')::date)));
    elsif d ->> 'action' = 'handover' then
      select * into o from employees where id = d ->> 'to';
      if not found or o.status <> 'Active' or o.id = me.id or not private.can_file(o, v.report_type, v.project_id) then
        raise exception 'Choose a colleague on the same report for %.', v.client_name using errcode = '22023';
      end if;
      if private.leave_portion(o.id, coalesce(v.reschedule_date, v.visit_date)) >= 1 then
        raise exception '% is on leave that day — choose someone else for %.', o.name, v.client_name using errcode = '22023';
      end if;
      update site_visits set employee_id = o.id where id = v.id;
      perform private.leave_log(a.id, null, me.id, me.id, 'Visit handed over',
        format('%s on %s → %s (%s)', v.client_name, private.fmt_day(coalesce(v.reschedule_date, v.visit_date)), o.name,
               private.report_title(v.report_type, v.project_id)));
    else
      raise exception 'Choose Reschedule or Hand over for %.', v.client_name using errcode = '22023';
    end if;
  end loop;

  if v_upload is not null then
    select string_agg(data, ''::bytea order by seq) into v_file from leave_uploads where upload_id = v_upload and employee_id = me.id;
    if v_file is null then
      raise exception 'The attachment didn''t upload. Please try again.' using errcode = '22023';
    end if;
    if length(v_file) > private.leave_max_upload() then
      raise exception 'The attachment is larger than 5 MB.' using errcode = '22023';
    end if;
    if v_mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf') then
      raise exception 'Attach a photo (JPG/PNG) or a PDF.' using errcode = '22023';
    end if;
    insert into leave_attachments (application_id, file_name, mime, size_bytes, data)
    values (a.id, left(coalesce(nullif(trim(p_data ->> 'fileName'), ''), 'attachment'), 120), v_mime, length(v_file), v_file);
    delete from leave_uploads where upload_id = v_upload;
  end if;

  -- An Admin's own leave needs no one else's approval.
  if me.role = 'Admin' then
    update leave_applications set status = 'Approved', decided_by = me.id, decided_at = now(), decision_note = 'Auto-approved (Admin)'
    where id = a.id returning * into a;
    perform private.leave_log(a.id, null, me.id, me.id, 'Auto-approved', 'Admin''s own leave');
  end if;
  return private.leave_json(a, me);
end $$;

-- Cancel. Owner: a pending request, or an approved one before it starts.
-- HR/Admin (or an Admin for their own leave): also the remaining days of a
-- leave that has started — p_from is the first day to cancel.
create or replace function public.leave_cancel(p_token text, p_id uuid, p_from date, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  a leave_applications;
  emp employees;
  v_end date;
begin
  select * into a from leave_applications where id = p_id for update;
  if not found then
    raise exception 'Leave not found.' using errcode = 'P0002';
  end if;
  select * into emp from employees where id = a.employee_id;
  if a.status = 'Pending' then
    if a.employee_id <> me.id and not private.can_decide(me, emp) then
      raise exception 'Only the person who applied can cancel this request.' using errcode = '42501';
    end if;
  elsif a.status = 'Approved' then
    v_end := least(a.end_date, coalesce(a.cancelled_from - 1, a.end_date));
    if a.start_date > private.today() then
      if a.employee_id <> me.id and not private.can_decide(me, emp) then
        raise exception 'Not allowed.' using errcode = '42501';
      end if;
    else
      if not (private.can_decide(me, emp) or (a.employee_id = me.id and me.role = 'Admin')) then
        raise exception 'This leave has started. Ask HR or Admin to cancel the remaining days.' using errcode = '42501';
      end if;
      if p_from is null or p_from > v_end or p_from < a.start_date then
        raise exception 'Choose a date between % and % to cancel from.', private.fmt_day(a.start_date), private.fmt_day(v_end) using errcode = '22023';
      end if;
      if p_from > a.start_date then
        update leave_applications set cancelled_from = p_from, cancelled_by = me.id, cancelled_at = now(), cancel_note = nullif(trim(p_note), '')
        where id = a.id returning * into a;
        perform private.leave_log(a.id, null, a.employee_id, me.id, 'Cancelled remaining days',
          'From ' || private.fmt_day(p_from) || coalesce(' · ' || nullif(trim(p_note), ''), ''));
        return private.leave_json(a, me);
      end if;
    end if;
  else
    raise exception 'This leave is already %.', lower(a.status) using errcode = '22023';
  end if;
  update leave_applications set status = 'Cancelled', cancelled_by = me.id, cancelled_at = now(), cancel_note = nullif(trim(p_note), '')
  where id = a.id returning * into a;
  perform private.leave_log(a.id, null, a.employee_id, me.id, 'Cancelled', nullif(trim(p_note), ''));
  return private.leave_json(a, me);
end $$;

create or replace function public.leave_timeline(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  a leave_applications;
begin
  select * into a from leave_applications where id = p_id;
  if not found or (a.employee_id <> me.id and me.role not in ('HR','Admin')) then
    raise exception 'Leave not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', h.at, 'by', private.ename(h.actor_id), 'action', h.action, 'details', h.details) order by h.at, h.id)
    from leave_history h where h.application_id = p_id), '[]'::jsonb);
end $$;

create or replace function public.leave_attachment(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  a leave_applications;
begin
  select * into a from leave_applications where id = p_id;
  if not found or (a.employee_id <> me.id and me.role not in ('HR','Admin')) then
    raise exception 'Leave not found.' using errcode = 'P0002';
  end if;
  return (select jsonb_build_object('name', file_name, 'mime', mime, 'data', encode(data, 'base64'))
          from leave_attachments where application_id = p_id);
end $$;

-- Claim a comp-off for a weekly off / holiday on which a daily report was filed.
create or replace function public.comp_off_claim(p_token text, p_date date, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_module(p_token, 'leave');
  c comp_off_claims;
begin
  if p_date is null or p_date > private.today() then
    raise exception 'Choose a date that has passed.' using errcode = '22023';
  end if;
  if p_date < private.today() - private.comp_off_days() then
    raise exception 'Comp-offs must be claimed within % days of the day worked.', private.comp_off_days() using errcode = '22023';
  end if;
  if private.is_working_day(p_date, me.week_off) and not private.is_holiday(p_date) then
    raise exception '% wasn''t your weekly off or a company holiday.', private.fmt_day(p_date) using errcode = '22023';
  end if;
  if not exists (select 1 from sales_reports where employee_id = me.id and report_date = p_date) then
    raise exception 'There''s no daily report from you on %.', private.fmt_day(p_date) using errcode = '22023';
  end if;
  if exists (select 1 from comp_off_claims where employee_id = me.id and worked_date = p_date and status in ('Pending','Approved')) then
    raise exception 'You''ve already claimed %.', private.fmt_day(p_date) using errcode = '23505';
  end if;
  insert into comp_off_claims (employee_id, worked_date, note) values (me.id, p_date, coalesce(trim(p_note), ''))
  returning * into c;
  perform private.leave_log(null, c.id, me.id, me.id, 'Comp-off claimed', private.fmt_day(p_date));
  if me.role = 'Admin' then
    update comp_off_claims set status = 'Approved', decided_by = me.id, decided_at = now(), decision_note = 'Auto-approved (Admin)'
    where id = c.id returning * into c;
    perform private.leave_log(null, c.id, me.id, me.id, 'Comp-off auto-approved', 'Admin''s own claim');
  end if;
  return private.claim_json(c, me);
end $$;

create or replace function public.comp_off_cancel(p_token text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  c comp_off_claims;
begin
  update comp_off_claims set status = 'Cancelled'
  where id = p_id and employee_id = me.id and status = 'Pending' returning * into c;
  if not found then
    raise exception 'Only your own pending claims can be cancelled.' using errcode = '22023';
  end if;
  perform private.leave_log(null, c.id, me.id, me.id, 'Comp-off claim cancelled', private.fmt_day(c.worked_date));
  return private.claim_json(c, me);
end $$;

-- ===========================================================================
-- HR / Admin
-- ===========================================================================

-- Requests for the approver, with warnings and the person's leave so far.
create or replace function public.leave_queue(p_token text, p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_today date := private.today();
begin
  return coalesce((
    select jsonb_agg(private.leave_json(a, me) || jsonb_build_object(
             'warnings', case when a.status = 'Pending' then private.leave_warnings(a) else '[]'::jsonb end,
             'taken', jsonb_build_object(
               'month', private.leave_taken(a.employee_id, date_trunc('month', v_today)::date, (date_trunc('month', v_today) + interval '1 month - 1 day')::date),
               'year', private.leave_taken(a.employee_id, date_trunc('year', v_today)::date, (date_trunc('year', v_today) + interval '1 year - 1 day')::date)),
             'visitChanges', coalesce((select jsonb_agg(h.action || ': ' || h.details order by h.at) from leave_history h
                                       where h.application_id = a.id and h.action like 'Visit%'), '[]'::jsonb))
           order by case when a.status = 'Pending' then 0 else 1 end, a.start_date, a.created_at)
    from leave_applications a
    where case coalesce(p_status, 'Pending')
            when 'Pending' then a.status = 'Pending'
            when 'Upcoming' then a.status = 'Approved' and least(a.end_date, coalesce(a.cancelled_from - 1, a.end_date)) >= v_today
            else a.created_at >= now() - interval '60 days' or a.end_date >= v_today
          end
  ), '[]'::jsonb);
end $$;

create or replace function public.leave_decide(p_token text, p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  a leave_applications;
  emp employees;
begin
  select * into a from leave_applications where id = p_id for update;
  if not found then
    raise exception 'Leave not found.' using errcode = 'P0002';
  end if;
  select * into emp from employees where id = a.employee_id;
  if a.employee_id = me.id then
    raise exception 'Someone else must approve your own leave.' using errcode = '42501';
  end if;
  if not private.can_decide(me, emp) then
    raise exception 'Only an Admin can decide an Admin''s leave.' using errcode = '42501';
  end if;
  if a.status <> 'Pending' then
    raise exception 'This request is no longer pending.' using errcode = '22023';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Please give a reason for rejecting.' using errcode = '22023';
  end if;
  update leave_applications set status = case when p_approve then 'Approved' else 'Rejected' end,
    decided_by = me.id, decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = a.id returning * into a;
  perform private.leave_log(a.id, null, a.employee_id, me.id, case when p_approve then 'Approved' else 'Rejected' end, nullif(trim(p_note), ''));
  return private.leave_json(a, me);
end $$;

create or replace function public.comp_off_list(p_token text, p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
begin
  return coalesce((
    select jsonb_agg(private.claim_json(c, me) || jsonb_build_object(
             'reports', (select jsonb_agg(private.report_title(r.report_type, r.project_id)) from sales_reports r
                         where r.employee_id = c.employee_id and r.report_date = c.worked_date))
           order by case when c.status = 'Pending' then 0 else 1 end, c.worked_date desc)
    from comp_off_claims c
    where (coalesce(p_status, 'Pending') = 'Pending' and c.status = 'Pending')
       or (p_status = 'All' and c.created_at >= now() - interval '60 days')
  ), '[]'::jsonb);
end $$;

create or replace function public.comp_off_decide(p_token text, p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  c comp_off_claims;
  emp employees;
begin
  select * into c from comp_off_claims where id = p_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0002';
  end if;
  select * into emp from employees where id = c.employee_id;
  if not private.can_decide(me, emp) then
    raise exception 'You can''t decide this claim.' using errcode = '42501';
  end if;
  if c.status <> 'Pending' then
    raise exception 'This claim is no longer pending.' using errcode = '22023';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Please give a reason for rejecting.' using errcode = '22023';
  end if;
  update comp_off_claims set status = case when p_approve then 'Approved' else 'Rejected' end,
    decided_by = me.id, decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = c.id returning * into c;
  perform private.leave_log(null, c.id, c.employee_id, me.id,
    case when p_approve then 'Comp-off approved' else 'Comp-off rejected' end,
    private.fmt_day(c.worked_date) || coalesce(' · ' || nullif(trim(p_note), ''), ''));
  return private.claim_json(c, me);
end $$;

-- Month view: who's off each day (approved + pending), holidays, weekly offs.
create or replace function public.leave_calendar(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return jsonb_build_object('from', v_from, 'to', v_to, 'days', (
    select jsonb_agg(jsonb_build_object(
             'date', g::date,
             'holiday', (select name from holidays where holiday_date = g::date),
             'leaves', coalesce((
                select jsonb_agg(jsonb_build_object('id', a.id, 'employeeId', e.id, 'name', e.name, 'kind', a.kind,
                         'portion', x.portion, 'half', a.half, 'status', a.status) order by a.status, e.name)
                from leave_applications a join employees e on e.id = a.employee_id, lateral private.app_days(a) x
                where a.status in ('Approved','Pending') and g::date between a.start_date and a.end_date and x.day = g::date), '[]'::jsonb),
             'weeklyOff', coalesce((
                select jsonb_agg(e.name order by e.name) from employees e
                where e.status = 'Active' and e.week_off = extract(isodow from g)::int), '[]'::jsonb))
           order by g)
    from generate_series(v_from, v_to, interval '1 day') g));
end $$;

-- Per-employee leave for a month, for salary.
create or replace function public.leave_month_summary(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return coalesce((
    select jsonb_agg(row_json order by name) from (
      select e.name, jsonb_build_object(
        'employee', private.person_json(e.id),
        'unpaid', coalesce(sum(x.portion) filter (where a.kind = 'Leave'), 0),
        'compOff', coalesce(sum(x.portion) filter (where a.kind = 'Comp-off'), 0),
        'halfDays', count(*) filter (where x.portion = 0.5),
        'total', coalesce(sum(x.portion), 0)) as row_json
      from employees e
      left join leave_applications a on a.employee_id = e.id and a.status = 'Approved'
        and a.start_date <= v_to and a.end_date >= v_from
      left join lateral private.app_days(a) x on x.day between v_from and v_to
      where e.status = 'Active' or a.id is not null
      group by e.id, e.name
    ) s
  ), '[]'::jsonb);
end $$;

-- Company holidays: anyone can read; HR/Admin add, rename, remove.
create or replace function public.holiday_list(p_token text, p_year int) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.session_employee(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('date', holiday_date, 'name', name) order by holiday_date)
                   from holidays where extract(year from holiday_date) = p_year), '[]'::jsonb);
end $$;

create or replace function public.holiday_save(p_token text, p_date date, p_name text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_old text;
begin
  if p_date is null or coalesce(trim(p_name), '') = '' then
    raise exception 'Enter a date and a name.' using errcode = '22023';
  end if;
  select name into v_old from holidays where holiday_date = p_date;
  insert into holidays (holiday_date, name, created_by) values (p_date, trim(p_name), me.id)
  on conflict (holiday_date) do update set name = excluded.name;
  perform private.leave_log(null, null, null, me.id, case when v_old is null then 'Holiday added' else 'Holiday renamed' end,
    private.fmt_day(p_date) || ': ' || coalesce(v_old || ' → ', '') || trim(p_name));
end $$;

create or replace function public.holiday_delete(p_token text, p_date date) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_old text;
begin
  delete from holidays where holiday_date = p_date returning name into v_old;
  if v_old is not null then
    perform private.leave_log(null, null, null, me.id, 'Holiday removed', private.fmt_day(p_date) || ': ' || v_old);
  end if;
end $$;

-- Dashboard cards.
create or replace function public.leave_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  v_today date := private.today();
begin
  return jsonb_build_object(
    'nextLeave', (select private.leave_json(a, me) from leave_applications a
                  where a.employee_id = me.id and a.status = 'Approved'
                    and least(a.end_date, coalesce(a.cancelled_from - 1, a.end_date)) >= v_today
                  order by a.start_date limit 1),
    'myPending', (select count(*) from leave_applications where employee_id = me.id and status = 'Pending'),
    'onLeaveToday', case when me.role in ('HR','Admin') then coalesce((
        select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'portion', private.leave_portion(e.id, v_today)) order by e.name)
        from employees e where e.status = 'Active' and private.leave_portion(e.id, v_today) > 0), '[]'::jsonb) end,
    'pendingApprovals', case when me.role in ('HR','Admin') then
        (select count(*) from leave_applications a join employees e on e.id = a.employee_id
         where a.status = 'Pending' and private.can_decide(me, e))
      + (select count(*) from comp_off_claims c join employees e on e.id = c.employee_id
         where c.status = 'Pending' and private.can_decide(me, e)) end
  );
end $$;
