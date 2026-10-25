-- STEP 3 of 3. Daily Reports (Normal + Sole Selling). Run after schema.sql and
-- functions.sql. Safe to re-run: it only creates tables that are missing and
-- replaces this file's functions. It never deletes or changes existing rows.
--
-- The rules follow the old Google-Sheets forms:
--   * Numbers: leads, calls, positive calls, tokens (and walk-ins on Sole Selling).
--   * "Visit Scheduled Today" = the visits booked in the report (client + date >= report date).
--   * Every visit due on the report date needs an action: Done (time, not in the
--     future) / Reschedule (from the next day) / Cancel (reason required).
--     Visits whose date has passed without an action are "overdue" and need
--     one too (imported old visits excepted: HR/Admin close those in bulk).
--   * "Future visit done today" picks from the person's upcoming visits + time.
--   * Site Visit Done = visits marked Done + future visits done. Walk-ins are
--     counted separately and are not part of Site Visit Done or any conversion.
--   * Site Visit Conversion % = done / calls, Closure Conversion % = tokens / done (1 decimal).

-- ===========================================================================
-- Tables
-- ===========================================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Active' check (status in ('Active','Closed')),
  created_at timestamptz not null default now()
);
create unique index if not exists projects_name_lower_idx on projects (lower(name));

-- Which Sole Selling projects each employee may report for.
create table if not exists employee_projects (
  employee_id text not null references employees(id) on update cascade on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  primary key (employee_id, project_id)
);

-- Other names a person appears under in old data ("Prateek Jethwa" -> EMP014).
create table if not exists employee_aliases (
  alias text primary key,            -- stored lower-case, trimmed
  employee_id text not null references employees(id) on update cascade on delete cascade
);

-- One report per person, per report type (and project), per day.
create table if not exists sales_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade,
  report_date date not null,
  report_type text not null check (report_type in ('Normal','Sole Selling')),
  project_id uuid references projects(id),
  leads int not null default 0 check (leads >= 0),
  calls int not null default 0 check (calls >= 0),
  positive int not null default 0 check (positive >= 0),
  scheduled int not null default 0 check (scheduled >= 0),
  done int not null default 0 check (done >= 0),
  tokens int not null default 0 check (tokens >= 0),
  walk_in int not null default 0 check (walk_in >= 0),
  source text not null default 'panel' check (source in ('panel','import')),
  import_key text unique,
  submitted_at timestamptz not null default now(),
  submitted_by text references employees(id) on update cascade,
  updated_at timestamptz,
  updated_by text references employees(id) on update cascade,
  check ((report_type = 'Normal' and project_id is null) or (report_type = 'Sole Selling' and project_id is not null))
);
create unique index if not exists sales_reports_one_per_day_idx on sales_reports
  (employee_id, report_date, report_type, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists sales_reports_date_idx on sales_reports (report_date);

-- A visit someone scheduled. It belongs to that person (and project) only.
create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on update cascade,
  report_type text not null check (report_type in ('Normal','Sole Selling')),
  project_id uuid references projects(id),
  client_name text not null,
  booked_on date not null,
  booked_report_id uuid references sales_reports(id) on delete set null,
  visit_date date not null,
  reschedule_date date,
  status text not null default 'Pending' check (status in ('Pending','Done','Cancelled')),
  cancel_reason text,
  source text not null default 'panel' check (source in ('panel','import')),
  import_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists site_visits_owner_idx on site_visits (employee_id, report_type, project_id, status);
-- Set when HR/Admin close an old visit in bulk (outside any report).
alter table site_visits add column if not exists closed_by text references employees(id) on update cascade;
alter table site_visits add column if not exists closed_at timestamptz;

-- What happened to a visit in a report: Done (today's visit or a future visit
-- done early), Reschedule or Cancel. prev_* lets an edit undo it cleanly.
-- Imported "Visits Done" rows land here too (visit_id null).
create table if not exists visit_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references sales_reports(id) on delete cascade,
  visit_id uuid references site_visits(id) on delete cascade,
  employee_id text not null references employees(id) on update cascade,
  report_type text not null,
  project_id uuid references projects(id),
  action_date date not null,
  action text not null check (action in ('done','reschedule','cancel')),
  kind text not null default 'today' check (kind in ('today','future','import')),
  client_name text not null,
  done_time text,
  new_date date,
  reason text,
  import_status text,
  prev_status text,
  prev_reschedule_date date,
  prev_cancel_reason text,
  import_key text unique,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists visit_actions_report_idx on visit_actions (report_id);
create index if not exists visit_actions_visit_idx on visit_actions (visit_id);

create table if not exists walk_ins (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references sales_reports(id) on delete cascade,
  client_name text not null,
  position int not null default 0,
  import_key text unique
);
create index if not exists walk_ins_report_idx on walk_ins (report_id);

-- Every change to a report after it was first submitted.
create table if not exists report_changes (
  id bigint generated always as identity primary key,
  report_id uuid not null references sales_reports(id) on delete cascade,
  changed_by text references employees(id) on update cascade,
  changed_at timestamptz not null default now(),
  field text not null,
  old_value text,
  new_value text
);
create index if not exists report_changes_report_idx on report_changes (report_id);

-- Small key/value settings (e.g. 10 PM email recipients).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null
);
insert into app_settings (key, value)
values ('report_email_recipients', '[]'::jsonb)   -- set them in the panel: Daily Reports -> 10 PM email
on conflict (key) do nothing;

-- Secrets are stored hashed, in the private schema the API can't reach.
create table if not exists private.app_secrets (
  name text primary key,
  secret_hash text not null
);

alter table projects enable row level security;
alter table employee_projects enable row level security;
alter table employee_aliases enable row level security;
alter table sales_reports enable row level security;
alter table site_visits enable row level security;
alter table visit_actions enable row level security;
alter table walk_ins enable row level security;
alter table report_changes enable row level security;
alter table app_settings enable row level security;
revoke all on projects, employee_projects, employee_aliases, sales_reports, site_visits,
  visit_actions, walk_ins, report_changes, app_settings from anon, authenticated;
revoke all on private.app_secrets from public, anon, authenticated;

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function private.now_time() returns text
language sql stable as $$ select to_char(now() at time zone private.tz(), 'HH24:MI') $$;

-- "12.5%" style percentage with one decimal; "0.0%" when the denominator is 0.
create or replace function private.pct(a numeric, b numeric) returns text
language sql immutable as $$ select case when coalesce(b, 0) = 0 then '0.0%' else to_char(round(a * 100.0 / b, 1), 'FM999990.0') || '%' end $$;

-- A visit that must be acted on in a report for p_date: due that day, or
-- overdue (date passed with no action). Imported old visits never block.
create or replace function private.visit_needs_action(v public.site_visits, p_date date) returns boolean
language sql immutable as $$
  select v.status = 'Pending' and (coalesce(v.reschedule_date, v.visit_date) = p_date
         or (coalesce(v.reschedule_date, v.visit_date) < p_date and v.source = 'panel'))
