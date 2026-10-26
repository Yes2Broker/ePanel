-- ===========================================================================
-- Attendance: punches uploaded from the eTimeOffice machine report (or the
-- simple template), plus the old Google-Sheet history, with the same rules
-- as the old Apps Script (Code.gs), web app (script.js) and Excel:
--
--   * Present = both In and Out (old Excel rule). Only one of them, or no
--     row at all = Weekoff on the person's own weekly off, otherwise Absent.
--     Every day of a month up to the last uploaded day counts for every
--     active employee, so the upload file needn't contain weekly offs.
--   * Paid Leave = only what HR marks or the upload file says. Leave
--     requests (the Leave page) never change attendance.
--   * Working time = Out − In (no break deducted, like Code.gs).
--   * Late = In after 10:30 (10:31 is late). Short Day = under 8 h (480 min).
--     A day that is both counts once, as Short (Code.gs / script.js).
--   * The first 2 lates in a month are free; every late from the 3rd on is a
--     "Late Half" = 0.5 day deducted. Each Short Day = 0.5 day deducted.
--   * Weekly-off working (Present on your own weekly off) offsets Absent
--     days, capped at the number of Absent days (script.js):
--     Net payable = Present + Weekoff + Paid Leave + weekly-off working
--                   − (late deductions + Short Days × 0.5)
--     and Absent shown = Absent − weekly-off working.
--   * Salary (Admin only) = monthly salary ÷ days in month × net payable.
--
-- Run AFTER leave.sql. Safe to run again on a live database: it only creates
-- what's missing and replaces functions. The old `attendance` table (from the
-- first check-in prototype) is left untouched.
-- ===========================================================================

create table if not exists attendance_days (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  work_date date not null,
  in_time time,
  out_time time,
  -- Set by HR (edit), the history import, or "Paid Leave = Yes" in the
  -- template. Null = worked out from the punches.
  status_set text check (status_set in ('Present','Absent','Weekoff','Paid Leave')),
  remark text not null default '',
  source text not null check (source in ('etimeoffice','template','history','manual')),
  upload_id uuid,
  -- Late / Half Day as written in the old sheet (history import only), kept
  -- so differences from the recalculation can be shown.
  sheet_late text,
  sheet_half text,
  -- Set when HR/Admin edit the day. Uploads never overwrite such a day.
  edited_by text references employees(id) on update cascade on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);
create index if not exists attendance_days_date_idx on attendance_days (work_date);

-- Every change to a day: uploads that change a value, and HR edits.
create table if not exists attendance_changes (
  id bigint generated always as identity primary key,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  work_date date not null,
  changed_by text references employees(id) on update cascade on delete set null,
  changed_at timestamptz not null default clock_timestamp(),
  field text not null,
  old_value text,
  new_value text
);
create index if not exists attendance_changes_day_idx on attendance_changes (employee_id, work_date);

