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
-- Failed sign-ins in a row, per email/code. 10 in a row locks it for 15
-- minutes; a successful sign-in clears it.
-- ---------------------------------------------------------------------------
create table if not exists login_attempts (
  login text primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

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
alter table login_attempts enable row level security;
alter table employee_permissions enable row level security;

revoke all on employees, sessions, login_attempts, employee_permissions
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- No accounts are created here. Load your team with a seed file (see
-- README), or create the first Admin by hand:
--
--   insert into employees (id, name, email, department, role, password_hash)
--   values ('EMP001', 'Your Name', 'you@example.com', 'Admin', 'Admin',
--           extensions.crypt('a-strong-password', extensions.gen_salt('bf')));
-- ---------------------------------------------------------------------------