$$;

-- Why someone isn't expected to file on a day ('On leave', 'Weekly off',
-- 'Holiday', ...). The real version lives in leave.sql; this stand-in only
-- exists until that runs, and re-running this file never replaces it.
do $$
begin
  if to_regprocedure('private.day_off(public.employees,date)') is null then
    execute $f$create function private.day_off(e public.employees, d date) returns text
      language sql stable as 'select null::text'$f$;
  end if;
end $$;

create or replace function private.project_json(p public.projects) returns jsonb
language sql stable as $$ select jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) $$;

create or replace function private.report_title(p_type text, p_project uuid) returns text
language sql stable set search_path = public as $$
  select case when p_type = 'Normal' then 'Normal Daily Report'
              else 'Sole Selling – ' || coalesce((select name from projects where id = p_project), '?') end
$$;

-- May this employee file this report type / project?
create or replace function private.can_file(e public.employees, p_type text, p_project uuid) returns boolean
language sql stable set search_path = public, private as $$
  select case
    when p_type = 'Normal' then coalesce((private.permissions_json(e) ->> 'normalReport')::boolean, false)
    when p_type = 'Sole Selling' then coalesce((private.permissions_json(e) ->> 'soleSelling')::boolean, false)
      and exists (select 1 from employee_projects ep where ep.employee_id = e.id and ep.project_id = p_project)
    else false
  end
$$;

create or replace function private.is_manager(e public.employees) returns boolean
language sql immutable as $$ select e.role in ('HR','Admin') $$;

-- Totals + conversions for a person's reports of one type/project in a date range.
create or replace function private.report_totals(p_emp text, p_type text, p_project uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'leads', coalesce(sum(leads), 0), 'calls', coalesce(sum(calls), 0), 'positive', coalesce(sum(positive), 0),
    'scheduled', coalesce(sum(scheduled), 0), 'done', coalesce(sum(done), 0), 'tokens', coalesce(sum(tokens), 0),
    'walkIn', coalesce(sum(walk_in), 0),
    'siteVisitConversion', private.pct(coalesce(sum(done), 0), coalesce(sum(calls), 0)),
    'closureConversion', private.pct(coalesce(sum(tokens), 0), coalesce(sum(done), 0))
  )
  from sales_reports
  where (p_emp is null or employee_id = p_emp) and report_type = p_type
    and project_id is not distinct from p_project and report_date between p_from and p_to
$$;

create or replace function private.report_row_json(r public.sales_reports) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'id', r.id, 'employeeId', r.employee_id,
    'employeeName', (select name from employees where id = r.employee_id),
    'date', r.report_date, 'type', r.report_type, 'projectId', r.project_id,
    'projectName', (select name from projects where id = r.project_id),
    'title', private.report_title(r.report_type, r.project_id),
    'leads', r.leads, 'calls', r.calls, 'positive', r.positive, 'scheduled', r.scheduled,
    'done', r.done, 'tokens', r.tokens, 'walkIn', r.walk_in,
    'source', r.source, 'submittedAt', r.submitted_at,
    'editableUntil', r.submitted_at + interval '24 hours',
    'updatedAt', r.updated_at
  )
$$;

-- Everything the summary popup needs. MTD = 1st of the report's month up to the report's date.
create or replace function private.report_detail(p_id uuid) returns jsonb
language plpgsql stable set search_path = public, private as $$
declare
  r sales_reports;
begin
  select * into r from sales_reports where id = p_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  return private.report_row_json(r) || jsonb_build_object(
    'today', private.report_totals(r.employee_id, r.report_type, r.project_id, r.report_date, r.report_date),
    'mtd', private.report_totals(r.employee_id, r.report_type, r.project_id, date_trunc('month', r.report_date)::date, r.report_date),
    'doneVisits', coalesce((
      select jsonb_agg(jsonb_build_object('client', a.client_name, 'time', coalesce(a.done_time, ''), 'kind', a.kind)
                       order by a.done_time nulls last, a.created_at)
      from visit_actions a where a.report_id = r.id and a.action = 'done'), '[]'::jsonb),
    'walkIns', coalesce((select jsonb_agg(w.client_name order by w.position, w.client_name) from walk_ins w where w.report_id = r.id), '[]'::jsonb),
    'scheduledDetails', coalesce((
      select jsonb_agg(jsonb_build_object('client', v.client_name, 'date', v.visit_date,
                                          'rescheduleDate', v.reschedule_date, 'status', v.status)
                       order by v.visit_date, v.created_at)
      from site_visits v where v.booked_report_id = r.id), '[]'::jsonb),
    'submittedByName', (select name from employees where id = r.submitted_by),
    'updatedByName', (select name from employees where id = r.updated_by),
    'changeCount', (select count(*) from report_changes c where c.report_id = r.id and c.field <> 'Report')
  );
end $$;

-- Re-derive the visit counts of a panel report from its visits / walk-ins.
-- Site Visit Done never includes walk-ins.
create or replace function private.recompute_report(p_id uuid) returns void
language sql volatile set search_path = public as $$
  update sales_reports r set
    scheduled = (select count(*) from site_visits v where v.booked_report_id = r.id),
    walk_in = case when r.report_type = 'Sole Selling' then (select count(*) from walk_ins w where w.report_id = r.id) else 0 end,
    done = (select count(*) from visit_actions a where a.report_id = r.id and a.action = 'done')
  where r.id = p_id and r.source = 'panel'
$$;

create or replace function private.audit(p_report uuid, p_by text, p_field text, p_old text, p_new text) returns void
language sql volatile set search_path = public as $$
  insert into report_changes (report_id, changed_by, field, old_value, new_value)
  select p_report, p_by, p_field, p_old, p_new where p_old is distinct from p_new
$$;

-- Undo one action (restores the visit to how it was before).
create or replace function private.revert_action(a public.visit_actions) returns void
language sql volatile set search_path = public as $$
  update site_visits set status = a.prev_status, reschedule_date = a.prev_reschedule_date, cancel_reason = a.prev_cancel_reason
  where id = a.visit_id;
  delete from visit_actions where id = a.id;
$$;

-- An action is frozen when the same visit was acted on again in a later report.
create or replace function private.action_frozen(a public.visit_actions) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from visit_actions b where b.visit_id = a.visit_id and b.id <> a.id
                 and b.created_at > a.created_at and b.report_id is distinct from a.report_id)
$$;

create or replace function private.action_label(a public.visit_actions) returns text
language sql immutable as $$
  select case a.action
    when 'done' then 'Done ' || coalesce(a.done_time, '') || case when a.kind = 'future' then ' (future visit)' else '' end
    when 'reschedule' then 'Rescheduled to ' || to_char(a.new_date, 'DD Mon YYYY')
    when 'cancel' then 'Cancelled: ' || coalesce(a.reason, '')
  end
$$;

