-- STEP 1 of 2. Run this whole file in Supabase -> SQL Editor -> "New query" -> Run.
-- Then run functions.sql. Both files are safe to re-run.
--
-- Every table has row level security ON and NO policies, and anon /
-- authenticated have no table privileges. The browser can therefore never
-- read or write a table directly — it can only call the functions in
-- functions.sql, and each of those checks the caller's session token.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table if not exists employees (
  id text primary key,
  name text not null,
  email text unique,
  mobile text,
  department text not null,
  role text not null check (role in ('Employee','HR','Admin')),
  designation text,
  salary numeric,
  joining_date date,
  manager text,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  password_hash text not null
);

-- Upgrades for databases created before these columns/rules existed.
alter table employees alter column email drop not null;
-- ISO weekday of the employee's weekly off: 1 = Monday ... 7 = Sunday, null = none.
alter table employees add column if not exists week_off smallint default 7 check (week_off between 1 and 7);
alter table employees drop constraint if exists employees_department_check;
alter table employees add constraint employees_department_check
  check (department in ('Sales','Tech','HR','Admin','Management'));

create unique index if not exists employees_email_lower_idx on employees (lower(email));

-- ---------------------------------------------------------------------------
-- Login sessions. Only a SHA-256 hash of the token is stored, so a leaked
-- table dump can't be replayed as a login.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  token_hash text primary key,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_employee_idx on sessions (employee_id);

-- ---------------------------------------------------------------------------
-- Attendance: one row per employee per working day.
-- ---------------------------------------------------------------------------
create table if not exists attendance (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null check (status in ('Present','Late','Half Day','Absent','Leave')),
  note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (employee_id, work_date),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index if not exists attendance_date_idx on attendance (work_date);

-- ---------------------------------------------------------------------------
-- Leave requests
-- ---------------------------------------------------------------------------
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  leave_type text not null check (leave_type in ('Casual','Sick','Earned','Unpaid')),
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  review_note text,
  reviewed_by text references employees(id) on update cascade on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_requests_employee_idx on leave_requests (employee_id, start_date);

-- ---------------------------------------------------------------------------
-- Personal tasks (reminders an employee keeps for themselves)
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  status text not null default 'Pending' check (status in ('Pending','Completed')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_employee_idx on tasks (employee_id, status);

-- ---------------------------------------------------------------------------
-- Daily reports. The form answers live in `data` so the form fields can
-- change without a migration.
-- ---------------------------------------------------------------------------
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade on delete cascade,
  report_date date not null,
  report_type text not null check (report_type in ('Normal','Sole Selling')),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Approved','Rejected')),
  review_note text,
  reviewed_by text references employees(id) on update cascade on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date, report_type)
);
create index if not exists daily_reports_date_idx on daily_reports (report_date);

-- ---------------------------------------------------------------------------
-- Per-employee module access. A missing row means "use the default for
-- this employee's role/department" (see private.default_permission).
-- ---------------------------------------------------------------------------
create table if not exists employee_permissions (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  module text not null,
  enabled boolean not null,
  primary key (employee_id, module)
);

-- ---------------------------------------------------------------------------
-- Lock every table down.
-- ---------------------------------------------------------------------------
alter table employees enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;
alter table leave_requests enable row level security;
alter table tasks enable row level security;
alter table daily_reports enable row level security;
alter table employee_permissions enable row level security;

revoke all on employees, sessions, attendance, leave_requests, tasks, daily_reports, employee_permissions
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- No accounts are created here. Load your team with a seed file (see
-- README), or create the first Admin by hand:
--
--   insert into employees (id, name, email, department, role, password_hash)
--   values ('EMP001', 'Your Name', 'you@example.com', 'Admin', 'Admin',
--           extensions.crypt('a-strong-password', extensions.gen_salt('bf')));
-- ---------------------------------------------------------------------------