-- Machine employee codes that don't follow 0002 → EMP002, mapped once by HR.
create table if not exists attendance_code_map (
  machine_code text primary key,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  created_by text references employees(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists attendance_uploads (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  file_name text not null default '',
  uploaded_by text references employees(id) on update cascade on delete set null,
  uploaded_at timestamptz not null default now(),
  rows_in int not null default 0,
  added int not null default 0,
  updated int not null default 0,
  kept int not null default 0,
  from_date date,
  to_date date
);

alter table attendance_days enable row level security;
alter table attendance_changes enable row level security;
alter table attendance_code_map enable row level security;
alter table attendance_uploads enable row level security;
revoke all on attendance_days, attendance_changes, attendance_code_map, attendance_uploads from anon, authenticated;

-- Deleting an upload (HR/Admin) undoes it; the upload row is kept, marked.
alter table attendance_uploads add column if not exists deleted_at timestamptz;
alter table attendance_uploads add column if not exists deleted_by text references employees(id) on update cascade on delete set null;
-- Which upload made a change, so deleting it can put the old values back.
alter table attendance_changes add column if not exists upload_id uuid;

-- "Your attendance was updated – please check it": one row per person and
-- month. An upload or HR edit that changes a day sets updated_at and clears
-- checked_at; the person's "Mark as checked" sets checked_at.
create table if not exists attendance_checks (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  month date not null,
  updated_at timestamptz not null default now(),
  checked_at timestamptz,
  primary key (employee_id, month)
);
alter table attendance_checks enable row level security;
revoke all on attendance_checks from anon, authenticated;


-- ===========================================================================
-- Rules
-- ===========================================================================
create or replace function private.att_late_after() returns time language sql immutable as $$ select time '10:30' $$;
create or replace function private.att_full_day_minutes() returns int language sql immutable as $$ select 480 $$;
create or replace function private.att_free_lates() returns int language sql immutable as $$ select 2 $$;

create or replace function private.month_start(d date) returns date language sql immutable as $$ select date_trunc('month', d)::date $$;
create or replace function private.month_end(d date) returns date language sql immutable as $$ select (date_trunc('month', d) + interval '1 month - 1 day')::date $$;

-- Mark a person's month "updated – please check" (see attendance_checks).
create or replace function private.att_mark_updated(p_emp text, p_day date) returns void
language sql volatile set search_path = public, private as $$
  insert into attendance_checks (employee_id, month, updated_at, checked_at)
  values (p_emp, private.month_start(p_day), now(), null)
  on conflict (employee_id, month) do update set updated_at = now(), checked_at = null
$$;

-- "10:05", "9:5", "10:05:00", "--:--" → time or null. Anything else raises.
create or replace function private.att_time(p text) returns time
language plpgsql immutable as $$
declare
  m text[];
begin
  if p is null or trim(p) = '' or trim(p) ~ '^-+:?-*$' then return null; end if;
  m := regexp_match(trim(p), '^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$');
  if m is null or m[1]::int > 23 or m[2]::int > 59 then
    raise exception 'Time "%" isn''t HH:MM.', p using errcode = '22023';
  end if;
  return make_time(m[1]::int, m[2]::int, 0);
end $$;

-- One person's days with everything worked out. The month's running late
-- count needs the whole month, so pass month bounds and filter afterwards.
-- Days covered: from the 1st (or joining date) up to the last day that has
-- any uploaded row for this person in the range (never after today).
-- A working day inside that span with no row at all shows as Absent ("No record").
do $$
begin
  if to_regtype('private.att_day') is null then
    create type private.att_day as (
      day date, in_time time, out_time time, minutes int, status text, note text,
      late boolean, short_day boolean, late_half boolean, edited boolean, source text, has_row boolean
    );
  end if;
end $$;

create or replace function private.att_days(p_emp text, p_from date, p_to date)
returns setof private.att_day
language sql stable set search_path = public, private as $$
  with emp as (select * from employees where id = p_emp),
  span as (
    select greatest(p_from, coalesce((select joining_date from emp), p_from)) as f,
           -- Active people: up to the last day uploaded for anyone. People who
           -- left: up to their own last row (no weekly offs after leaving).
           least(p_to, private.today(),
                 coalesce((select max(work_date) from attendance_days
                           where work_date between p_from and p_to
                             and (employee_id = p_emp or (select status from emp) = 'Active')), p_from - 1)) as t
  ),
  base as (
    select g::date as d, a.in_time as tin, a.out_time as tout, a.status_set, a.remark, a.source as src,
           a.edited_by, a.work_date is not null as row_exists
    from span cross join generate_series(span.f, span.t, interval '1 day') g
    left join attendance_days a on a.employee_id = p_emp and a.work_date = g::date
  ),
  calc as (
    select b.*,
      case when b.tin is not null and b.tout is not null then (extract(epoch from (b.tout - b.tin)) / 60)::int end as mins,
      (select week_off from emp) as week_off
    from base b
  ),
  st as (
    select c.*,
      case
        when c.status_set is not null then c.status_set
        when c.tin is not null and c.tout is not null then 'Present'
        when not private.is_working_day(c.d, c.week_off) then 'Weekoff'
        else 'Absent'
      end as st
    from calc c
  ),
  fl as (
    select s.*,
      (s.st = 'Present' and s.mins is not null and s.mins < private.att_full_day_minutes()) as is_short,
      (s.st = 'Present' and s.tin is not null and s.tout is not null and s.tin > private.att_late_after()) as in_late
    from st s
  ),
  fl2 as (select f.*, f.in_late and not f.is_short as is_late from fl f)
  select f.d, f.tin, f.tout, f.mins, f.st,
    coalesce(nullif(f.remark, ''),
      case when f.st = 'Absent' and not f.row_exists then 'No record'
           when f.st = 'Present' and not private.is_working_day(f.d, f.week_off) then 'Worked on weekly off'
      end),
    f.in_late, f.is_short,
    f.is_late and count(*) filter (where f.is_late) over (partition by date_trunc('month', f.d) order by f.d) > private.att_free_lates(),
    f.edited_by is not null, f.src, f.row_exists
  from fl2 f
  order by f.d
$$;

-- Month totals for one person (script.js updateCards).
create or replace function private.att_summary(p_emp text, p_month date) returns jsonb
language sql stable set search_path = public, private as $$
  with d as (select * from private.att_days(p_emp, private.month_start(p_month), private.month_end(p_month))),
  c as (
    select count(*) as days,
      count(*) filter (where status = 'Present') as present,
      count(*) filter (where status = 'Absent') as absent,
      count(*) filter (where status = 'Weekoff') as weekoff,
      count(*) filter (where status = 'Paid Leave') as paid_leave,
      count(*) filter (where status = 'Present' and not private.is_working_day(day, (select week_off from employees where id = p_emp))) as wow_raw,
      -- Lates shown = every day In was after 10:30 (like the old Late card);
      -- a late day that is also short is charged once, as Short (script.js).
      count(*) filter (where late) as lates,
      count(*) filter (where late and not short_day) as lates_counted,
      count(*) filter (where late_half) as late_halves,
      count(*) filter (where short_day) as short_days,
      max(day) as last_day
    from d
  ),
  w as (select c.*, least(wow_raw, absent) as wow from c)
  select jsonb_build_object(
    'daysInMonth', extract(day from private.month_end(p_month))::int,
    'days', days, 'present', present,
    -- Absent shown (script.js "unpaid leave") = Absent − weekly-off working.
    'absent', absent - wow, 'absentDays', absent, 'weekoffWorked', wow,
    'weekoff', weekoff, 'paidLeave', paid_leave,
    'lates', lates, 'latesCounted', lates_counted, 'lateHalves', late_halves,
    'lateDeduction', greatest(lates_counted - private.att_free_lates(), 0) * 0.5,
    'shortDays', short_days,
    'netPayable', (present + weekoff + paid_leave + wow) - (greatest(lates_counted - private.att_free_lates(), 0) * 0.5 + short_days * 0.5),
    'lastDay', last_day)
  from w
$$;

create or replace function private.att_day_json(r private.att_day) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'date', r.day, 'in', to_char(r.in_time, 'HH24:MI'), 'out', to_char(r.out_time, 'HH24:MI'), 'minutes', r.minutes,
    'status', r.status, 'note', coalesce(r.note, ''), 'late', r.late, 'shortDay', r.short_day, 'lateHalf', r.late_half,
    'edited', r.edited, 'source', r.source, 'hasRow', r.has_row)
$$;

-- Salary part, for an Admin viewer only.
create or replace function private.att_salary(e public.employees, s jsonb, me public.employees) returns jsonb
language sql stable as $$
  select case when me.role = 'Admin' then jsonb_build_object(
    'monthly', coalesce(e.salary, 0),
    'final', round(coalesce(e.salary, 0) / (s ->> 'daysInMonth')::numeric * (s ->> 'netPayable')::numeric))
  end
$$;

-- ===========================================================================
-- Upload / import (HR / Admin). One function for preview (p_dry) and import.
--   p_kind: 'etimeoffice' | 'template' | 'history' (history = Admin only)
--   p_rows: [{ code, name?, date: 'YYYY-MM-DD', in?, out?, paid?, remark?,
--              status?, sheetLate?, sheetHalf? }]
--   p_map:  { "<machine code>": "EMP0xx" } for codes HR mapped by hand
--           (remembered), or "-" to skip that code's rows this time.
-- ===========================================================================
create or replace function public.att_import(p_token text, p_kind text, p_rows jsonb, p_map jsonb, p_file text, p_dry boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_today date := private.today();
  v_upload uuid := gen_random_uuid();
  r record;
  old attendance_days;
  v_in time; v_out time; v_status text;
  v_added int := 0; v_updated int := 0; v_kept int := 0; v_same int := 0; v_future int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_people jsonb;
  v_unmatched jsonb;
  v_compare jsonb := '[]'::jsonb;
  v_from date; v_to date;
begin
  if p_kind not in ('etimeoffice','template','history') then
    raise exception 'Unknown file type.' using errcode = '22023';
  end if;
  if p_kind = 'history' and me.role <> 'Admin' then
    raise exception 'Only an Admin can import the old history.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows found in the file.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'The file has too many rows (max 20,000).' using errcode = '22023';
  end if;

  -- Resolve every row to an employee and check it, into a temp table.
  if to_regclass('pg_temp.att_in') is not null then drop table pg_temp.att_in; end if;
  create temp table att_in (
    n int, code text, name text, date_txt text, in_txt text, out_txt text, paid boolean, remark text,
    status_txt text, sheet_late text, sheet_half text, employee_id text,
    work_date date, tin time, tout time, status_set text, err text
  ) on commit drop;
  insert into att_in
  with src as (
    select (ord)::int as n, x ->> 'code' as code, x ->> 'name' as name, x ->> 'date' as date_txt,
           x ->> 'in' as in_txt, x ->> 'out' as out_txt, coalesce((x ->> 'paid')::boolean, false) as paid,
           trim(coalesce(x ->> 'remark', '')) as remark, nullif(trim(coalesce(x ->> 'status', '')), '') as status_txt,
           x ->> 'sheetLate' as sheet_late, x ->> 'sheetHalf' as sheet_half
    from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
  )
  select s.*,
    coalesce(
      (select e.id from employees e where e.id = p_map ->> s.code),
      (select m.employee_id from attendance_code_map m where m.machine_code = s.code),
      case
        when p_kind = 'template' then (select e.id from employees e where e.id = upper(trim(s.code)))
        when p_kind = 'history' then (select e.id from employees e where e.id = 'EMP' || lpad(nullif(ltrim(substring(s.code from '(?:^|_)E(\d+)'), '0'), ''), 3, '0'))
        else (select e.id from employees e where e.id = 'EMP' || lpad(nullif(ltrim(regexp_replace(s.code, '\D', '', 'g'), '0'), ''), 3, '0'))
      end) as employee_id,
    null::date as work_date, null::time as tin, null::time as tout, null::text as status_set, null::text as err
  from src s;

  for r in select * from att_in loop
    begin
      update att_in set work_date = r.date_txt::date where n = r.n;
      v_in := private.att_time(r.in_txt);
      v_out := private.att_time(r.out_txt);
      if v_in is not null and v_out is not null and v_out <= v_in then
        raise exception 'Out time must be after In time.' using errcode = '22023';
      end if;
      update att_in set tin = v_in, tout = v_out where n = r.n;
      if r.status_txt is not null then
        if r.status_txt not in ('Present','Absent','Weekoff','Paid Leave') then
          raise exception 'Status "%" isn''t Present, Absent, Weekoff or Paid Leave.', r.status_txt using errcode = '22023';
        end if;
        update att_in set status_set = r.status_txt where n = r.n;
      elsif r.paid then
        if r.remark = '' then
          raise exception 'Paid Leave needs a remark.' using errcode = '22023';
        end if;
        update att_in set status_set = 'Paid Leave' where n = r.n;
      end if;
    exception when others then
      update att_in set err = sqlerrm where n = r.n;
    end;
  end loop;
  update att_in set err = 'Not a valid date.' where err is null and work_date is null;
  update att_in a set err = 'Same person and date twice in the file.'
  where err is null and employee_id is not null and exists (
    select 1 from att_in b where b.employee_id = a.employee_id and b.work_date = a.work_date and b.n < a.n and b.err is null);

  select count(*) into v_future from att_in where err is null and employee_id is not null and work_date > v_today;
  select min(work_date), max(work_date) into v_from, v_to from att_in where err is null and employee_id is not null and work_date <= v_today;

  select coalesce(jsonb_agg(jsonb_build_object('row', n, 'message', err) order by n) filter (where err is not null), '[]'::jsonb)
  into v_errors from (select * from att_in where err is not null order by n limit 200) e;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'rows', cnt) order by code), '[]'::jsonb)
  into v_unmatched from (select code, max(name) as name, count(*) as cnt from att_in where employee_id is null group by code) u;

  -- Per person preview, from the file's own rows (+ weekly offs).
  with ok as (
    select a.*, e.week_off,
      case
        when a.status_set is not null then a.status_set
        when a.tin is not null and a.tout is not null then 'Present'
        when not private.is_working_day(a.work_date, e.week_off) then 'Weekoff'
        else 'Absent'
      end as st,
      case when a.tin is not null and a.tout is not null then (extract(epoch from (a.tout - a.tin)) / 60)::int end as mins,
      d.edited_by is not null or (d.source = 'history' and p_kind <> 'history') or (p_kind = 'history' and d.work_date is not null) as keep
    from att_in a join employees e on e.id = a.employee_id
    left join attendance_days d on d.employee_id = a.employee_id and d.work_date = a.work_date
    where a.err is null and a.work_date <= v_today
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employee', private.person_json(employee_id), 'days', days, 'present', present, 'absent', absent,
           'weekoff', weekoff, 'paidLeave', paid, 'late', late, 'short', short, 'kept', kept,
           'from', f, 'to', t) order by employee_id), '[]'::jsonb)
  into v_people from (
    select employee_id, count(*) as days, min(work_date) as f, max(work_date) as t,
      count(*) filter (where st = 'Present') as present, count(*) filter (where st = 'Absent') as absent,
      count(*) filter (where st = 'Weekoff') as weekoff, count(*) filter (where st = 'Paid Leave') as paid,
      count(*) filter (where st = 'Present' and tin > private.att_late_after()) as late,
      count(*) filter (where st = 'Present' and mins < private.att_full_day_minutes()) as short,
      count(*) filter (where keep) as kept
    from ok group by employee_id
  ) p;

  -- History: where the recalculated Late / Half Day differ from the sheet.
  if p_kind = 'history' then
    with h as (
      select a.n, a.employee_id, a.work_date, a.tin, a.tout, a.status_set, a.sheet_late, a.sheet_half,
        case when a.tin is not null and a.tout is not null then (extract(epoch from (a.tout - a.tin)) / 60)::int end as mins
      from att_in a where a.err is null and a.employee_id is not null
    ), f as (
      select h.*, coalesce(h.status_set, case when h.tin is not null and h.tout is not null then 'Present' end) = 'Present' and h.mins is not null as pres
      from h
    ), g as (
      select f.*, pres and mins < private.att_full_day_minutes() as is_short,
             pres and mins >= private.att_full_day_minutes() and tin > private.att_late_after() as is_late
      from f
    ), k as (
      select g.*,
        case when not pres then '' when is_late then 'Yes' else 'No' end as late_rc,
        case when not pres then '' when is_short then 'Short Day'
             when not is_late then 'No'
             when count(*) filter (where is_late) over (partition by employee_id, date_trunc('month', work_date) order by work_date) > private.att_free_lates() then 'Yes'
             else 'No' end as half_rc
      from g
    )
    select coalesce(jsonb_agg(jsonb_build_object('employee', private.person_json(employee_id), 'date', work_date,
             'in', to_char(tin, 'HH24:MI'), 'out', to_char(tout, 'HH24:MI'),
             'sheetLate', coalesce(sheet_late, ''), 'sheetHalf', coalesce(sheet_half, ''), 'late', late_rc, 'half', half_rc)
             order by employee_id, work_date), '[]'::jsonb)
    into v_compare
    from (select * from k
          where coalesce(nullif(trim(sheet_late), ''), '') is distinct from late_rc
             or coalesce(nullif(trim(sheet_half), ''), '') is distinct from half_rc
          order by employee_id, work_date limit 1000) diff;
  end if;

  if not p_dry then
    -- Every unmatched code needs a decision: an employee, or "-" to skip its rows.
    if exists (select 1 from att_in where employee_id is null and coalesce(p_map ->> code, '') <> '-') then
      raise exception 'Choose an employee (or Skip) for every unmatched code first.' using errcode = '22023';
    end if;
    -- Remember codes mapped by hand.
    insert into attendance_code_map (machine_code, employee_id, created_by)
    select k, v, me.id from jsonb_each_text(coalesce(p_map, '{}'::jsonb)) as m(k, v)
    where exists (select 1 from employees where id = v)
    on conflict (machine_code) do update set employee_id = excluded.employee_id;

    for r in select * from att_in where err is null and employee_id is not null and work_date <= v_today order by employee_id, work_date loop
      select * into old from attendance_days where employee_id = r.employee_id and work_date = r.work_date;
      if old.employee_id is not null and (old.edited_by is not null or (old.source = 'history' and p_kind <> 'history') or p_kind = 'history') then
        v_kept := v_kept + 1;
        continue;
      end if;
      if old.employee_id is null then
        insert into attendance_days (employee_id, work_date, in_time, out_time, status_set, remark, source, upload_id, sheet_late, sheet_half)
        values (r.employee_id, r.work_date, r.tin, r.tout, r.status_set, r.remark, p_kind, v_upload,
                case when p_kind = 'history' then nullif(trim(r.sheet_late), '') end, case when p_kind = 'history' then nullif(trim(r.sheet_half), '') end);
        v_added := v_added + 1;
        insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
        values (r.employee_id, r.work_date, me.id, 'Day (upload)', null, 'added', v_upload);
        -- The old history was already checked in the sheet: no "please check" for it.
        if p_kind <> 'history' then perform private.att_mark_updated(r.employee_id, r.work_date); end if;
      elsif old.in_time is not distinct from r.tin and old.out_time is not distinct from r.tout
            and old.status_set is not distinct from r.status_set and old.remark = r.remark then
        v_same := v_same + 1;
        continue;
      else
        if old.in_time is distinct from r.tin then
          insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
          values (r.employee_id, r.work_date, me.id, 'In Time (upload)', to_char(old.in_time, 'HH24:MI'), to_char(r.tin, 'HH24:MI'), v_upload);
        end if;
        if old.out_time is distinct from r.tout then
          insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
          values (r.employee_id, r.work_date, me.id, 'Out Time (upload)', to_char(old.out_time, 'HH24:MI'), to_char(r.tout, 'HH24:MI'), v_upload);
        end if;
        if old.status_set is distinct from r.status_set then
          insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
          values (r.employee_id, r.work_date, me.id, 'Status (upload)', coalesce(old.status_set, 'auto'), coalesce(r.status_set, 'auto'), v_upload);
        end if;
        if old.remark is distinct from r.remark then
          insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
          values (r.employee_id, r.work_date, me.id, 'Remark (upload)', nullif(old.remark, ''), nullif(r.remark, ''), v_upload);
        end if;
        update attendance_days set in_time = r.tin, out_time = r.tout, status_set = r.status_set, remark = r.remark,
          source = p_kind, upload_id = v_upload, updated_at = now()
        where employee_id = r.employee_id and work_date = r.work_date;
        v_updated := v_updated + 1;
        if p_kind <> 'history' then perform private.att_mark_updated(r.employee_id, r.work_date); end if;
      end if;
    end loop;

    insert into attendance_uploads (id, kind, file_name, uploaded_by, rows_in, added, updated, kept, from_date, to_date)
    values (v_upload, p_kind, left(coalesce(p_file, ''), 200), me.id, jsonb_array_length(p_rows), v_added, v_updated, v_kept, v_from, v_to);
  end if;

  return jsonb_build_object(
    'dry', p_dry, 'rows', jsonb_array_length(p_rows), 'from', v_from, 'to', v_to,
    'future', v_future, 'unmatched', v_unmatched, 'errors', v_errors,
    'errorCount', (select count(*) from att_in where err is not null),
    'people', v_people, 'comparison', v_compare,
    'added', v_added, 'updated', v_updated, 'kept', v_kept, 'unchanged', v_same);