-- ===========================================================================
-- Projects (HR / Admin)
-- ===========================================================================
create or replace function public.list_projects(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(private.project_json(p) || jsonb_build_object(
      'people', (select count(*) from employee_projects ep join employees e on e.id = ep.employee_id
                 where ep.project_id = p.id and e.status = 'Active'),
      'reports', (select count(*) from sales_reports r where r.project_id = p.id))
      order by p.status, lower(p.name))
    from projects p), '[]'::jsonb);
end $$;

create or replace function public.save_project(p_token text, p_id uuid, p_name text, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_row projects;
begin
  perform private.require_manager(p_token);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Project name is required.' using errcode = '22023';
  end if;
  if exists (select 1 from projects where lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'A project with this name already exists.' using errcode = '23505';
  end if;
  if p_id is null then
    insert into projects (name) values (trim(p_name)) returning * into v_row;
  else
    update projects set name = trim(p_name), status = coalesce(p_status, status) where id = p_id returning * into v_row;
    if not found then
      raise exception 'Project not found.' using errcode = 'P0002';
    end if;
  end if;
  return private.project_json(v_row);
end $$;

create or replace function public.get_employee_projects(p_token text, p_employee_id text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(project_id) from employee_projects where employee_id = p_employee_id), '[]'::jsonb);
end $$;

create or replace function public.set_employee_projects(p_token text, p_employee_id text, p_project_ids uuid[]) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  delete from employee_projects where employee_id = p_employee_id and not (project_id = any (coalesce(p_project_ids, '{}')));
  insert into employee_projects (employee_id, project_id)
  select p_employee_id, unnest(coalesce(p_project_ids, '{}'))
  on conflict do nothing;
end $$;

-- ===========================================================================
-- Filing
-- ===========================================================================

-- The reports the signed-in person may file, with today's status for each.
create or replace function public.report_options(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
  v_today date := private.today();
begin
  return coalesce((
    select jsonb_agg(o order by o ->> 'sort')
    from (
      select jsonb_build_object('type', 'Normal', 'projectId', null, 'projectName', null,
               'title', 'Normal Daily Report', 'sort', '0',
               'todayReportId', (select id from sales_reports where employee_id = v_emp.id and report_date = v_today
                                 and report_type = 'Normal')) as o
      where coalesce((private.permissions_json(v_emp) ->> 'normalReport')::boolean, false)
      union all
      select jsonb_build_object('type', 'Sole Selling', 'projectId', p.id, 'projectName', p.name,
               'title', 'Sole Selling – ' || p.name, 'sort', '1' || lower(p.name),
               'todayReportId', (select id from sales_reports where employee_id = v_emp.id and report_date = v_today
                                 and report_type = 'Sole Selling' and project_id = p.id))
      from employee_projects ep join projects p on p.id = ep.project_id
      where ep.employee_id = v_emp.id and p.status = 'Active'
        and coalesce((private.permissions_json(v_emp) ->> 'soleSelling')::boolean, false)
    ) x
  ), '[]'::jsonb);
end $$;

-- Who may open / edit a report.
create or replace function private.report_access(p_token text, p_report_id uuid, p_for_edit boolean) returns public.employees
language plpgsql stable set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  r sales_reports;
begin
  select * into r from sales_reports where id = p_report_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if private.is_manager(v_me) then
    return v_me;
  end if;
  if r.employee_id <> v_me.id then
    raise exception 'You can only open your own reports.' using errcode = '42501';
  end if;
  if p_for_edit and (r.source <> 'panel' or now() > r.submitted_at + interval '24 hours') then
    raise exception 'This report can no longer be edited (24 hours after submitting). Ask HR or Admin.' using errcode = '42501';
  end if;
  return v_me;
end $$;

-- Data to draw the form: a new report (p_report_id null) or an edit.
-- HR/Admin may pass p_employee_id and any past date to file for someone else.
create or replace function public.report_form(
  p_token text, p_report_id uuid, p_employee_id text, p_type text, p_project uuid, p_date date
) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_emp employees;
  r sales_reports;
  v_type text := p_type;
  v_project uuid := p_project;
  v_date date := coalesce(p_date, private.today());
  v_existing uuid;
begin
  if p_report_id is not null then
    perform private.report_access(p_token, p_report_id, true);
    select * into r from sales_reports where id = p_report_id;
    select * into v_emp from employees where id = r.employee_id;
    v_type := r.report_type; v_project := r.project_id; v_date := r.report_date;
  else
    if p_employee_id is not null and p_employee_id <> v_me.id then
      if not private.is_manager(v_me) then
        raise exception 'Only HR or Admin can file for someone else.' using errcode = '42501';
      end if;
      select * into v_emp from employees where id = p_employee_id;
      if not found then
        raise exception 'Employee not found.' using errcode = 'P0002';
      end if;
    else
      v_emp := v_me;
      if not private.can_file(v_emp, v_type, v_project) then
        raise exception 'You don''t have access to this report. Contact HR or Admin.' using errcode = '42501';
      end if;
    end if;
    if not private.is_manager(v_me) and v_date <> private.today() then
      raise exception 'Reports can only be filed for today.' using errcode = '22023';
    end if;
    if v_date > private.today() then
      raise exception 'You can''t file a report for a future date.' using errcode = '22023';
    end if;
    if v_type = 'Sole Selling' and not exists (select 1 from projects where id = v_project and status = 'Active') then
      raise exception 'This project is closed or doesn''t exist.' using errcode = '22023';
    end if;
    if v_type = 'Normal' then v_project := null; end if;
    select id into v_existing from sales_reports
    where employee_id = v_emp.id and report_date = v_date and report_type = v_type and project_id is not distinct from v_project;
    if v_existing is not null then
      return jsonb_build_object('existingReportId', v_existing);
    end if;
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object('id', v_emp.id, 'name', v_emp.name),
    'type', v_type,
    'project', (select private.project_json(p) from projects p where p.id = v_project),
    'title', private.report_title(v_type, v_project),
    'date', v_date,
    'isToday', v_date = private.today(),
    'nowTime', private.now_time(),
    'report', case when r.id is null then null else private.report_row_json(r) end,
    -- Visits booked in this report.
    'scheduled', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'client', v.client_name, 'date', v.visit_date,
               'locked', exists (select 1 from visit_actions a where a.visit_id = v.id and a.report_id is distinct from r.id))
               order by v.created_at)
      from site_visits v where r.id is not null and v.booked_report_id = r.id), '[]'::jsonb),
    -- Visits due on the report date (plus the ones this report already acted on).
    'todayVisits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'client', v.client_name, 'visitDate', v.visit_date, 'rescheduleDate', v.reschedule_date,
               'bookedOn', v.booked_on, 'bookedHere', r.id is not null and v.booked_report_id = r.id,
               'overdue', coalesce(v.reschedule_date, v.visit_date) < v_date,
               'action', (select jsonb_build_object('action', a.action, 'time', a.done_time, 'date', a.new_date,
                                                    'reason', a.reason, 'frozen', private.action_frozen(a))
                          from visit_actions a where a.visit_id = v.id and a.report_id = r.id and a.kind = 'today'))
               order by v.booked_on, v.created_at)
      from site_visits v
      where v.employee_id = v_emp.id and v.report_type = v_type and v.project_id is not distinct from v_project
        and (private.visit_needs_action(v, v_date)
             or (r.id is not null and exists (select 1 from visit_actions a where a.visit_id = v.id and a.report_id = r.id and a.kind = 'today')))
    ), '[]'::jsonb),
    -- Upcoming visits that can be marked "future visit done".
    'futureVisits', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'client', v.client_name,
               'date', coalesce(v.reschedule_date, v.visit_date)) order by coalesce(v.reschedule_date, v.visit_date), v.created_at)
      from site_visits v
      where v.employee_id = v_emp.id and v.report_type = v_type and v.project_id is not distinct from v_project
        and ((v.status = 'Pending' and coalesce(v.reschedule_date, v.visit_date) > v_date
              and (r.id is null or v.booked_report_id is distinct from r.id))
             or (r.id is not null and exists (select 1 from visit_actions a where a.visit_id = v.id and a.report_id = r.id and a.kind = 'future')))
    ), '[]'::jsonb),
    'futureDone', coalesce((
      select jsonb_agg(jsonb_build_object('visitId', a.visit_id, 'time', a.done_time, 'frozen', private.action_frozen(a)) order by a.created_at)
      from visit_actions a where r.id is not null and a.report_id = r.id and a.kind = 'future'), '[]'::jsonb),
    'walkIns', coalesce((select jsonb_agg(w.client_name order by w.position) from walk_ins w where r.id is not null and w.report_id = r.id), '[]'::jsonb)
  );
