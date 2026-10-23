-- STEP 2 of 2. Run after schema.sql. Safe to re-run whenever this file changes.
--
-- How auth works: login_employee() checks the password and returns a random
-- session token. The browser keeps that token and passes it as p_token to
-- every other function. Each function resolves the token to an employee
-- (private.session_employee) and checks role / module permission before
-- touching any table. Helpers live in the `private` schema, which the
-- Supabase API does not expose and anon cannot execute.
--
-- Office rules (timezone, late cut-off, weekly off) are in the
-- "Office settings" section just below — edit them there.

-- Remove the old functions that were callable without any login.
drop function if exists public.login_employee(text, text);
drop function if exists public.list_employees();
drop function if exists public.create_employee(text,text,text,text,text,text,text,numeric,date,text,text,text);
drop function if exists public.update_employee(text,text,text,text,text,text,text,numeric,date,text,text);
drop function if exists public.reset_employee_password(text, text);

-- ===========================================================================
-- Office settings
-- ===========================================================================
create or replace function private.tz() returns text
language sql immutable as $$ select 'Asia/Kolkata' $$;

-- Check-ins after this local time are marked Late.
create or replace function private.late_after() returns time
language sql immutable as $$ select time '10:15' $$;

-- Each employee has their own weekly off (employees.week_off, ISO weekday:
-- 1 = Monday ... 7 = Sunday; null = no weekly off).
drop function if exists private.is_working_day(date);
create or replace function private.is_working_day(d date, p_week_off smallint) returns boolean
language sql immutable as $$ select p_week_off is null or extract(isodow from d) <> p_week_off $$;

create or replace function private.session_days() returns int
language sql immutable as $$ select 7 $$;

-- ===========================================================================
-- Internal helpers
-- ===========================================================================
create or replace function private.today() returns date
language sql stable as $$ select (now() at time zone private.tz())::date $$;

-- The first day anyone used attendance. Days before it aren't counted as
-- absences, so rates aren't dragged down by the time before go-live.
create or replace function private.tracking_start() returns date
language sql stable set search_path = public, private as $$
  select coalesce(min(work_date), private.today()) from attendance
$$;

-- First day an employee's attendance should count from, given a period start.
create or replace function private.rate_start(e public.employees, p_from date) returns date
language sql stable as $$
  select greatest(p_from, coalesce(e.joining_date, p_from), private.tracking_start())
$$;

create or replace function private.modules() returns text[]
language sql immutable as $$
  select array['attendance','tasks','normalReport','soleSelling','builderData','inquiryForm','analytics']
$$;

create or replace function private.employee_json(e public.employees) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'email', coalesce(e.email, ''), 'mobile', coalesce(e.mobile, ''),
    'department', e.department, 'role', e.role, 'designation', coalesce(e.designation, ''),
    'salary', coalesce(e.salary, 0), 'joiningDate', coalesce(e.joining_date::text, ''),
    'manager', coalesce(e.manager, ''), 'status', e.status, 'weekOff', e.week_off
  )
$$;

create or replace function private.default_permission(e public.employees, p_module text) returns boolean
language sql stable as $$
  select case p_module
    when 'attendance' then true
    when 'tasks' then true
    when 'normalReport' then e.department in ('Sales','Admin')
    when 'soleSelling' then e.department = 'Sales'
    when 'analytics' then e.role <> 'Employee'
    else false
  end
$$;

create or replace function private.permissions_json(e public.employees) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_object_agg(m.module, coalesce(p.enabled, private.default_permission(e, m.module)))
  from unnest(private.modules()) as m(module)
  left join employee_permissions p on p.employee_id = e.id and p.module = m.module
$$;

-- Resolves a session token to an active employee, or raises.
create or replace function private.session_employee(p_token text) returns public.employees
language plpgsql stable set search_path = public, extensions, private as $$
declare
  v_emp employees;
begin
  select e.* into v_emp
  from sessions s join employees e on e.id = s.employee_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
    and e.status = 'Active';
  if not found then
    raise exception 'Your session has expired. Please sign in again.' using errcode = '28000';
  end if;
  return v_emp;