end $$;

create or replace function public.att_uploads(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'file', u.file_name, 'by', private.ename(u.uploaded_by),
                     'at', u.uploaded_at, 'rows', u.rows_in, 'added', u.added, 'updated', u.updated, 'kept', u.kept,
                     'from', u.from_date, 'to', u.to_date,
                     'deletedAt', u.deleted_at, 'deletedBy', private.ename(u.deleted_by)) order by u.uploaded_at desc)
                   from (select * from attendance_uploads order by uploaded_at desc limit 20) u), '[]'::jsonb);
end $$;

-- Delete an upload (HR/Admin; the history import: Admin only). Undoes it:
--   * days it added (not edited by HR since) are removed;
--   * days it changed go back to their values from before the upload;
--   * days edited by HR, or changed by a later upload, since then are kept.
-- Every change is logged ("Upload deleted"); the upload row stays, marked.
create or replace function public.att_delete_upload(p_token text, p_upload uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  u attendance_uploads;
  d attendance_days;
  c record;
  v_added boolean;
  v_removed int := 0; v_restored int := 0; v_kept int := 0;
begin
  select * into u from attendance_uploads where id = p_upload for update;
  if not found or u.deleted_at is not null then
    raise exception 'Upload not found.' using errcode = 'P0002';
  end if;
  if u.kind = 'history' and me.role <> 'Admin' then
    raise exception 'Only an Admin can delete the history import.' using errcode = '42501';
  end if;

  for d in select * from attendance_days where upload_id = u.id order by employee_id, work_date for update loop
    if d.edited_at is not null and d.edited_at > u.uploaded_at then
      v_kept := v_kept + 1;
      continue;
    end if;
    -- Changes this upload made to the day. Older uploads (before change rows
    -- carried the upload id) are matched by who and when: the upload's changes
    -- come right after its start, before the next upload.
    v_added := exists (select 1 from attendance_changes x where x.employee_id = d.employee_id and x.work_date = d.work_date
                         and x.field = 'Day (upload)' and x.upload_id = u.id)
               or (d.created_at = u.uploaded_at);
    if v_added then
      delete from attendance_days where employee_id = d.employee_id and work_date = d.work_date;
      insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
      values (d.employee_id, d.work_date, me.id, 'Upload deleted', 'added by ' || u.file_name, 'removed', u.id);
      v_removed := v_removed + 1;
    else
      for c in
        select x.field, x.old_value from attendance_changes x
        where x.employee_id = d.employee_id and x.work_date = d.work_date and x.field like '% (upload)'
          and (x.upload_id = u.id
               or (x.upload_id is null and x.changed_by is not distinct from u.uploaded_by
                   and x.changed_at >= u.uploaded_at and x.changed_at < u.uploaded_at + interval '10 minutes'
                   and x.changed_at < coalesce((select min(n.uploaded_at) from attendance_uploads n where n.uploaded_at > u.uploaded_at), 'infinity')))
      loop
        if c.field = 'In Time (upload)' then
          update attendance_days set in_time = c.old_value::time where employee_id = d.employee_id and work_date = d.work_date;
        elsif c.field = 'Out Time (upload)' then
          update attendance_days set out_time = c.old_value::time where employee_id = d.employee_id and work_date = d.work_date;
        elsif c.field = 'Status (upload)' then
          update attendance_days set status_set = nullif(c.old_value, 'auto') where employee_id = d.employee_id and work_date = d.work_date;
        elsif c.field = 'Remark (upload)' then
          update attendance_days set remark = coalesce(c.old_value, '') where employee_id = d.employee_id and work_date = d.work_date;
        end if;
        insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value, upload_id)
        values (d.employee_id, d.work_date, me.id, 'Upload deleted', replace(c.field, ' (upload)', '') || ' from ' || u.file_name,
                coalesce(c.old_value, '—') || ' (restored)', u.id);
      end loop;
      update attendance_days set upload_id = null, updated_at = now() where employee_id = d.employee_id and work_date = d.work_date;
      v_restored := v_restored + 1;
    end if;
    -- The person's month changed again. If they had already checked it, ask
    -- them to check again; an unchecked mark stays as it is.
    update attendance_checks set updated_at = now(), checked_at = null
    where employee_id = d.employee_id and month = private.month_start(d.work_date) and checked_at is not null;
  end loop;

  update attendance_uploads set deleted_at = now(), deleted_by = me.id where id = u.id;
  return jsonb_build_object('removed', v_removed, 'restored', v_restored, 'kept', v_kept);