end $$;

-- Submit a new report or save an edit. p_payload:
-- { leads, calls, positive, tokens,
--   scheduledCount?, doneCount?, walkInCount?   (imported reports only, HR/Admin)
--   scheduled: [{ id? | tempId?, client, date }],
--   actions:   [{ visitId | tempId, action: done|reschedule|cancel, time?, date?, reason? }],
--   (a visit booked and due on the same day is referenced by its tempId)
--   futureDone:[{ visitId, time }],
--   walkIns:   [ "client name", ... ] }
create or replace function public.save_sales_report(
  p_token text, p_report_id uuid, p_employee_id text, p_type text, p_project uuid, p_date date, p_payload jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_is_manager boolean := private.is_manager(v_me);
  v_emp employees;
  r sales_reports;
  v_old sales_reports;
  v_is_new boolean := p_report_id is null;
  v_type text := p_type;
  v_project uuid := p_project;
  v_date date := coalesce(p_date, private.today());
  v_is_today boolean;
  v_now text := private.now_time();
  v_item jsonb;
  v_visit site_visits;
  v_action visit_actions;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_eligible uuid[];
  v_seen uuid[] := '{}';
  v_time text;
  v_old_walkins text;
  v_new_walkins text;
  v_old_actions jsonb;
  v_temp jsonb := '{}'::jsonb;
  n int;
begin
  -- ---------- who / what ----------
  if v_is_new then
    if p_employee_id is not null and p_employee_id <> v_me.id then
      if not v_is_manager then
        raise exception 'Only HR or Admin can file for someone else.' using errcode = '42501';
      end if;
      select * into v_emp from employees where id = p_employee_id;
      if not found then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
    else
      v_emp := v_me;
      if not private.can_file(v_emp, v_type, v_project) then
        raise exception 'You don''t have access to this report. Contact HR or Admin.' using errcode = '42501';
      end if;
    end if;
    if not v_is_manager and v_date <> private.today() then
      raise exception 'Reports can only be filed for today.' using errcode = '22023';
    end if;
    if v_date > private.today() then
      raise exception 'You can''t file a report for a future date.' using errcode = '22023';
    end if;
    if v_type not in ('Normal','Sole Selling') then
      raise exception 'Unknown report type.' using errcode = '22023';
    end if;
    if v_type = 'Normal' then v_project := null; end if;
    if v_type = 'Sole Selling' and not exists (select 1 from projects where id = v_project and status = 'Active') then
      raise exception 'This project is closed or doesn''t exist.' using errcode = '22023';
    end if;
    if exists (select 1 from sales_reports where employee_id = v_emp.id and report_date = v_date
               and report_type = v_type and project_id is not distinct from v_project) then
      raise exception 'A report for this day has already been submitted. Open it from your past reports to edit it.' using errcode = '23505';
    end if;
  else
    perform private.report_access(p_token, p_report_id, true);
    select * into v_old from sales_reports where id = p_report_id for update;
    select * into v_emp from employees where id = v_old.employee_id;
    v_type := v_old.report_type; v_project := v_old.project_id; v_date := v_old.report_date;
  end if;
  v_is_today := v_date = private.today();

  -- ---------- numbers ----------
  foreach v_time in array array['leads','calls','positive','tokens'] loop
    if p_payload ->> v_time is null or (p_payload ->> v_time) !~ '^\d+$' then
      raise exception 'Please enter valid positive numbers in all fields.' using errcode = '22023';
    end if;
  end loop;

  if v_is_new then
    insert into sales_reports (employee_id, report_date, report_type, project_id, leads, calls, positive, tokens, submitted_by)
    values (v_emp.id, v_date, v_type, v_project, (p_payload ->> 'leads')::int, (p_payload ->> 'calls')::int,
            (p_payload ->> 'positive')::int, (p_payload ->> 'tokens')::int, v_me.id)
    returning * into r;
    perform private.audit(r.id, v_me.id, 'Report', null, case when v_me.id = v_emp.id then 'Submitted' else 'Submitted by ' || v_me.name end);
  else
    update sales_reports set leads = (p_payload ->> 'leads')::int, calls = (p_payload ->> 'calls')::int,
      positive = (p_payload ->> 'positive')::int, tokens = (p_payload ->> 'tokens')::int,
      updated_at = now(), updated_by = v_me.id
    where id = v_old.id returning * into r;
    perform private.audit(r.id, v_me.id, 'Today Leads', v_old.leads::text, r.leads::text);
    perform private.audit(r.id, v_me.id, 'Today Calls', v_old.calls::text, r.calls::text);
    perform private.audit(r.id, v_me.id, 'Positive Calls', v_old.positive::text, r.positive::text);
    perform private.audit(r.id, v_me.id, 'Tokens', v_old.tokens::text, r.tokens::text);

    -- Imported reports have no visit detail: HR/Admin edit their counts directly.
    if r.source = 'import' then
      foreach v_time in array array['scheduledCount','doneCount','walkInCount'] loop
        if coalesce(p_payload ->> v_time, '0') !~ '^\d+$' then
          raise exception 'Please enter valid positive numbers in all fields.' using errcode = '22023';
        end if;
      end loop;
      update sales_reports set scheduled = coalesce((p_payload ->> 'scheduledCount')::int, scheduled),
        done = coalesce((p_payload ->> 'doneCount')::int, done),
        walk_in = case when report_type = 'Sole Selling' then coalesce((p_payload ->> 'walkInCount')::int, walk_in) else 0 end
      where id = r.id returning * into r;
      perform private.audit(r.id, v_me.id, 'Visit Scheduled', v_old.scheduled::text, r.scheduled::text);
      perform private.audit(r.id, v_me.id, 'Site Visit Done', v_old.done::text, r.done::text);
      perform private.audit(r.id, v_me.id, 'Walk In', v_old.walk_in::text, r.walk_in::text);
      return private.report_detail(r.id);
    end if;
  end if;

  -- ---------- undo this report's earlier actions (edits only) ----------
  if not v_is_new then
    select coalesce(jsonb_object_agg(a.visit_id::text, private.action_label(a)), '{}'::jsonb) into v_old_actions
    from visit_actions a where a.report_id = r.id;
    for v_action in select * from visit_actions where report_id = r.id order by created_at desc loop
      if not private.action_frozen(v_action) then
        perform private.revert_action(v_action);
      end if;
    end loop;
  end if;

  -- ---------- visits booked in this report ----------
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'scheduled', '[]'::jsonb)) loop
    if coalesce(trim(v_item ->> 'client'), '') = '' or coalesce(v_item ->> 'date', '') = '' then
      raise exception 'Fill all scheduled visit fields.' using errcode = '22023';
    end if;
    if (v_item ->> 'date')::date < v_date then
      raise exception 'Scheduled visit date for % must be today or later.', trim(v_item ->> 'client') using errcode = '22023';
    end if;
    if nullif(v_item ->> 'id', '') is null then
      insert into site_visits (employee_id, report_type, project_id, client_name, booked_on, booked_report_id, visit_date)
      values (v_emp.id, v_type, v_project, trim(v_item ->> 'client'), v_date, r.id, (v_item ->> 'date')::date)
      returning id into v_id;
      if nullif(v_item ->> 'tempId', '') is not null then
        v_temp := v_temp || jsonb_build_object(v_item ->> 'tempId', v_id);
      end if;
      if not v_is_new then
        perform private.audit(r.id, v_me.id, 'Scheduled visit added', null, trim(v_item ->> 'client') || ' on ' || to_char((v_item ->> 'date')::date, 'DD Mon YYYY'));
      end if;
    else
      select * into v_visit from site_visits where id = (v_item ->> 'id')::uuid and booked_report_id = r.id for update;
      if not found then
        raise exception 'A scheduled visit in this report no longer exists. Reload and try again.' using errcode = 'P0002';
      end if;
      v_id := v_visit.id;
      if v_visit.client_name <> trim(v_item ->> 'client') or v_visit.visit_date <> (v_item ->> 'date')::date then
        if v_visit.status <> 'Pending' or exists (select 1 from visit_actions a where a.visit_id = v_id) then
          raise exception 'The visit for % was already acted on in a later report and can''t be changed here.', v_visit.client_name using errcode = '22023';
        end if;
        update site_visits set client_name = trim(v_item ->> 'client'), visit_date = (v_item ->> 'date')::date where id = v_id;
        perform private.audit(r.id, v_me.id, 'Scheduled visit',
          v_visit.client_name || ' on ' || to_char(v_visit.visit_date, 'DD Mon YYYY'),
          trim(v_item ->> 'client') || ' on ' || to_char((v_item ->> 'date')::date, 'DD Mon YYYY'));
      end if;
    end if;
    v_keep := v_keep || v_id;
  end loop;
  -- Removed rows.
  for v_visit in select * from site_visits where booked_report_id = r.id and not (id = any (v_keep)) loop
    if exists (select 1 from visit_actions a where a.visit_id = v_visit.id) then
      raise exception 'The visit for % was already acted on in a later report and can''t be removed.', v_visit.client_name using errcode = '22023';
    end if;
    delete from site_visits where id = v_visit.id;
    perform private.audit(r.id, v_me.id, 'Scheduled visit removed', v_visit.client_name || ' on ' || to_char(v_visit.visit_date, 'DD Mon YYYY'), null);
  end loop;

  -- ---------- today's visit actions ----------
  -- Every visit due (or overdue) on the report date needs an action.
  select coalesce(array_agg(v.id), '{}') into v_eligible from site_visits v
  where v.employee_id = v_emp.id and v.report_type = v_type and v.project_id is not distinct from v_project
    and private.visit_needs_action(v, v_date);

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'actions', '[]'::jsonb)) loop
    v_id := coalesce(nullif(v_temp ->> (v_item ->> 'tempId'), ''), nullif(v_item ->> 'visitId', ''))::uuid;
    if v_id is null or not (v_id = any (v_eligible)) then
      -- Frozen actions (changed later in another report) are kept as they are.
      if exists (select 1 from visit_actions a where a.visit_id = v_id and a.report_id = r.id) then continue; end if;
      raise exception 'One of today''s visits is no longer due today. Reload and try again.' using errcode = '22023';
    end if;
    if v_id = any (v_seen) then continue; end if;
    v_seen := v_seen || v_id;
    select * into v_visit from site_visits where id = v_id for update;
    if v_item ->> 'action' = 'done' then
      v_time := nullif(v_item ->> 'time', '');
      if v_time is null or v_time !~ '^\d{2}:\d{2}$' then
        raise exception 'Enter time for %', v_visit.client_name using errcode = '22023';
      end if;
      if v_is_today and v_time > v_now then
        raise exception 'Visit time for % can''t be in the future.', v_visit.client_name using errcode = '22023';
      end if;
      insert into visit_actions (report_id, visit_id, employee_id, report_type, project_id, action_date, action, kind, client_name,
                                 done_time, prev_status, prev_reschedule_date, prev_cancel_reason)
      values (r.id, v_id, v_emp.id, v_type, v_project, v_date, 'done', 'today', v_visit.client_name, v_time,
              v_visit.status, v_visit.reschedule_date, v_visit.cancel_reason);
      update site_visits set status = 'Done' where id = v_id;
    elsif v_item ->> 'action' = 'reschedule' then
      if nullif(v_item ->> 'date', '') is null then
        raise exception 'Select new date for %', v_visit.client_name using errcode = '22023';
      end if;
      if (v_item ->> 'date')::date <= v_date then
        raise exception 'New date for % must be from tomorrow.', v_visit.client_name using errcode = '22023';
      end if;
      insert into visit_actions (report_id, visit_id, employee_id, report_type, project_id, action_date, action, kind, client_name,
                                 new_date, prev_status, prev_reschedule_date, prev_cancel_reason)
      values (r.id, v_id, v_emp.id, v_type, v_project, v_date, 'reschedule', 'today', v_visit.client_name, (v_item ->> 'date')::date,
              v_visit.status, v_visit.reschedule_date, v_visit.cancel_reason);
      update site_visits set reschedule_date = (v_item ->> 'date')::date, status = 'Pending' where id = v_id;
    elsif v_item ->> 'action' = 'cancel' then
      if coalesce(trim(v_item ->> 'reason'), '') = '' then
        raise exception 'Enter cancel reason for %', v_visit.client_name using errcode = '22023';
      end if;
      insert into visit_actions (report_id, visit_id, employee_id, report_type, project_id, action_date, action, kind, client_name,
                                 reason, prev_status, prev_reschedule_date, prev_cancel_reason)
      values (r.id, v_id, v_emp.id, v_type, v_project, v_date, 'cancel', 'today', v_visit.client_name, trim(v_item ->> 'reason'),
              v_visit.status, v_visit.reschedule_date, v_visit.cancel_reason);
      update site_visits set status = 'Cancelled', cancel_reason = trim(v_item ->> 'reason') where id = v_id;
    else
      raise exception 'Select an action for %', v_visit.client_name using errcode = '22023';
    end if;
  end loop;
  select count(*) into n from unnest(v_eligible) e where not (e = any (v_seen));
  if n > 0 then
    raise exception 'Select an action (Done / Reschedule / Cancel) for every visit due today, including overdue ones.' using errcode = '22023';
  end if;

  -- ---------- future visits done today ----------
  v_seen := '{}';
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'futureDone', '[]'::jsonb)) loop
    v_id := nullif(v_item ->> 'visitId', '')::uuid;
    if v_id is null then
      raise exception 'Select a visit for every "future visit done" row.' using errcode = '22023';
    end if;
    if v_id = any (v_seen) then
      raise exception 'The same visit is selected twice in "future visit done".' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
    if exists (select 1 from visit_actions a where a.visit_id = v_id and a.report_id = r.id and a.kind = 'future') then
      continue; -- frozen, kept as is
    end if;
    select * into v_visit from site_visits where id = v_id for update;
    if not found or v_visit.employee_id <> v_emp.id or v_visit.report_type <> v_type
       or v_visit.project_id is distinct from v_project or v_visit.status <> 'Pending'
       or coalesce(v_visit.reschedule_date, v_visit.visit_date) <= v_date then
      raise exception 'A selected future visit is no longer available. Reload and try again.' using errcode = '22023';
    end if;
    v_time := nullif(v_item ->> 'time', '');
    if v_time is null or v_time !~ '^\d{2}:\d{2}$' then
      raise exception 'Enter time for %', v_visit.client_name using errcode = '22023';
    end if;
    if v_is_today and v_time > v_now then
      raise exception 'Visit time for % can''t be in the future.', v_visit.client_name using errcode = '22023';
    end if;
    insert into visit_actions (report_id, visit_id, employee_id, report_type, project_id, action_date, action, kind, client_name,
                               done_time, prev_status, prev_reschedule_date, prev_cancel_reason)
    values (r.id, v_id, v_emp.id, v_type, v_project, v_date, 'done', 'future', v_visit.client_name, v_time,
            v_visit.status, v_visit.reschedule_date, v_visit.cancel_reason);
    update site_visits set status = 'Done' where id = v_id;
  end loop;

  -- ---------- walk-ins (Sole Selling) ----------
  if v_type = 'Sole Selling' then
    select string_agg(client_name, ', ' order by position) into v_old_walkins from walk_ins where report_id = r.id;
    delete from walk_ins where report_id = r.id;
    n := 0;
    for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'walkIns', '[]'::jsonb)) loop
      if coalesce(trim(v_item #>> '{}'), '') = '' then
        raise exception 'Enter a client name for every walk-in.' using errcode = '22023';
      end if;
      n := n + 1;
      insert into walk_ins (report_id, client_name, position) values (r.id, trim(v_item #>> '{}'), n);
    end loop;
    select string_agg(client_name, ', ' order by position) into v_new_walkins from walk_ins where report_id = r.id;
    if not v_is_new then
      perform private.audit(r.id, v_me.id, 'Walk-ins', coalesce(v_old_walkins, '—'), coalesce(v_new_walkins, '—'));
    end if;
  end if;

  -- ---------- record visit-action changes, then counts ----------
  if not v_is_new then
    for v_item in
      select jsonb_build_object('visit', k, 'old', v_old_actions ->> k,
               'new', (select private.action_label(a) from visit_actions a where a.report_id = r.id and a.visit_id::text = k))
      from (select jsonb_object_keys(v_old_actions) as k
            union select a.visit_id::text from visit_actions a where a.report_id = r.id) keys
    loop
      perform private.audit(r.id, v_me.id,
        'Visit ' || coalesce((select client_name from site_visits where id = (v_item ->> 'visit')::uuid), ''),
        v_item ->> 'old', v_item ->> 'new');
    end loop;
  end if;

  perform private.recompute_report(r.id);
  select * into r from sales_reports where id = r.id;
  if not v_is_new then
    perform private.audit(r.id, v_me.id, 'Visit Scheduled', v_old.scheduled::text, r.scheduled::text);
    perform private.audit(r.id, v_me.id, 'Site Visit Done', v_old.done::text, r.done::text);
  end if;
  return private.report_detail(r.id);
end $$;

-- ===========================================================================
-- Reading reports
-- ===========================================================================
create or replace function public.get_report(p_token text, p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees;
  r sales_reports;
begin
  v_me := private.report_access(p_token, p_report_id, false);
  select * into r from sales_reports where id = p_report_id;
  return private.report_detail(p_report_id) || jsonb_build_object(
    'canEdit', private.is_manager(v_me) or (r.source = 'panel' and now() <= r.submitted_at + interval '24 hours'));
end $$;

create or replace function public.report_history(p_token text, p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', c.changed_at, 'by', (select name from employees where id = c.changed_by),
             'field', c.field, 'old', c.old_value, 'new', c.new_value) order by c.changed_at, c.id)
    from report_changes c where c.report_id = p_report_id), '[]'::jsonb);
end $$;

create or replace function public.my_sales_reports(p_token text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_emp employees := private.session_employee(p_token);
begin
  return coalesce((
    select jsonb_agg(private.report_row_json(r) || jsonb_build_object(
             'canEdit', r.source = 'panel' and now() <= r.submitted_at + interval '24 hours')
             order by r.report_date desc, r.report_type, r.project_id)
    from sales_reports r
    where r.employee_id = v_emp.id
      and (p_month is null or date_trunc('month', r.report_date) = date_trunc('month', p_month))
  ), '[]'::jsonb);
end $$;

-- Team list. Any filter may be null.
create or replace function public.list_sales_reports(
  p_token text, p_from date, p_to date, p_type text, p_project uuid, p_employee_id text
) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(private.report_row_json(r) order by r.report_date desc, (select name from employees where id = r.employee_id))
    from sales_reports r
    where r.report_date between p_from and p_to
      and (p_type is null or r.report_type = p_type)
      and (p_project is null or r.project_id = p_project)
      and (p_employee_id is null or r.employee_id = p_employee_id)
  ), '[]'::jsonb);
end $$;

-- Today / MTD totals per person and per report group (Normal, each project) for one date.
create or replace function public.team_report_summary(
  p_token text, p_date date, p_type text, p_project uuid, p_employee_id text
) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_from date := date_trunc('month', p_date)::date;
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'type', g.report_type, 'projectId', g.project_id,
             'title', private.report_title(g.report_type, g.project_id),
             'rows', coalesce((select jsonb_agg(jsonb_build_object(
                         'employeeId', e.id, 'employeeName', e.name,
                         'filedToday', exists (select 1 from sales_reports x where x.employee_id = e.id and x.report_date = p_date
                                               and x.report_type = g.report_type and x.project_id is not distinct from g.project_id),
                         'off', private.day_off(e, p_date),
                         'today', private.report_totals(e.id, g.report_type, g.project_id, p_date, p_date),
                         'mtd', private.report_totals(e.id, g.report_type, g.project_id, v_from, p_date)) order by e.name)
                      from employees e
                      where (p_employee_id is null or e.id = p_employee_id)
                        and exists (select 1 from sales_reports x where x.employee_id = e.id and x.report_date between v_from and p_date
                                    and x.report_type = g.report_type and x.project_id is not distinct from g.project_id)), '[]'::jsonb),
             'totals', jsonb_build_object(
                'today', private.report_totals(p_employee_id, g.report_type, g.project_id, p_date, p_date),
                'mtd', private.report_totals(p_employee_id, g.report_type, g.project_id, v_from, p_date)))
           order by g.report_type <> 'Normal', private.report_title(g.report_type, g.project_id))
    from (
      select 'Normal'::text as report_type, null::uuid as project_id
      union all
      select 'Sole Selling', p.id from projects p
      where p.status = 'Active' or exists (select 1 from sales_reports x where x.project_id = p.id and x.report_date between v_from and p_date)
    ) g
    where (p_type is null or g.report_type = p_type) and (p_project is null or g.project_id = p_project)
  ), '[]'::jsonb);
