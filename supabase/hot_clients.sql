-- ===========================================================================
-- Hot clients: customers an employee expects to close soon. Kept up to date
-- from the daily report form or the Daily Reports → Hot clients tab.
-- Run AFTER functions.sql, reports.sql and builder.sql.
-- Safe to re-run: it only creates what's missing and replaces functions.
--
-- Access: an employee (with a daily report permission) sees and changes only
-- their own; HR and Admin see and change everyone's. Phone numbers stay in the
-- panel: they're returned only to the client's owner and HR/Admin, and are
-- never part of the report summary / WhatsApp text.
-- ===========================================================================

create table if not exists hot_clients (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10}$'),
  project_id uuid references builder_projects(id) on delete set null,
  project_name text,
  expected_closure_date date not null,
  remarks text,
  status text not null default 'Active' check (status in ('Active','Closed-Won','Lost')),
  created_at timestamptz not null default now(),
  created_by text references employees(id) on update cascade,
  updated_at timestamptz,
  updated_by text references employees(id) on update cascade,
  closed_at timestamptz
);
create index if not exists hot_clients_emp_idx on hot_clients (employee_id, status);
-- Lead type: Hot (closing soon) or Warm. Existing rows become Hot.
alter table hot_clients add column if not exists temperature text not null default 'Hot';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hot_clients_temperature_check') then
    alter table hot_clients add constraint hot_clients_temperature_check check (temperature in ('Hot','Warm'));
  end if;
end $$;

create table if not exists hot_client_changes (
  id bigint generated always as identity primary key,
  client_id uuid not null references hot_clients(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by text references employees(id) on update cascade,
  changed_at timestamptz not null default now()
);
create index if not exists hot_client_changes_idx on hot_client_changes (client_id, changed_at);

-- What each hot client looked like before a daily report changed it (null =
-- added in that report), so deleting the report can undo those changes.
create table if not exists hot_client_report_snaps (
  report_id uuid not null references sales_reports(id) on delete cascade,
  client_id uuid not null references hot_clients(id) on delete cascade,
  before jsonb,
  primary key (report_id, client_id)
);
alter table hot_client_report_snaps enable row level security;
revoke all on hot_client_report_snaps from anon, authenticated;

alter table hot_clients enable row level security;
alter table hot_client_changes enable row level security;
revoke all on hot_clients, hot_client_changes from anon, authenticated;

-- May this person keep hot clients at all? (a daily report permission, or HR/Admin)
create or replace function private.hc_allowed(e employees) returns boolean
language sql stable set search_path = public, private as $$
  select private.is_manager(e)
      or coalesce((private.permissions_json(e) ->> 'normalReport')::boolean, false)
      or coalesce((private.permissions_json(e) ->> 'soleSelling')::boolean, false)
$$;

create or replace function private.hc_json(h hot_clients) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'id', h.id, 'employeeId', h.employee_id, 'employeeName', (select name from employees where id = h.employee_id),
    'name', h.customer_name, 'phone', h.customer_phone,
    'projectId', h.project_id, 'project', coalesce((select name from builder_projects where id = h.project_id), h.project_name, ''),
    'expectedDate', h.expected_closure_date, 'remarks', coalesce(h.remarks, ''), 'status', h.status, 'temperature', h.temperature,
    'createdAt', h.created_at, 'updatedAt', h.updated_at,
    'closedOn', case when h.closed_at is null then null else (h.closed_at at time zone private.tz())::date end)
$$;

-- Add / change one hot client (shared by the tab and the report form).
-- p: {id?, employeeId?, name, phone, projectId?, project?, expectedDate, remarks?, status?, temperature?}
create or replace function private.hc_apply(v_me employees, p jsonb) returns uuid
language plpgsql volatile set search_path = public, private as $$
declare
  v_old hot_clients;
  v_new hot_clients;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_emp text := coalesce(nullif(p ->> 'employeeId', ''), v_me.id);
  v_name text; v_phone text; v_pid uuid; v_pname text; v_date date; v_remarks text; v_status text; v_temp text;
  v_today date := private.today();