end $$;

-- ===========================================================================
-- Editing (HR / Admin)
-- ===========================================================================
-- p_status: 'Present' | 'Absent' | 'Weekoff' | 'Paid Leave', or null/'' for
-- "from the punches". Times 'HH:MM' or empty.
create or replace function public.att_set_day(
  p_token text, p_emp text, p_date date, p_in text, p_out text, p_status text, p_remark text
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  old attendance_days;
  v_in time := private.att_time(p_in);
  v_out time := private.att_time(p_out);
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_remark text := trim(coalesce(p_remark, ''));
  r private.att_day;
begin
  if not exists (select 1 from employees where id = p_emp) then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;
  if p_date is null or p_date > private.today() then
    raise exception 'Choose today or an earlier date.' using errcode = '22023';
  end if;
  if v_status is not null and v_status not in ('Present','Absent','Weekoff','Paid Leave') then
    raise exception 'Choose Present, Absent, Weekoff or Paid Leave.' using errcode = '22023';
  end if;
  if v_status = 'Present' and (v_in is null or v_out is null) then
    raise exception 'Present needs both In and Out time.' using errcode = '22023';
  end if;
  if v_in is not null and v_out is not null and v_out <= v_in and coalesce(v_status, 'Present') = 'Present' then
    raise exception 'Out time must be after In time.' using errcode = '22023';
  end if;
  if v_status = 'Paid Leave' and v_remark = '' then
    raise exception 'Paid Leave needs a remark.' using errcode = '22023';
  end if;
  if v_status in ('Absent','Weekoff','Paid Leave') then v_in := null; v_out := null; end if;

  select * into old from attendance_days where employee_id = p_emp and work_date = p_date for update;
  if old.in_time is distinct from v_in then
    insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value)
    values (p_emp, p_date, me.id, 'In Time', to_char(old.in_time, 'HH24:MI'), to_char(v_in, 'HH24:MI'));
  end if;
  if old.out_time is distinct from v_out then
    insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value)
    values (p_emp, p_date, me.id, 'Out Time', to_char(old.out_time, 'HH24:MI'), to_char(v_out, 'HH24:MI'));
  end if;
  if old.status_set is distinct from v_status then
    insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value)
    values (p_emp, p_date, me.id, 'Status', coalesce(old.status_set, 'from punches'), coalesce(v_status, 'from punches'));
  end if;
  if coalesce(old.remark, '') <> v_remark then
    insert into attendance_changes (employee_id, work_date, changed_by, field, old_value, new_value)
    values (p_emp, p_date, me.id, 'Remark', nullif(old.remark, ''), nullif(v_remark, ''));
  end if;

  insert into attendance_days (employee_id, work_date, in_time, out_time, status_set, remark, source, edited_by, edited_at)
  values (p_emp, p_date, v_in, v_out, v_status, v_remark, 'manual', me.id, now())
  on conflict (employee_id, work_date) do update set in_time = excluded.in_time, out_time = excluded.out_time,
    status_set = excluded.status_set, remark = excluded.remark, edited_by = me.id, edited_at = now(), updated_at = now();
  if old.employee_id is null or old.in_time is distinct from v_in or old.out_time is distinct from v_out
     or old.status_set is distinct from v_status or old.remark is distinct from v_remark then
    perform private.att_mark_updated(p_emp, p_date);
  end if;

  select * into r from private.att_days(p_emp, private.month_start(p_date), private.month_end(p_date)) where day = p_date;
  return private.att_day_json(r);