end $$;

-- ===========================================================================
-- 10 PM email
-- ===========================================================================
create or replace function public.get_report_email_recipients(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
begin
  if v_me.role <> 'Admin' then
    raise exception 'Only an Admin can do this.' using errcode = '42501';
  end if;
  return coalesce((select value from app_settings where key = 'report_email_recipients'), '[]'::jsonb);
end $$;

create or replace function public.set_report_email_recipients(p_token text, p_emails text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_clean text[];
begin
  if v_me.role <> 'Admin' then
    raise exception 'Only an Admin can do this.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(trim(e))), '{}') into v_clean from unnest(p_emails) e where trim(e) <> '';
  if exists (select 1 from unnest(v_clean) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'One of the email addresses doesn''t look right.' using errcode = '22023';
  end if;
  insert into app_settings (key, value) values ('report_email_recipients', to_jsonb(v_clean))
  on conflict (key) do update set value = excluded.value;
  return to_jsonb(v_clean);
end $$;

-- One email per group: Normal, plus each active project. Rows = anyone with a
-- report this month or week (for that group). WTD starts on Monday.
create or replace function private.email_payload(p_date date) returns jsonb
language sql stable set search_path = public, private as $$
  with bounds as (
    select p_date as d, date_trunc('month', p_date)::date as m, (p_date - (extract(isodow from p_date)::int - 1)) as w
  ), groups as (
    select 'Normal'::text as report_type, null::uuid as project_id, 0 as sort, 'Normal Daily Report' as title
    union all
    select 'Sole Selling', p.id, 1, 'Sole Selling – ' || p.name from projects p where p.status = 'Active'
  )
  select jsonb_build_object(
    'date', (select d from bounds),
    'recipients', coalesce((select value from app_settings where key = 'report_email_recipients'), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', g.title, 'type', g.report_type, 'projectId', g.project_id,
               'rows', coalesce((
                  select jsonb_agg(jsonb_build_object('name', e.name,
                           'off', private.day_off(e, b.d),
                           'filed', exists (select 1 from sales_reports x where x.employee_id = e.id and x.report_date = b.d
                                            and x.report_type = g.report_type and x.project_id is not distinct from g.project_id),
                           'daily', private.report_totals(e.id, g.report_type, g.project_id, b.d, b.d),
                           'wtd', private.report_totals(e.id, g.report_type, g.project_id, b.w, b.d),
                           'mtd', private.report_totals(e.id, g.report_type, g.project_id, b.m, b.d)) order by e.name)
                  from employees e
                  where exists (select 1 from sales_reports x where x.employee_id = e.id and x.report_type = g.report_type
                                and x.project_id is not distinct from g.project_id
                                and x.report_date between least(b.m, b.w) and b.d)), '[]'::jsonb),
               'totals', jsonb_build_object(
                  'daily', private.report_totals(null, g.report_type, g.project_id, b.d, b.d),
                  'wtd', private.report_totals(null, g.report_type, g.project_id, b.w, b.d),
                  'mtd', private.report_totals(null, g.report_type, g.project_id, b.m, b.d)))
             order by g.sort, g.title)
      from groups g, bounds b), '[]'::jsonb)
  )