end $$;

create or replace function private.require_manager(p_token text) returns public.employees
language plpgsql stable set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  if v_emp.role not in ('HR','Admin') then
    raise exception 'Only HR or Admin can do this.' using errcode = '42501';
  end if;
  return v_emp;
end $$;

create or replace function private.require_module(p_token text, p_module text) returns public.employees
language plpgsql stable set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  if not coalesce((private.permissions_json(v_emp) ->> p_module)::boolean, false) then
    raise exception 'You don''t have access to this module. Contact HR or Admin.' using errcode = '42501';
  end if;
  return v_emp;
end $$;

create or replace function private.attendance_json(a public.attendance) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'date', a.work_date, 'checkIn', a.check_in, 'checkOut', a.check_out,
    'status', a.status, 'note', coalesce(a.note, ''),
    'minutes', case when a.check_in is not null and a.check_out is not null
                    then floor(extract(epoch from a.check_out - a.check_in) / 60)::int end
  )
$$;

create or replace function private.leave_json(l public.leave_requests) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'employeeId', l.employee_id,
    'employeeName', (select name from employees where id = l.employee_id),
    'type', l.leave_type, 'startDate', l.start_date, 'endDate', l.end_date,
    'days', (select count(*) from generate_series(l.start_date, l.end_date, interval '1 day') d
             where private.is_working_day(d::date, (select week_off from employees where id = l.employee_id))),
    'reason', l.reason, 'status', l.status, 'reviewNote', coalesce(l.review_note, ''),
    'reviewedBy', (select name from employees where id = l.reviewed_by),
    'reviewedAt', l.reviewed_at, 'createdAt', l.created_at
  )
$$;

create or replace function private.task_json(t public.tasks) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'priority', t.priority,
    'status', t.status, 'dueDate', coalesce(t.due_date::text, ''), 'createdAt', t.created_at
  )
$$;

create or replace function private.report_json(r public.daily_reports) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'employeeId', r.employee_id,
    'employeeName', (select name from employees where id = r.employee_id),
    'date', r.report_date, 'type', r.report_type, 'data', r.data, 'status', r.status,
    'reviewNote', coalesce(r.review_note, ''),
    'reviewedBy', (select name from employees where id = r.reviewed_by),
    'submittedAt', r.submitted_at, 'updatedAt', r.updated_at
  )
$$;

-- Attendance rate for one employee between two dates: attended days over
-- working days, not counting approved leave (or a today not yet checked in)
-- against them.
create or replace function private.attendance_rate(p_employee_id text, p_from date, p_to date) returns int
language sql stable set search_path = public, private as $$
  with days as (
    select d::date as d from generate_series(p_from, p_to, interval '1 day') d
    where private.is_working_day(d::date, (select week_off from employees where id = p_employee_id))
  ), joined as (
    select a.status from days left join attendance a on a.employee_id = p_employee_id and a.work_date = days.d
    where days.d < private.today() or a.work_date is not null -- today only counts once they're in
  )
  select case
    when count(*) filter (where status is distinct from 'Leave') = 0 then null
    else round(100.0 * (count(*) filter (where status in ('Present','Late'))
                        + 0.5 * count(*) filter (where status = 'Half Day'))
               / count(*) filter (where status is distinct from 'Leave'))::int
  end
  from joined
$$;