end $$;

create or replace function public.att_day_changes(p_token text, p_emp text, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('at', c.changed_at, 'by', private.ename(c.changed_by), 'field', c.field,
                     'old', c.old_value, 'new', c.new_value) order by c.changed_at, c.id)
                   from attendance_changes c where c.employee_id = p_emp and c.work_date = p_date), '[]'::jsonb);
end $$;

-- ===========================================================================
-- Reading
-- ===========================================================================
-- One person's month. Employees: only their own (Attendance permission).
-- HR/Admin: anyone. Salary only for an Admin.
create or replace function public.att_month(p_token text, p_emp text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  e employees;
  s jsonb;
begin
  if p_emp is null or p_emp = me.id then
    if me.role not in ('HR','Admin') then perform private.require_module(p_token, 'attendance'); end if;
    e := me;
  else
    perform private.require_manager(p_token);
    select * into e from employees where id = p_emp;
    if not found then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
  end if;
  s := private.att_summary(e.id, p_month);
  return jsonb_build_object(
    'employee', private.person_json(e.id) || jsonb_build_object('weekOff', e.week_off),
    'month', private.month_start(p_month),
    'summary', s,
    'salary', private.att_salary(e, s, me),
    'days', coalesce((select jsonb_agg(private.att_day_json(d) order by d.day)
                      from private.att_days(e.id, private.month_start(p_month), private.month_end(p_month)) d), '[]'::jsonb));
end $$;

-- Everyone for one month (HR/Admin). Salary only for an Admin.
create or replace function public.att_team_month(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('employee', private.person_json(e.id), 'summary', s, 'salary', private.att_salary(e, s, me)) order by e.name)
    from employees e, lateral (select private.att_summary(e.id, p_month) as s) x
    -- Admin has no attendance of their own.
    where e.role <> 'Admin' and (e.status = 'Active'
       or exists (select 1 from attendance_days a where a.employee_id = e.id
                  and a.work_date between private.month_start(p_month) and private.month_end(p_month)))
  ), '[]'::jsonb);