begin
  if v_id is not null then
    select * into v_old from hot_clients where id = v_id for update;
    if not found then raise exception 'Hot client not found.' using errcode = 'P0002'; end if;
    v_emp := v_old.employee_id;
    -- Only the fields sent change; the rest keep their values.
    p := jsonb_build_object('name', v_old.customer_name, 'phone', v_old.customer_phone, 'projectId', v_old.project_id,
           'project', v_old.project_name, 'expectedDate', v_old.expected_closure_date, 'remarks', v_old.remarks, 'status', v_old.status, 'temperature', v_old.temperature)
         || (p - 'id' - 'employeeId');
  end if;
  v_name := trim(coalesce(p ->> 'name', ''));
  v_phone := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_pid := nullif(p ->> 'projectId', '')::uuid;
  v_pname := nullif(trim(coalesce(p ->> 'project', '')), '');
  v_date := nullif(p ->> 'expectedDate', '')::date;
  v_remarks := nullif(trim(coalesce(p ->> 'remarks', '')), '');
  v_status := coalesce(nullif(p ->> 'status', ''), 'Active');
  v_temp := coalesce(nullif(p ->> 'temperature', ''), 'Hot');
  if length(v_phone) = 12 and v_phone like '91%' then v_phone := substr(v_phone, 3); end if;
  if v_emp <> v_me.id and not private.is_manager(v_me) then
    raise exception 'You can only change your own hot clients.' using errcode = '42501';
  end if;
  if v_emp = v_me.id and not private.hc_allowed(v_me) then
    raise exception 'Hot clients need the daily report permission.' using errcode = '42501';
  end if;
  if not exists (select 1 from employees where id = v_emp) then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
  if v_name = '' then raise exception 'Enter the customer name.' using errcode = '22023'; end if;
  if v_phone !~ '^[0-9]{10}$' then raise exception 'Enter a 10-digit contact number for %.', v_name using errcode = '22023'; end if;
  if v_date is null then raise exception 'Pick the expected closure date for %.', v_name using errcode = '22023'; end if;
  if v_status not in ('Active','Closed-Won','Lost') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  if v_temp not in ('Hot','Warm') then raise exception 'Choose Hot or Warm.' using errcode = '22023'; end if;
  -- A new date (when adding, or when changing it) must be today or later.
  if v_date < v_today and (v_id is null or v_date is distinct from v_old.expected_closure_date) then
    raise exception 'Expected closure date for % must be today or later.', v_name using errcode = '22023';
  end if;
  if v_pid is not null then
    if not exists (select 1 from builder_projects where id = v_pid) then v_pid := null; else v_pname := null; end if;
  end if;

  if v_id is null then
    insert into hot_clients (employee_id, customer_name, customer_phone, project_id, project_name, expected_closure_date, remarks, status, temperature, created_by, closed_at)
    values (v_emp, v_name, v_phone, v_pid, v_pname, v_date, v_remarks, v_status, v_temp, v_me.id, case when v_status <> 'Active' then now() end)
    returning * into v_new;
    insert into hot_client_changes (client_id, field, new_value, changed_by) values (v_new.id, 'Added', v_name, v_me.id);
    return v_new.id;
  end if;

  update hot_clients set customer_name = v_name, customer_phone = v_phone, project_id = v_pid, project_name = v_pname,
    expected_closure_date = v_date, remarks = v_remarks, status = v_status, temperature = v_temp,
    closed_at = case when v_status = 'Active' then null when v_old.status = 'Active' then now() else closed_at end,
    updated_at = now(), updated_by = v_me.id
  where id = v_id returning * into v_new;

  insert into hot_client_changes (client_id, field, old_value, new_value, changed_by)
  select v_id, f, o, n, v_me.id from (values
    ('Customer name', v_old.customer_name, v_new.customer_name),
    ('Contact number', v_old.customer_phone, v_new.customer_phone),
    ('Project', coalesce((select name from builder_projects where id = v_old.project_id), v_old.project_name),
                coalesce((select name from builder_projects where id = v_new.project_id), v_new.project_name)),
    ('Expected closure', to_char(v_old.expected_closure_date, 'DD Mon YYYY'), to_char(v_new.expected_closure_date, 'DD Mon YYYY')),
    ('Remarks', v_old.remarks, v_new.remarks),
    ('Status', v_old.status, v_new.status),
    ('Type', v_old.temperature, v_new.temperature)) x(f, o, n)
  where o is distinct from n;
  return v_id;
end $$;

-- ===========================================================================
-- Public functions
-- ===========================================================================
-- Mine (employee) or everyone's / one person's (HR, Admin). All statuses.
create or replace function public.hot_clients_list(p_token text, p_employee text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_mgr boolean := private.is_manager(v_me);
begin
  if not private.hc_allowed(v_me) then raise exception 'Hot clients need the daily report permission.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(private.hc_json(h) order by h.status <> 'Active', h.temperature <> 'Hot', h.expected_closure_date, h.customer_name)
    from hot_clients h
    where (case when v_mgr then p_employee is null or h.employee_id = p_employee else h.employee_id = v_me.id end)
  ), '[]'::jsonb);
end $$;

create or replace function public.hot_client_save(p_token text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_id uuid := private.hc_apply(v_me, p_data);
begin
  return (select private.hc_json(h) from hot_clients h where id = v_id);
end $$;

create or replace function public.hot_client_history(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_owner text := (select employee_id from hot_clients where id = p_id);
begin
  if v_owner is null or (v_owner <> v_me.id and not private.is_manager(v_me)) then
    raise exception 'Hot client not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('field', c.field, 'old', c.old_value, 'new', c.new_value,
             'by', (select name from employees where id = c.changed_by), 'at', c.changed_at) order by c.changed_at desc, c.id desc)
    from hot_client_changes c where c.client_id = p_id), '[]'::jsonb);