$$;

-- Called by the panel's 10 PM job with the shared secret (see email_schedule.sql).
create or replace function public.report_email_payload(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, private as $$
begin
  if not exists (select 1 from private.app_secrets
                 where name = 'report_email' and secret_hash = encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return private.email_payload(private.today());
end $$;

-- Same data for Admin's "Send a test email now" button.
create or replace function public.report_email_payload_admin(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
begin
  if v_me.role <> 'Admin' then
    raise exception 'Only an Admin can do this.' using errcode = '42501';
  end if;
  return private.email_payload(private.today());
end $$;

-- ===========================================================================
-- Import from the old Google Sheets (Admin). The browser parses the CSVs and
-- sends rows already matched to employees/projects. Every row carries an
-- import_key, so running the import again never creates duplicates.
-- ===========================================================================
create or replace function public.list_employee_aliases(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('alias', alias, 'employeeId', employee_id)) from employee_aliases), '[]'::jsonb);
end $$;

-- p_data: { newEmployees:[{id,name,department}], aliases:[{alias,employeeId}],
--           reports:[{key,employeeId,date,type,projectId,leads,calls,positive,scheduled,done,tokens,walkIn}],
--           doneVisits:[{key,employeeId,date,type,projectId,client,time,status,walkIn}],
--           scheduledVisits:[{key,employeeId,bookedOn,type,projectId,client,visitDate,rescheduleDate,status,reason}] }
create or replace function public.import_reports(p_token text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, private as $$
declare
  v_me employees := private.session_employee(p_token);
  v_item jsonb;
  v_report uuid;
  v_new_emps int := 0; v_reports int := 0; v_done int := 0; v_walk int := 0; v_sched int := 0;
  v_skipped int := 0; v_unlinked int := 0;
  n int;
begin
  if v_me.role <> 'Admin' then
    raise exception 'Only an Admin can import data.' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'newEmployees', '[]'::jsonb)) loop
    insert into employees (id, name, department, role, status, week_off, password_hash)
    values (upper(trim(v_item ->> 'id')), trim(v_item ->> 'name'), coalesce(v_item ->> 'department', 'Sales'), 'Employee', 'Inactive', 7,
            crypt(encode(gen_random_bytes(18), 'base64'), gen_salt('bf')))
    on conflict (id) do nothing;
    get diagnostics n = row_count; v_new_emps := v_new_emps + n;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'aliases', '[]'::jsonb)) loop
    insert into employee_aliases (alias, employee_id) values (lower(trim(v_item ->> 'alias')), v_item ->> 'employeeId')
    on conflict (alias) do update set employee_id = excluded.employee_id;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'reports', '[]'::jsonb)) loop
    insert into sales_reports (employee_id, report_date, report_type, project_id, leads, calls, positive, scheduled, done,
                               tokens, walk_in, source, import_key, submitted_at, submitted_by)
    values (v_item ->> 'employeeId', (v_item ->> 'date')::date, v_item ->> 'type', nullif(v_item ->> 'projectId', '')::uuid,
            coalesce((v_item ->> 'leads')::int, 0), coalesce((v_item ->> 'calls')::int, 0), coalesce((v_item ->> 'positive')::int, 0),
            coalesce((v_item ->> 'scheduled')::int, 0), coalesce((v_item ->> 'done')::int, 0), coalesce((v_item ->> 'tokens')::int, 0),
            case when v_item ->> 'type' = 'Sole Selling' then coalesce((v_item ->> 'walkIn')::int, 0) else 0 end,
            'import', v_item ->> 'key', ((v_item ->> 'date')::date + time '21:00') at time zone private.tz(), v_me.id)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then v_skipped := v_skipped + 1; else v_reports := v_reports + 1; end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'doneVisits', '[]'::jsonb)) loop
    select id into v_report from sales_reports
    where employee_id = v_item ->> 'employeeId' and report_date = (v_item ->> 'date')::date
      and report_type = v_item ->> 'type' and project_id is not distinct from nullif(v_item ->> 'projectId', '')::uuid;
    if coalesce((v_item ->> 'walkIn')::boolean, false) then
      if v_report is null then v_unlinked := v_unlinked + 1; continue; end if;
      insert into walk_ins (report_id, client_name, position, import_key)
      values (v_report, trim(v_item ->> 'client'), 0, v_item ->> 'key')
      on conflict do nothing;
      get diagnostics n = row_count; v_walk := v_walk + n;
    else
      insert into visit_actions (report_id, employee_id, report_type, project_id, action_date, action, kind, client_name,
                                 done_time, import_status, import_key)
      values (v_report, v_item ->> 'employeeId', v_item ->> 'type', nullif(v_item ->> 'projectId', '')::uuid,
              (v_item ->> 'date')::date, 'done', 'import', coalesce(nullif(trim(v_item ->> 'client'), ''), '—'),
              nullif(v_item ->> 'time', ''), nullif(v_item ->> 'status', ''), v_item ->> 'key')
      on conflict do nothing;
      get diagnostics n = row_count; v_done := v_done + n;
      if n > 0 and v_report is null then v_unlinked := v_unlinked + 1; end if;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'scheduledVisits', '[]'::jsonb)) loop
    select id into v_report from sales_reports
    where employee_id = v_item ->> 'employeeId' and report_date = (v_item ->> 'bookedOn')::date
      and report_type = v_item ->> 'type' and project_id is not distinct from nullif(v_item ->> 'projectId', '')::uuid;
    insert into site_visits (employee_id, report_type, project_id, client_name, booked_on, booked_report_id, visit_date,
                             reschedule_date, status, cancel_reason, source, import_key)
    values (v_item ->> 'employeeId', v_item ->> 'type', nullif(v_item ->> 'projectId', '')::uuid,
            coalesce(nullif(trim(v_item ->> 'client'), ''), '—'), (v_item ->> 'bookedOn')::date, v_report,
            (v_item ->> 'visitDate')::date, nullif(v_item ->> 'rescheduleDate', '')::date,
            case when v_item ->> 'status' in ('Done','Cancelled') then v_item ->> 'status' else 'Pending' end,
            nullif(trim(v_item ->> 'reason'), ''), 'import', v_item ->> 'key')
    on conflict do nothing;
    get diagnostics n = row_count; v_sched := v_sched + n;
  end loop;

  return jsonb_build_object('newEmployees', v_new_emps, 'reports', v_reports, 'reportsSkipped', v_skipped,
                            'doneVisits', v_done, 'walkIns', v_walk, 'scheduledVisits', v_sched, 'unlinked', v_unlinked);