end $$;

-- Every day of a month for everyone (HR/Admin), for the attendance list.
-- Optional p_emp limits it to one person.
create or replace function public.att_team_days(p_token text, p_month date, p_emp text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('employee', private.person_json(e.id), 'day', private.att_day_json(d)) order by d.day, e.name)
    from employees e,
         lateral private.att_days(e.id, private.month_start(p_month), private.month_end(p_month)) d
    where (p_emp is null or e.id = p_emp) and e.role <> 'Admin'
      and (e.status = 'Active' or exists (select 1 from attendance_days a where a.employee_id = e.id
             and a.work_date between private.month_start(p_month) and private.month_end(p_month)))
  ), '[]'::jsonb);
end $$;

-- The signed-in person's months that were updated and not checked yet.
create or replace function public.att_my_updates(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'updatedAt', updated_at) order by month desc)
                   from attendance_checks where employee_id = me.id and checked_at is null), '[]'::jsonb);
end $$;

create or replace function public.att_mark_checked(p_token text, p_month date) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  update attendance_checks set checked_at = now()
  where employee_id = me.id and month = private.month_start(p_month) and checked_at is null;
end $$;

-- HR/Admin: who has checked an updated month.
create or replace function public.att_checks(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('employee', private.person_json(c.employee_id),
                     'updatedAt', c.updated_at, 'checkedAt', c.checked_at) order by e.name)
                   from attendance_checks c join employees e on e.id = c.employee_id
                   where c.month = private.month_start(p_month)), '[]'::jsonb);
end $$;

-- Admin only: salary sheet for a month.
create or replace function public.att_salary_sheet(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then
    raise exception 'Only an Admin can see salaries.' using errcode = '42501';
  end if;
  return public.att_team_month(p_token, p_month);
end $$;

-- Dashboard cards. Employees: this month. HR/Admin: the last uploaded day.
create or replace function public.att_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  v_last date;
begin
  select max(work_date) into v_last from attendance_days where work_date <= private.today();
  return jsonb_build_object(
    'mine', case when coalesce((private.permissions_json(me) ->> 'attendance')::boolean, false)
                 then private.att_summary(me.id, private.today()) end,
    'team', case when me.role in ('HR','Admin') and v_last is not null then (
      select jsonb_build_object('date', v_last,
        'present', count(*) filter (where d.status = 'Present'),
        'late', count(*) filter (where d.late),
        'absent', count(*) filter (where d.status = 'Absent'),
        'onLeave', count(*) filter (where d.status = 'Paid Leave'))
      from employees e, lateral private.att_days(e.id, private.month_start(v_last), v_last) d
      where e.status = 'Active' and e.role <> 'Admin' and d.day = v_last) end);
end $$;