-- ===========================================================================
-- Auth
-- ===========================================================================
-- p_email accepts either the email address or the employee code (EMP004).
create or replace function public.login_employee(p_email text, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_emp employees;
  v_token text;
begin
  delete from sessions where expires_at < now();

  select * into v_emp from employees
  where (lower(email) = lower(trim(p_email)) or id = upper(trim(p_email)))
    and password_hash = crypt(p_password, password_hash);

  if not found then
    perform pg_sleep(0.5); -- slows down password guessing
    return null;
  end if;
  if v_emp.status <> 'Active' then
    raise exception 'This account is inactive. Contact HR or Admin.' using errcode = '42501';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into sessions (token_hash, employee_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_emp.id, now() + make_interval(days => private.session_days()));

  return jsonb_build_object(
    'token', v_token,
    'employee', private.employee_json(v_emp),
    'permissions', private.permissions_json(v_emp)
  );
end $$;

create or replace function public.logout_employee(p_token text) returns void
language sql volatile security definer set search_path = public, extensions as $$
  delete from sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Refreshes the signed-in user's profile and permissions.
create or replace function public.get_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  return jsonb_build_object('employee', private.employee_json(v_emp), 'permissions', private.permissions_json(v_emp));
end $$;

create or replace function public.change_my_password(p_token text, p_current text, p_new text) returns void
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  if v_emp.password_hash <> crypt(p_current, v_emp.password_hash) then
    raise exception 'Your current password is incorrect.' using errcode = '28P01';
  end if;
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'New password must be at least 8 characters.' using errcode = '22023';
  end if;
  update employees set password_hash = crypt(p_new, gen_salt('bf')) where id = v_emp.id;
  -- Sign out every other device.
  delete from sessions where employee_id = v_emp.id
    and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
end $$;

-- ===========================================================================
-- Employees (HR / Admin)
-- ===========================================================================
create or replace function public.list_employees(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(private.employee_json(e) order by e.name) from employees e), '[]'::jsonb);
end $$;

