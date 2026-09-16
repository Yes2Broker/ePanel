-- Run this after schema.sql. Adds list/create/update/reset-password
-- functions so the Admin > Employees page can talk to real data.

create or replace function list_employees()
returns table (
  id text, name text, email text, mobile text, department text, role text,
  designation text, salary numeric, joining_date date, manager text, status text
)
language sql
security definer
set search_path = public, extensions
as $$
  select id, name, email, mobile, department, role, designation, salary, joining_date, manager, status
  from employees
  order by name;
$$;
grant execute on function list_employees() to anon, authenticated;

create or replace function create_employee(
  p_id text, p_name text, p_email text, p_mobile text, p_department text,
  p_role text, p_designation text, p_salary numeric, p_joining_date date,
  p_manager text, p_status text, p_password text
)
returns table (
  id text, name text, email text, mobile text, department text, role text,
  designation text, salary numeric, joining_date date, manager text, status text
)
language sql
security definer
set search_path = public, extensions
as $$
  insert into employees (id, name, email, mobile, department, role, designation, salary, joining_date, manager, status, password_hash)
  values (p_id, p_name, p_email, p_mobile, p_department, p_role, p_designation, p_salary, p_joining_date, p_manager, p_status, crypt(p_password, gen_salt('bf')))
  returning id, name, email, mobile, department, role, designation, salary, joining_date, manager, status;
$$;
grant execute on function create_employee(text,text,text,text,text,text,text,numeric,date,text,text,text) to anon, authenticated;

create or replace function update_employee(
  p_id text, p_name text, p_email text, p_mobile text, p_department text,
  p_role text, p_designation text, p_salary numeric, p_joining_date date,
  p_manager text, p_status text
)
returns table (
  id text, name text, email text, mobile text, department text, role text,
  designation text, salary numeric, joining_date date, manager text, status text
)
language sql
security definer
set search_path = public, extensions
as $$
  update employees set
    name = p_name, email = p_email, mobile = p_mobile, department = p_department,
    role = p_role, designation = p_designation, salary = p_salary,
    joining_date = p_joining_date, manager = p_manager, status = p_status
  where id = p_id
  returning id, name, email, mobile, department, role, designation, salary, joining_date, manager, status;
$$;
grant execute on function update_employee(text,text,text,text,text,text,text,numeric,date,text,text) to anon, authenticated;

create or replace function reset_employee_password(p_id text, p_new_password text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update employees set password_hash = crypt(p_new_password, gen_salt('bf')) where id = p_id;
$$;
grant execute on function reset_employee_password(text, text) to anon, authenticated;