end $$;

-- Builder Data project names for the picker (names only, nothing sensitive).
create or replace function public.hot_client_projects(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
begin
  if not private.hc_allowed(v_me) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from builder_projects), '[]'::jsonb);
end $$;

-- Report + its hot client changes in one save (all or nothing).
create or replace function public.save_sales_report_hot(
  p_token text, p_report_id uuid, p_employee_id text, p_type text, p_project uuid, p_date date, p_payload jsonb, p_hot jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_saved jsonb := public.save_sales_report(p_token, p_report_id, p_employee_id, p_type, p_project, p_date, p_payload);
  v_report uuid := (v_saved ->> 'id')::uuid;
  v_item jsonb;
  v_id uuid;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_hot, '[]'::jsonb)) loop
    v_id := nullif(v_item ->> 'id', '')::uuid;
    -- Remember how it was before this report first changed it.
    if v_id is not null then
      insert into hot_client_report_snaps (report_id, client_id, before)
      select v_report, h.id, to_jsonb(h) from hot_clients h where h.id = v_id
      on conflict do nothing;
    end if;
    -- New clients belong to the report's person (HR/Admin filing for someone).
    v_id := private.hc_apply(v_me, v_item || jsonb_build_object('employeeId', v_saved ->> 'employeeId'));
    insert into hot_client_report_snaps (report_id, client_id, before) values (v_report, v_id, null) on conflict do nothing;
  end loop;
  return v_saved;
end $$;

-- A daily report was deleted: undo the hot-client changes saved with it
-- (clients added in it are removed; changed ones go back to how they were).
create or replace function private.hc_undo_report(p_report uuid) returns void
language plpgsql volatile set search_path = public, private as $$
declare
  sn hot_client_report_snaps;
  b hot_clients;
begin
  for sn in select * from hot_client_report_snaps where report_id = p_report loop
    if sn.before is null then
      delete from hot_clients where id = sn.client_id;
    else
      b := jsonb_populate_record(null::hot_clients, sn.before);
      update hot_clients set customer_name = b.customer_name, customer_phone = b.customer_phone, project_id = b.project_id,
        project_name = b.project_name, expected_closure_date = b.expected_closure_date, remarks = b.remarks, status = b.status,
        temperature = b.temperature, closed_at = b.closed_at, updated_at = now()
      where id = sn.client_id;
      insert into hot_client_changes (client_id, field, new_value) values (sn.client_id, 'Undone', 'Daily report deleted');
    end if;
  end loop;
  delete from hot_client_report_snaps where report_id = p_report;
end $$;

-- The hot clients block of a report: active that day, closed / lost that day.
create or replace function public.hot_clients_for_report(p_token text, p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  r sales_reports;
  v_end timestamptz;
  v_start timestamptz;
begin
  select * into r from sales_reports where id = p_report_id and deleted_at is null;
  if not found or (r.employee_id <> v_me.id and not private.is_manager(v_me)) then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  v_start := r.report_date::timestamp at time zone private.tz();
  v_end := (r.report_date + 1)::timestamp at time zone private.tz();
  return jsonb_build_object(
    'active', coalesce((select jsonb_agg(jsonb_build_object('name', h.customer_name,
        'project', coalesce((select name from builder_projects where id = h.project_id), h.project_name, ''),
        'expectedDate', h.expected_closure_date, 'remarks', coalesce(h.remarks, ''), 'temperature', h.temperature)
        order by h.temperature <> 'Hot', h.expected_closure_date, h.customer_name)
      from hot_clients h where h.employee_id = r.employee_id and h.created_at < v_end
        and (h.status = 'Active' or h.closed_at >= v_end)), '[]'::jsonb),
    'won', coalesce((select jsonb_agg(jsonb_build_object('name', h.customer_name,
        'project', coalesce((select name from builder_projects where id = h.project_id), h.project_name, '')) order by h.closed_at)
      from hot_clients h where h.employee_id = r.employee_id and h.status = 'Closed-Won' and h.closed_at >= v_start and h.closed_at < v_end), '[]'::jsonb),
    'lost', coalesce((select jsonb_agg(jsonb_build_object('name', h.customer_name,
        'project', coalesce((select name from builder_projects where id = h.project_id), h.project_name, '')) order by h.closed_at)
      from hot_clients h where h.employee_id = r.employee_id and h.status = 'Lost' and h.closed_at >= v_start and h.closed_at < v_end), '[]'::jsonb)
  );
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hot_clients_list','hot_client_save','hot_client_history','hot_client_projects','save_sales_report_hot','hot_clients_for_report')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
