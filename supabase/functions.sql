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

-- Each employee has their own weekly off (employees.week_off, ISO weekday:
-- 1 = Monday ... 7 = Sunday; null = no weekly off).
drop function if exists private.is_working_day(date);
create or replace function private.is_working_day(d date, p_week_off smallint) returns boolean
language sql immutable as $$ select p_week_off is null or extract(isodow from d) <> p_week_off $$;

-- A login lasts 30 days from the last time the panel was opened (get_me
-- extends it), and never more than 90 days from signing in. Log out, a
-- password change or reset, and deactivation still end sessions at once.
create or replace function private.session_days() returns int
language sql immutable as $$ select 30 $$;
create or replace function private.session_max_days() returns int
language sql immutable as $$ select 90 $$;

-- ===========================================================================
-- Internal helpers
-- ===========================================================================
create or replace function private.today() returns date
language sql stable as $$ select (now() at time zone private.tz())::date $$;

create or replace function private.modules() returns text[]
language sql immutable as $$
  select array['attendance','tasks','normalReport','soleSelling','builderData','analytics','leave']
$$;

-- Salary is never in here: only an Admin sees it (see private.with_salary).
create or replace function private.employee_json(e public.employees) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'email', coalesce(e.email, ''), 'mobile', coalesce(e.mobile, ''),
    'department', e.department, 'role', e.role, 'designation', coalesce(e.designation, ''),
    'salary', null, 'joiningDate', coalesce(e.joining_date::text, ''),
    'manager', coalesce(e.manager, ''), 'status', e.status, 'weekOff', e.week_off
  )
$$;

-- Adds the salary for an Admin viewer only.
create or replace function private.with_salary(j jsonb, e public.employees, me public.employees) returns jsonb
language sql stable as $$
  select case when me.role = 'Admin' then j || jsonb_build_object('salary', coalesce(e.salary, 0)) else j end
$$;

create or replace function private.default_permission(e public.employees, p_module text) returns boolean
language sql stable as $$
  select case p_module
    when 'attendance' then true
    when 'tasks' then true
    when 'normalReport' then e.department in ('Sales','Admin')
    when 'soleSelling' then e.department = 'Sales'
    when 'builderData' then e.department <> 'Tech'
    when 'analytics' then e.role = 'Admin'
    when 'leave' then true
    else false
  end
$$;

create or replace function private.permissions_json(e public.employees) returns jsonb
language sql stable set search_path = public, private as $$
  -- Analytics is for Admins only, whatever is saved.
  select jsonb_object_agg(m.module, coalesce(p.enabled, private.default_permission(e, m.module))
                                    and (m.module <> 'analytics' or e.role = 'Admin'))
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

