-- Run this whole file once in Supabase -> SQL Editor -> "New query" -> Run.

create extension if not exists pgcrypto with schema extensions;

create table if not exists employees (
  id text primary key,
  name text not null,
  email text unique not null,
  mobile text,
  department text not null check (department in ('Sales','Tech','HR','Admin')),
  role text not null check (role in ('Employee','HR','Admin')),
  designation text,
  salary numeric,
  joining_date date,
  manager text,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  password_hash text not null
);

alter table employees enable row level security;
revoke all on employees from anon, authenticated;

create or replace function login_employee(p_email text, p_password text)
returns table (
  id text, name text, email text, mobile text, department text, role text,
  designation text, salary numeric, joining_date date, manager text, status text
)
language sql
security definer
set search_path = public, extensions
as $$
  select e.id, e.name, e.email, e.mobile, e.department, e.role,
         e.designation, e.salary, e.joining_date, e.manager, e.status
  from employees e
  where lower(e.email) = lower(p_email)
    and e.password_hash = crypt(p_password, e.password_hash);
$$;

grant execute on function login_employee(text, text) to anon, authenticated;

insert into employees (id, name, email, mobile, department, role, designation, salary, joining_date, manager, status, password_hash) values
('EMP001','Ahmed Khan','ahmed@yes2broker.com','+91 98765 43210','Sales','Employee','Sales Executive',35000,'2025-03-12','Karan Mehta','Active', crypt('Ahmed@123', gen_salt('bf'))),
('EMP002','Priya Shah','priya@yes2broker.com','+91 91234 56780','HR','HR','HR Manager',52000,'2023-06-01','Zubair Merchant','Active', crypt('Priya@123', gen_salt('bf'))),
('EMP003','Zubair Merchant','zubair@yes2broker.com','+91 99887 66554','Admin','Admin','Operations Head',68000,'2021-01-15','—','Active', crypt('Zubair@123', gen_salt('bf')))
on conflict (id) do nothing;