create or replace function public.create_employee(p_token text, p_data jsonb, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_emp employees;
begin
  if v_me.role <> 'Admin' and p_data ->> 'role' = 'Admin' then
    raise exception 'Only an Admin can create another Admin.' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Initial password must be at least 8 characters.' using errcode = '22023';
  end if;
  if nullif(trim(p_data ->> 'email'), '') is not null
     and exists (select 1 from employees where lower(email) = lower(trim(p_data ->> 'email'))) then
    raise exception 'An employee with this email already exists.' using errcode = '23505';
  end if;
  if exists (select 1 from employees where id = upper(trim(p_data ->> 'id'))) then
    raise exception 'An employee with this ID already exists.' using errcode = '23505';
  end if;

  insert into employees (id, name, email, mobile, department, role, designation, salary, joining_date, manager, status, week_off, password_hash)
  values (
    upper(trim(p_data ->> 'id')), trim(p_data ->> 'name'), nullif(lower(trim(p_data ->> 'email')), ''), p_data ->> 'mobile',
    p_data ->> 'department', p_data ->> 'role', p_data ->> 'designation',
    nullif(p_data ->> 'salary', '')::numeric, coalesce(nullif(p_data ->> 'joiningDate', '')::date, private.today()),
    p_data ->> 'manager', coalesce(p_data ->> 'status', 'Active'),
    case when p_data ? 'weekOff' then (p_data ->> 'weekOff')::smallint else 7 end,
    crypt(p_password, gen_salt('bf'))
  ) returning * into v_emp;
  return private.employee_json(v_emp);
end $$;

create or replace function public.update_employee(p_token text, p_id text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_old employees;
  v_emp employees;
begin
  select * into v_old from employees where id = p_id;
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;
  if v_me.role <> 'Admin' and (v_old.role = 'Admin' or p_data ->> 'role' = 'Admin') then
    raise exception 'Only an Admin can edit Admin accounts.' using errcode = '42501';
  end if;
  if v_me.id = p_id and (p_data ->> 'role' <> v_old.role or p_data ->> 'status' <> 'Active') then
    raise exception 'You can''t change your own role or deactivate yourself.' using errcode = '42501';
  end if;
  if nullif(trim(p_data ->> 'email'), '') is not null
     and exists (select 1 from employees where lower(email) = lower(trim(p_data ->> 'email')) and id <> p_id) then
    raise exception 'Another employee already uses this email.' using errcode = '23505';
  end if;

  update employees set
    name = trim(p_data ->> 'name'), email = nullif(lower(trim(p_data ->> 'email')), ''), mobile = p_data ->> 'mobile',
    department = p_data ->> 'department', role = p_data ->> 'role', designation = p_data ->> 'designation',
    salary = nullif(p_data ->> 'salary', '')::numeric, joining_date = nullif(p_data ->> 'joiningDate', '')::date,
    manager = p_data ->> 'manager', status = p_data ->> 'status', week_off = case when p_data ? 'weekOff' then (p_data ->> 'weekOff')::smallint else v_old.week_off end
  where id = p_id
  returning * into v_emp;

  if v_emp.status <> 'Active' then
    delete from sessions where employee_id = p_id;
  end if;
  return private.employee_json(v_emp);
end $$;

create or replace function public.reset_employee_password(p_token text, p_id text, p_new_password text) returns void
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_target employees;
begin
  select * into v_target from employees where id = p_id;
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;
  if v_me.role <> 'Admin' and v_target.role = 'Admin' then
    raise exception 'Only an Admin can reset an Admin''s password.' using errcode = '42501';
  end if;
  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.' using errcode = '22023';
  end if;
  update employees set password_hash = crypt(p_new_password, gen_salt('bf')) where id = p_id;
  delete from sessions where employee_id = p_id; -- force sign-out everywhere
end $$;

-- ===========================================================================
-- Permissions (HR / Admin)
-- ===========================================================================
create or replace function public.get_employee_permissions(p_token text, p_employee_id text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees;
begin
  perform private.require_manager(p_token);
  select * into v_emp from employees where id = p_employee_id;
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;
  return private.permissions_json(v_emp);
end $$;

create or replace function public.set_employee_permission(p_token text, p_employee_id text, p_module text, p_enabled boolean) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  if not (p_module = any (private.modules())) then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;
  insert into employee_permissions (employee_id, module, enabled) values (p_employee_id, p_module, p_enabled)
  on conflict (employee_id, module) do update set enabled = excluded.enabled;
end $$;

-- ===========================================================================
-- Attendance
-- ===========================================================================
create or replace function public.check_in(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'attendance');
  v_today date := private.today();
  v_row attendance;
begin
  select * into v_row from attendance where employee_id = v_emp.id and work_date = v_today;
  if found and v_row.check_in is not null then
    raise exception 'You have already checked in today.' using errcode = '23505';
  end if;
  if found and v_row.status = 'Leave' then
    raise exception 'You are on approved leave today.' using errcode = '22023';
  end if;

  insert into attendance (employee_id, work_date, check_in, status, updated_by)
  values (v_emp.id, v_today, now(),
          case when (now() at time zone private.tz())::time > private.late_after() then 'Late' else 'Present' end,
          v_emp.id)
  on conflict (employee_id, work_date) do update
    set check_in = excluded.check_in, status = excluded.status, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;
  return private.attendance_json(v_row);
end $$;

create or replace function public.check_out(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'attendance');
  v_row attendance;
begin
  update attendance set check_out = now(), updated_by = v_emp.id, updated_at = now()
  where employee_id = v_emp.id and work_date = private.today()
    and check_in is not null and check_out is null
  returning * into v_row;
  if not found then
    raise exception 'Check in first — or you have already checked out today.' using errcode = '22023';
  end if;
  return private.attendance_json(v_row);
end $$;

-- p_month: any date inside the month to show. Past working days with no
-- record come back as Absent; today with no record comes back with a null status.
create or replace function public.my_attendance(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'attendance');
  v_from date := date_trunc('month', p_month)::date;
  v_to date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, private.today());
  v_tracked_from date := private.rate_start(v_emp, v_from);
begin
  return coalesce((
    select jsonb_agg(
      case when a.work_date is not null then private.attendance_json(a)
           else jsonb_build_object('date', d.d, 'checkIn', null, 'checkOut', null, 'minutes', null, 'note', '',
                                   'status', case when d.d < private.today() then 'Absent' end)
      end order by d.d desc)
    from (select g::date as d from generate_series(v_from, v_to, interval '1 day') g) d
    left join attendance a on a.employee_id = v_emp.id and a.work_date = d.d
    where (private.is_working_day(d.d, v_emp.week_off) and d.d >= v_tracked_from) or a.work_date is not null
  ), '[]'::jsonb);
end $$;

create or replace function public.team_attendance(p_token text, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(
      jsonb_build_object('employee', private.employee_json(e)) ||
      case when a.work_date is not null then private.attendance_json(a)
           else jsonb_build_object('date', p_date, 'checkIn', null, 'checkOut', null, 'minutes', null, 'note', '',
                                   'status', case when p_date < private.today() and private.is_working_day(p_date, e.week_off)
                                                   and p_date >= private.rate_start(e, p_date) then 'Absent' end)
      end order by e.name)
    from employees e
    left join attendance a on a.employee_id = e.id and a.work_date = p_date
    where e.status = 'Active' or a.work_date is not null
  ), '[]'::jsonb);
end $$;

-- HR / Admin correction. p_check_in / p_check_out are local office times.
create or replace function public.set_attendance(
  p_token text, p_employee_id text, p_date date, p_status text,
  p_check_in time, p_check_out time, p_note text
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_row attendance;
begin
  if p_date > private.today() and p_status not in ('Leave') then
    raise exception 'Only leave can be recorded for a future date.' using errcode = '22023';
  end if;
  if p_check_in is not null and p_check_out is not null and p_check_out < p_check_in then
    raise exception 'Check-out must be after check-in.' using errcode = '22023';
  end if;
  insert into attendance (employee_id, work_date, check_in, check_out, status, note, updated_by)
  values (p_employee_id, p_date,
          case when p_check_in is not null then (p_date + p_check_in) at time zone private.tz() end,
          case when p_check_out is not null then (p_date + p_check_out) at time zone private.tz() end,
          p_status, nullif(trim(p_note), ''), v_me.id)
  on conflict (employee_id, work_date) do update set
    check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status,
    note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;
  return private.attendance_json(v_row);
end $$;

-- ===========================================================================
-- Leave
-- ===========================================================================
create or replace function public.request_leave(
  p_token text, p_type text, p_start date, p_end date, p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
  v_row leave_requests;
begin
  if p_end < p_start then
    raise exception 'End date must be on or after the start date.' using errcode = '22023';
  end if;
  if p_start < private.today() - 30 then
    raise exception 'Leave can''t be requested more than 30 days in the past.' using errcode = '22023';
  end if;
  if exists (select 1 from leave_requests
             where employee_id = v_emp.id and status in ('Pending','Approved')
               and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'You already have a leave request covering some of these dates.' using errcode = '23505';
  end if;
  insert into leave_requests (employee_id, leave_type, start_date, end_date, reason)
  values (v_emp.id, p_type, p_start, p_end, coalesce(trim(p_reason), ''))
  returning * into v_row;
  return private.leave_json(v_row);
end $$;

create or replace function public.my_leaves(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  return coalesce((select jsonb_agg(private.leave_json(l) order by l.start_date desc)
                   from leave_requests l where l.employee_id = v_emp.id), '[]'::jsonb);
end $$;

create or replace function public.cancel_leave(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  update leave_requests set status = 'Cancelled'
  where id = p_id and employee_id = v_emp.id and status = 'Pending';
  if not found then
    raise exception 'Only your own pending requests can be cancelled.' using errcode = '22023';
  end if;
end $$;

-- p_status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | null for all.
create or replace function public.list_leave_requests(p_token text, p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(private.leave_json(l) order by l.created_at desc)
                   from leave_requests l where p_status is null or l.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.review_leave(p_token text, p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_row leave_requests;
begin
  select * into v_row from leave_requests where id = p_id;
  if not found or v_row.status <> 'Pending' then
    raise exception 'This request is no longer pending.' using errcode = '22023';
  end if;
  if v_row.employee_id = v_me.id then
    raise exception 'Someone else must review your own leave request.' using errcode = '42501';
  end if;

  update leave_requests set
    status = case when p_approve then 'Approved' else 'Rejected' end,
    review_note = nullif(trim(p_note), ''), reviewed_by = v_me.id, reviewed_at = now()
  where id = p_id returning * into v_row;

  -- Mark approved working days as Leave, without overwriting days the
  -- employee actually checked in.
  if p_approve then
    insert into attendance (employee_id, work_date, status, note, updated_by)
    select v_row.employee_id, d::date, 'Leave', v_row.leave_type || ' leave', v_me.id
    from generate_series(v_row.start_date, v_row.end_date, interval '1 day') d
    where private.is_working_day(d::date, (select week_off from employees where id = v_row.employee_id))
    on conflict (employee_id, work_date) do update
      set status = 'Leave', note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
      where attendance.check_in is null;
  end if;
  return private.leave_json(v_row);
end $$;

-- ===========================================================================
-- Tasks (personal)
-- ===========================================================================
create or replace function public.list_tasks(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'tasks');
begin
  return coalesce((
    select jsonb_agg(private.task_json(t) order by (t.status = 'Completed'), t.due_date nulls last, t.created_at desc)
    from tasks t where t.employee_id = v_emp.id
  ), '[]'::jsonb);
end $$;

-- p_id null creates a task, otherwise updates it.
create or replace function public.save_task(
  p_token text, p_id uuid, p_title text, p_description text, p_priority text, p_due_date date
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'tasks');
  v_row tasks;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Task title is required.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into tasks (employee_id, title, description, priority, due_date)
    values (v_emp.id, trim(p_title), coalesce(p_description, ''), p_priority, p_due_date)
    returning * into v_row;
  else
    update tasks set title = trim(p_title), description = coalesce(p_description, ''),
      priority = p_priority, due_date = p_due_date, updated_at = now()
    where id = p_id and employee_id = v_emp.id
    returning * into v_row;
    if not found then
      raise exception 'Task not found.' using errcode = 'P0002';
    end if;
  end if;
  return private.task_json(v_row);
end $$;

create or replace function public.set_task_status(p_token text, p_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'tasks');
  v_row tasks;
begin
  update tasks set status = p_status, updated_at = now(),
    completed_at = case when p_status = 'Completed' then now() end
  where id = p_id and employee_id = v_emp.id
  returning * into v_row;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0002';
  end if;
  return private.task_json(v_row);
end $$;

create or replace function public.delete_task(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.require_module(p_token, 'tasks');
begin
  delete from tasks where id = p_id and employee_id = v_emp.id;
end $$;

-- ===========================================================================
-- Daily reports
-- ===========================================================================
create or replace function private.report_module(p_type text) returns text
language sql immutable as $$
  select case p_type when 'Normal' then 'normalReport' when 'Sole Selling' then 'soleSelling' end
$$;

create or replace function public.my_reports(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  return coalesce((select jsonb_agg(private.report_json(r) order by r.report_date desc, r.report_type)
                   from daily_reports r where r.employee_id = v_emp.id), '[]'::jsonb);
end $$;

-- p_id null creates a report. p_submit true submits it, false saves a draft.
-- Only Draft and Rejected reports can be edited.
create or replace function public.save_report(
  p_token text, p_id uuid, p_date date, p_type text, p_data jsonb, p_submit boolean
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees;
  v_row daily_reports;
  v_status text := case when p_submit then 'Submitted' else 'Draft' end;
begin
  if private.report_module(p_type) is null then
    raise exception 'Unknown report type.' using errcode = '22023';
  end if;
  v_emp := private.require_module(p_token, private.report_module(p_type));
  if p_date > private.today() then
    raise exception 'You can''t file a report for a future date.' using errcode = '22023';
  end if;

  if p_id is null then
    if exists (select 1 from daily_reports where employee_id = v_emp.id and report_date = p_date and report_type = p_type) then
      raise exception 'You already have a % report for this date — edit that one instead.', p_type using errcode = '23505';
    end if;
    insert into daily_reports (employee_id, report_date, report_type, data, status, submitted_at)
    values (v_emp.id, p_date, p_type, coalesce(p_data, '{}'::jsonb), v_status, case when p_submit then now() end)
    returning * into v_row;
  else
    update daily_reports set data = coalesce(p_data, '{}'::jsonb), status = v_status, updated_at = now(),
      submitted_at = case when p_submit then now() else submitted_at end,
      review_note = case when p_submit then null else review_note end
    where id = p_id and employee_id = v_emp.id and status in ('Draft','Rejected')
    returning * into v_row;
    if not found then
      raise exception 'This report has already been submitted and can''t be edited.' using errcode = '22023';
    end if;
  end if;
  return private.report_json(v_row);
end $$;

create or replace function public.delete_report(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  delete from daily_reports where id = p_id and employee_id = v_emp.id and status = 'Draft';
  if not found then
    raise exception 'Only drafts can be deleted.' using errcode = '22023';
  end if;
end $$;

create or replace function public.list_team_reports(p_token text, p_from date, p_to date, p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(private.report_json(r) order by r.report_date desc, r.submitted_at desc)
    from daily_reports r
    where r.report_date between p_from and p_to
      and r.status <> 'Draft'
      and (p_status is null or r.status = p_status)
  ), '[]'::jsonb);
end $$;

create or replace function public.review_report(p_token text, p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.require_manager(p_token);
  v_row daily_reports;
begin
  update daily_reports set
    status = case when p_approve then 'Approved' else 'Rejected' end,
    review_note = nullif(trim(p_note), ''), reviewed_by = v_me.id, reviewed_at = now(), updated_at = now()
  where id = p_id and status = 'Submitted' and employee_id <> v_me.id
  returning * into v_row;
  if not found then
    raise exception 'Only submitted reports from other employees can be reviewed.' using errcode = '22023';
  end if;
  return private.report_json(v_row);
end $$;

-- ===========================================================================
-- Dashboards
-- ===========================================================================
create or replace function public.employee_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
  v_today date := private.today();
  v_month_start date := date_trunc('month', private.today())::date;
begin
  return jsonb_build_object(
    'today', (select private.attendance_json(a) from attendance a where a.employee_id = v_emp.id and a.work_date = v_today),
    'isWorkingDay', private.is_working_day(v_today, v_emp.week_off),
    'month', jsonb_build_object(
      'present', (select count(*) from attendance where employee_id = v_emp.id and work_date between v_month_start and v_today and status in ('Present','Late','Half Day')),
      'late', (select count(*) from attendance where employee_id = v_emp.id and work_date between v_month_start and v_today and status = 'Late'),
      'leave', (select count(*) from attendance where employee_id = v_emp.id and work_date between v_month_start and v_today and status = 'Leave'),
      'workingDays', (select count(*) from generate_series(private.rate_start(v_emp, v_month_start), v_today, interval '1 day') d where private.is_working_day(d::date, v_emp.week_off)),
      'rate', private.attendance_rate(v_emp.id, private.rate_start(v_emp, v_month_start), v_today)
    ),
    'tasks', jsonb_build_object(
      'pending', (select count(*) from tasks where employee_id = v_emp.id and status = 'Pending'),
      'completed', (select count(*) from tasks where employee_id = v_emp.id and status = 'Completed'),
      'overdue', (select count(*) from tasks where employee_id = v_emp.id and status = 'Pending' and due_date < v_today),
      'upcoming', coalesce((select jsonb_agg(private.task_json(t) order by t.due_date nulls last, t.created_at desc)
                            from (select * from tasks where employee_id = v_emp.id and status = 'Pending'
                                  order by due_date nulls last, created_at desc limit 5) t), '[]'::jsonb)
    ),
    'recentReports', coalesce((select jsonb_agg(private.report_json(r) order by r.report_date desc)
                               from (select * from daily_reports where employee_id = v_emp.id
                                     order by report_date desc limit 4) r), '[]'::jsonb),
    'reportFiledToday', exists (select 1 from daily_reports where employee_id = v_emp.id and report_date = v_today and status in ('Submitted','Approved')),
    'pendingLeaves', (select count(*) from leave_requests where employee_id = v_emp.id and status = 'Pending'),
    'upcomingLeave', (select private.leave_json(l) from leave_requests l
                      where l.employee_id = v_emp.id and l.status = 'Approved' and l.end_date >= v_today
                      order by l.start_date limit 1)
  );
end $$;

create or replace function public.admin_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_today date := private.today();
  v_month_start date := date_trunc('month', private.today())::date;
  v_active int;
begin
  perform private.require_manager(p_token);
  select count(*) into v_active from employees where status = 'Active';

  return jsonb_build_object(
    'totalEmployees', (select count(*) from employees),
    'activeEmployees', v_active,
    'presentToday', (select count(*) from attendance a join employees e on e.id = a.employee_id
                     where e.status = 'Active' and a.work_date = v_today and a.check_in is not null),
    'lateToday', (select count(*) from attendance a join employees e on e.id = a.employee_id
                  where e.status = 'Active' and a.work_date = v_today and a.status = 'Late'),
    'onLeaveToday', (select count(*) from attendance a join employees e on e.id = a.employee_id
                     where e.status = 'Active' and a.work_date = v_today and a.status = 'Leave'),
    'pendingLeaves', (select count(*) from leave_requests where status = 'Pending'),
    'reportsToday', (select count(*) from daily_reports where report_date = v_today and status in ('Submitted','Approved')),
    'pendingReports', (select count(*) from daily_reports where status = 'Submitted'),
    -- Last 7 days, oldest first: share of the people due in that day who came in
    -- (anyone on their weekly off that day isn't counted).
    'weeklyTrend', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'day', to_char(d, 'Dy'), 'rate',
               case when due = 0 then 0 else round(100.0 * came / due)::int end) order by d)
      from (
        select g::date as d,
          (select count(*) from employees e where e.status = 'Active' and private.is_working_day(g::date, e.week_off)) as due,
          (select count(*) from attendance a join employees e on e.id = a.employee_id
           where e.status = 'Active' and private.is_working_day(g::date, e.week_off)
             and a.work_date = g::date and a.status in ('Present','Late','Half Day')) as came
        from generate_series(v_today - 6, v_today, interval '1 day') g
        where g::date >= private.tracking_start()
      ) days
    ), '[]'::jsonb),
    -- Attendance rate per month of the current year, up to today.
    'monthlyTrend', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'rate', coalesce((
               select round(avg(r))::int from (
                 select private.attendance_rate(e.id, private.rate_start(e, m::date),
                                                least((m + interval '1 month - 1 day')::date, v_today)) as r
                 from employees e where e.status = 'Active'
                   and private.rate_start(e, m::date) <= least((m + interval '1 month - 1 day')::date, v_today)
               ) x where r is not null), null)) order by m)
      from generate_series(date_trunc('year', v_today::timestamp), v_today::timestamp, interval '1 month') m
    ), '[]'::jsonb),
    -- Per-employee stats for this month.
    'employeeStats', coalesce((
      select jsonb_agg(s order by (s ->> 'attendanceRate')::int desc nulls last, s -> 'employee' ->> 'name')
      from (
        select jsonb_build_object(
          'employee', private.employee_json(e),
          'attendanceRate', private.attendance_rate(e.id, private.rate_start(e, v_month_start), v_today),
          'reportsThisMonth', (select count(*) from daily_reports r where r.employee_id = e.id
                               and r.report_date >= v_month_start and r.status <> 'Draft'),
          'tasksCompleted', (select count(*) from tasks t where t.employee_id = e.id
                             and t.status = 'Completed' and t.completed_at >= v_month_start),
          'checkedInToday', exists (select 1 from attendance a where a.employee_id = e.id
                                    and a.work_date = v_today and a.check_in is not null)
        ) as s
        from employees e where e.status = 'Active'
      ) x
    ), '[]'::jsonb)
  );
end $$;

-- ===========================================================================
-- Grants: helpers stay private; the API functions above are callable by
-- the browser (they all do their own token checks).
-- ===========================================================================
revoke execute on all functions in schema private from public, anon, authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'login_employee','logout_employee','get_me','change_my_password',
      'list_employees','create_employee','update_employee','reset_employee_password',
      'get_employee_permissions','set_employee_permission',
      'check_in','check_out','my_attendance','team_attendance','set_attendance',
      'request_leave','my_leaves','cancel_leave','list_leave_requests','review_leave',
      'list_tasks','save_task','set_task_status','delete_task',
      'my_reports','save_report','delete_report','list_team_reports','review_report',
      'employee_dashboard','admin_dashboard'
    )
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