-- ===========================================================================
-- Auth
-- ===========================================================================
-- p_email accepts either the email address or the employee code (EMP004).
create or replace function public.login_employee(p_email text, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_emp employees;
  v_token text;
  v_login text := lower(trim(coalesce(p_email, '')));
begin
  delete from sessions where expires_at < now();

  -- 10 wrong passwords in a row lock this email/code for 15 minutes.
  if exists (select 1 from login_attempts where login = v_login and locked_until > now()) then
    raise exception 'Too many attempts, try again in 15 minutes.' using errcode = '42501';
  end if;

  select * into v_emp from employees
  where (lower(email) = v_login or id = upper(v_login))
    and password_hash = crypt(p_password, password_hash);

  if not found then
    insert into login_attempts as la (login, failures, updated_at) values (v_login, 1, now())
    on conflict (login) do update
      set failures = case when la.locked_until is not null and la.locked_until <= now() then 1 else la.failures + 1 end,
          locked_until = case when (case when la.locked_until is not null and la.locked_until <= now() then 1 else la.failures + 1 end) >= 10
                              then now() + interval '15 minutes' end,
          updated_at = now();
    perform pg_sleep(0.5); -- slows down password guessing
    return null;
  end if;
  delete from login_attempts where login = v_login;
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
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  -- Opening the panel keeps you signed in (written at most once a day).
  update sessions
     set expires_at = least(now() + make_interval(days => private.session_days()),
                            created_at + make_interval(days => private.session_max_days()))
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and expires_at < now() + make_interval(days => private.session_days() - 1);
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
declare
  v_me employees := private.require_manager(p_token);
begin
  return coalesce((select jsonb_agg(private.with_salary(private.employee_json(e), e, v_me) order by e.name) from employees e), '[]'::jsonb);
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
    case when v_me.role = 'Admin' then nullif(p_data ->> 'salary', '')::numeric end,  -- only an Admin sets salary
    coalesce(nullif(p_data ->> 'joiningDate', '')::date, private.today()),
    p_data ->> 'manager', coalesce(p_data ->> 'status', 'Active'),
    case when p_data ? 'weekOff' then (p_data ->> 'weekOff')::smallint else 7 end,
    crypt(p_password, gen_salt('bf'))
  ) returning * into v_emp;
  return private.with_salary(private.employee_json(v_emp), v_emp, v_me);
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
    -- HR never sees salary, so an HR edit keeps whatever is there.
    salary = case when v_me.role = 'Admin' then nullif(p_data ->> 'salary', '')::numeric else v_old.salary end,
    joining_date = nullif(p_data ->> 'joiningDate', '')::date,
    manager = p_data ->> 'manager', status = p_data ->> 'status', week_off = case when p_data ? 'weekOff' then (p_data ->> 'weekOff')::smallint else v_old.week_off end
  where id = p_id
  returning * into v_emp;

  if v_emp.status <> 'Active' then
    delete from sessions where employee_id = p_id;
  end if;
  return private.with_salary(private.employee_json(v_emp), v_emp, v_me);
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
  if p_module = 'analytics' and p_enabled
     and not exists (select 1 from employees where id = p_employee_id and role = 'Admin') then
    raise exception 'Analytics can only be turned on for Admins.' using errcode = '42501';
  end if;
  insert into employee_permissions (employee_id, module, enabled) values (p_employee_id, p_module, p_enabled)
  on conflict (employee_id, module) do update set enabled = excluded.enabled;
end $$;

-- ===========================================================================
-- Dashboards
-- ===========================================================================
create or replace function public.employee_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
  v_today date := private.today();
begin
  return jsonb_build_object(
    -- Daily reports live in sales_reports (supabase/reports.sql).
    'recentReports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'date', r.report_date, 'type', r.report_type,
                                 'title', case when r.report_type = 'Normal' then 'Normal Daily Report'
                                               else 'Sole Selling – ' || coalesce((select name from projects p where p.id = r.project_id), '') end)
                                 order by r.report_date desc)
                               from (select * from sales_reports where employee_id = v_emp.id
                                     order by report_date desc, submitted_at desc limit 4) r), '[]'::jsonb),
    'reportFiledToday', exists (select 1 from sales_reports where employee_id = v_emp.id and report_date = v_today)
  );
end $$;

create or replace function public.admin_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_today date := private.today();
  v_month_start date := date_trunc('month', private.today())::date;
begin
  perform private.require_manager(p_token);
  return jsonb_build_object(
    'totalEmployees', (select count(*) from employees),
    'activeEmployees', (select count(*) from employees where status = 'Active'),
    'reportsToday', (select count(*) from sales_reports where report_date = v_today),
    'pendingReports', 0,
    -- Reports filed this month per active employee.
    'employeeStats', coalesce((
      select jsonb_agg(jsonb_build_object('employee', private.employee_json(e),
               'reportsThisMonth', (select count(*) from sales_reports r where r.employee_id = e.id and r.report_date >= v_month_start))
             order by e.name)
      from employees e where e.status = 'Active'
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
      'employee_dashboard','admin_dashboard'
    )
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