end $$;

-- ===========================================================================
-- Old pending visits (HR / Admin)
-- Imported visits whose date has passed without Done / Reschedule / Cancel.
-- They don't block anyone's report; HR/Admin close them here in bulk.
-- ===========================================================================
create or replace function public.list_stale_visits(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'client', v.client_name, 'employeeId', v.employee_id,
             'employeeName', (select name from employees where id = v.employee_id),
             'type', v.report_type, 'projectName', (select name from projects where id = v.project_id),
             'bookedOn', v.booked_on, 'date', coalesce(v.reschedule_date, v.visit_date))
           order by (select name from employees where id = v.employee_id), coalesce(v.reschedule_date, v.visit_date))
    from site_visits v
    where v.status = 'Pending' and v.source = 'import' and coalesce(v.reschedule_date, v.visit_date) < private.today()
  ), '[]'::jsonb);
end $$;

create or replace function public.close_stale_visits(p_token text, p_ids uuid[], p_status text, p_reason text) returns int
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_me employees := private.require_manager(p_token);
  n int;
begin
  if p_status not in ('Done','Cancelled') then
    raise exception 'Choose Done or Cancelled.' using errcode = '22023';
  end if;
  update site_visits set status = p_status, closed_by = v_me.id, closed_at = now(),
    cancel_reason = case when p_status = 'Cancelled' then coalesce(nullif(trim(p_reason), ''), 'Closed by ' || v_me.name) else cancel_reason end
  where id = any (coalesce(p_ids, '{}')) and status = 'Pending' and source = 'import';
  get diagnostics n = row_count;
  return n;
end $$;

-- Keep stored counts in line with the rules above (e.g. walk-ins no longer in
-- Site Visit Done). Only panel reports; imported numbers are left as imported.
do $$
declare
  r record;
begin
  for r in select id from sales_reports where source = 'panel' loop
    perform private.recompute_report(r.id);
  end loop;
end $$;

-- ===========================================================================
-- Grants
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
      'list_projects','save_project','get_employee_projects','set_employee_projects',
      'report_options','report_form','save_sales_report','get_report','report_history',
      'my_sales_reports','list_sales_reports','team_report_summary',
      'get_report_email_recipients','set_report_email_recipients','report_email_payload','report_email_payload_admin',
      'list_employee_aliases','import_reports','list_stale_visits','close_stale_visits'
    )
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
