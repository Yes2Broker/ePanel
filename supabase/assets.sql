-- ===========================================================================
-- SIMs & Emails (HR/Admin): company SIM cards and email accounts, who has
-- them, and their history. Run AFTER functions.sql. Safe to re-run: it only
-- creates what's missing and replaces functions; the one-time copy of
-- employees' mobile numbers and emails runs once only.
--
-- Passwords for these accounts are never stored. Assigning a SIM or email
-- doesn't change the employee's login email or profile mobile.
-- ===========================================================================

create table if not exists company_sims (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^\d{10}$'),
  operator text not null default 'Jio' check (operator in ('Jio','Airtel','Vi','BSNL','Other')),
  status text not null default 'Idle' check (status in ('Assigned','Idle','Blocked')),
  employee_id text references employees(id) on update cascade on delete set null,
  since date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'Assigned') = (employee_id is not null))
);

create table if not exists company_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  provider text not null default 'Gmail' check (provider in ('Gmail','Other')),
  status text not null default 'Idle' check (status in ('Assigned','Idle','Blocked')),
  employee_id text references employees(id) on update cascade on delete set null,
  since date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'Assigned') = (employee_id is not null))
);
create unique index if not exists company_emails_email_idx on company_emails (lower(email));

-- Who had each SIM / email, from–to, and who changed it.
create table if not exists asset_history (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('sim','email')),
  asset_id uuid not null,
  label text not null,
  employee_id text references employees(id) on update cascade on delete set null,
  from_date date not null,
  to_date date,
  changed_by text references employees(id) on update cascade on delete set null,
  ended_by text references employees(id) on update cascade on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists asset_history_asset_idx on asset_history (kind, asset_id);

create table if not exists asset_seed_done (kind text primary key);

alter table company_sims enable row level security;
alter table company_emails enable row level security;
alter table asset_history enable row level security;
alter table asset_seed_done enable row level security;
revoke all on company_sims, company_emails, asset_history, asset_seed_done from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Records a change of holder in the history (closes the open row, opens a new one).
create or replace function private.asset_holder_changed(p_kind text, p_id uuid, p_label text, p_old text, p_new text, p_since date, p_by text)
returns void language plpgsql set search_path = public, private as $$
begin
  if p_old is not distinct from p_new then return; end if;
  update asset_history set to_date = greatest(from_date, private.today()), ended_by = p_by
   where kind = p_kind and asset_id = p_id and to_date is null;
  if p_new is not null then
    insert into asset_history (kind, asset_id, label, employee_id, from_date, changed_by)
    values (p_kind, p_id, p_label, p_new, coalesce(p_since, private.today()), p_by);
  end if;
end $$;

create or replace function private.asset_json(p_kind text, p_id uuid, p_label text, p_extra text, p_status text, p_emp text, p_since date, p_note text)
returns jsonb language sql stable set search_path = public, private as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'label', p_label, 'type', p_extra, 'status', p_status,
    'employee', case when p_emp is null then null else (select jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status) from employees e where e.id = p_emp) end,
    'since', p_since, 'note', p_note)
$$;

-- An employee set inactive gives back their SIMs and emails (history kept).
create or replace function private.asset_free_on_inactive() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  r record;
begin
  if new.status <> 'Active' and old.status = 'Active' then
    for r in select id, number as label from company_sims where employee_id = new.id loop
      perform private.asset_holder_changed('sim', r.id, r.label, new.id, null, null, null);
    end loop;
    for r in select id, email as label from company_emails where employee_id = new.id loop
      perform private.asset_holder_changed('email', r.id, r.label, new.id, null, null, null);
    end loop;
    update company_sims set status = 'Idle', employee_id = null, since = null, updated_at = now() where employee_id = new.id;
    update company_emails set status = 'Idle', employee_id = null, since = null, updated_at = now() where employee_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists employees_free_assets on employees;
create trigger employees_free_assets after update of status on employees
  for each row execute function private.asset_free_on_inactive();

-- ---------------------------------------------------------------------------
-- API (HR/Admin only)
-- ---------------------------------------------------------------------------
create or replace function public.assets_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return jsonb_build_object(
    'sims', coalesce((select jsonb_agg(private.asset_json('sim', id, number, operator, status, employee_id, since, note) order by number) from company_sims), '[]'::jsonb),
    'emails', coalesce((select jsonb_agg(private.asset_json('email', id, email, provider, status, employee_id, since, note) order by lower(email)) from company_emails), '[]'::jsonb));
end $$;

-- Add (p_id null) or edit. p_data: label (number / email), type (operator / provider), status, employeeId, since, note.
create or replace function public.asset_save(p_token text, p_kind text, p_id uuid, p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_label text := trim(coalesce(p_data ->> 'label', ''));
  v_type text := nullif(trim(coalesce(p_data ->> 'type', '')), '');
  v_status text := coalesce(nullif(p_data ->> 'status', ''), 'Idle');
  v_emp text := nullif(p_data ->> 'employeeId', '');
  v_since date := nullif(p_data ->> 'since', '')::date;
  v_note text := trim(coalesce(p_data ->> 'note', ''));
  v_old text;
  v_id uuid := p_id;
begin
  if p_kind not in ('sim','email') then raise exception 'Unknown item.' using errcode = '22023'; end if;
  if v_status not in ('Assigned','Idle','Blocked') then raise exception 'Choose Assigned, Idle or Blocked.' using errcode = '22023'; end if;
  if v_status = 'Assigned' and v_emp is null then raise exception 'Choose who it is assigned to.' using errcode = '22023'; end if;
  if v_status <> 'Assigned' then v_emp := null; v_since := null; end if;
  if v_emp is not null and not exists (select 1 from employees where id = v_emp and status = 'Active') then
    raise exception 'Choose an active employee.' using errcode = '22023';
  end if;
  if v_emp is not null then v_since := coalesce(v_since, private.today()); end if;

  if p_kind = 'sim' then
    v_label := regexp_replace(v_label, '\D', '', 'g');
    if v_label !~ '^\d{10}$' then raise exception 'The SIM number must have 10 digits.' using errcode = '22023'; end if;
    if exists (select 1 from company_sims where number = v_label and id is distinct from p_id) then
      raise exception 'SIM % is already in the list.' , v_label using errcode = '23505';
    end if;
    if p_id is null then
      insert into company_sims (number, operator, status, employee_id, since, note)
      values (v_label, coalesce(v_type, 'Jio'), v_status, v_emp, v_since, v_note) returning id into v_id;
    else
      select employee_id into v_old from company_sims where id = p_id;
      if not found then raise exception 'SIM not found.' using errcode = 'P0002'; end if;
      update company_sims set number = v_label, operator = coalesce(v_type, operator), status = v_status, employee_id = v_emp,
        since = v_since, note = v_note, updated_at = now() where id = p_id;
    end if;
  else
    v_label := lower(v_label);
    if v_label !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
    if exists (select 1 from company_emails where lower(email) = v_label and id is distinct from p_id) then
      raise exception '% is already in the list.', v_label using errcode = '23505';
    end if;
    if p_id is null then
      insert into company_emails (email, provider, status, employee_id, since, note)
      values (v_label, coalesce(v_type, 'Gmail'), v_status, v_emp, v_since, v_note) returning id into v_id;
    else
      select employee_id into v_old from company_emails where id = p_id;
      if not found then raise exception 'Email not found.' using errcode = 'P0002'; end if;
      update company_emails set email = v_label, provider = coalesce(v_type, provider), status = v_status, employee_id = v_emp,
        since = v_since, note = v_note, updated_at = now() where id = p_id;
    end if;
  end if;
  perform private.asset_holder_changed(p_kind, v_id, v_label, v_old, v_emp, v_since, me.id);
  return v_id;
end $$;

-- Quick actions: give to an employee (today) / take back (Idle).
create or replace function public.asset_assign(p_token text, p_kind text, p_id uuid, p_emp text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_label text; v_old text;
begin
  if not exists (select 1 from employees where id = p_emp and status = 'Active') then
    raise exception 'Choose an active employee.' using errcode = '22023';
  end if;
  if p_kind = 'sim' then
    update company_sims s set status = 'Assigned', employee_id = p_emp, since = private.today(), updated_at = now()
      from (select id, employee_id from company_sims where id = p_id) o where s.id = o.id returning s.number, o.employee_id into v_label, v_old;
  else
    update company_emails s set status = 'Assigned', employee_id = p_emp, since = private.today(), updated_at = now()
      from (select id, employee_id from company_emails where id = p_id) o where s.id = o.id returning s.email, o.employee_id into v_label, v_old;
  end if;
  if v_label is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  perform private.asset_holder_changed(p_kind, p_id, v_label, v_old, p_emp, private.today(), me.id);
end $$;

create or replace function public.asset_free(p_token text, p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
  v_label text; v_old text;
begin
  if p_kind = 'sim' then
    update company_sims s set status = 'Idle', employee_id = null, since = null, updated_at = now()
      from (select id, employee_id from company_sims where id = p_id) o where s.id = o.id returning s.number, o.employee_id into v_label, v_old;
  else
    update company_emails s set status = 'Idle', employee_id = null, since = null, updated_at = now()
      from (select id, employee_id from company_emails where id = p_id) o where s.id = o.id returning s.email, o.employee_id into v_label, v_old;
  end if;
  if v_label is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  perform private.asset_holder_changed(p_kind, p_id, v_label, v_old, null, null, me.id);
end $$;

create or replace function public.asset_delete(p_token text, p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.require_manager(p_token);
begin
  update asset_history set to_date = greatest(from_date, private.today()), ended_by = me.id where kind = p_kind and asset_id = p_id and to_date is null;
  if p_kind = 'sim' then delete from company_sims where id = p_id; else delete from company_emails where id = p_id; end if;
  if not found then raise exception 'Not found.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.asset_history_list(p_token text, p_kind text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('employee', (select name from employees where id = h.employee_id), 'employeeId', h.employee_id,
      'from', h.from_date, 'to', h.to_date, 'by', (select name from employees where id = h.changed_by),
      'endedBy', (select name from employees where id = h.ended_by)) order by h.from_date desc, h.id desc)
    from asset_history h where h.kind = p_kind and h.asset_id = p_id), '[]'::jsonb);
end $$;

-- One employee's company SIMs and emails (Employees → details).
create or replace function public.employee_assets(p_token text, p_emp text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_manager(p_token);
  return jsonb_build_object(
    'sims', coalesce((select jsonb_agg(number || ' (' || operator || ')' order by number) from company_sims where employee_id = p_emp), '[]'::jsonb),
    'emails', coalesce((select jsonb_agg(email order by email) from company_emails where employee_id = p_emp), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- One-time copy: each ACTIVE employee's profile mobile and email, as Assigned
-- to them (empty and duplicate values skipped). Runs only the first time.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from asset_seed_done where kind = 'sim') then
    with src as (
      select distinct on (right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10))
        right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10) as number, id, coalesce(joining_date, private.today()) as since
      from employees where status = 'Active' and length(regexp_replace(coalesce(mobile, ''), '\D', '', 'g')) >= 10
      order by right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10), id
    ), ins as (
      insert into company_sims (number, status, employee_id, since, operator)
      select number, 'Assigned', id, since, 'Other' from src where number ~ '^\d{10}$'
      on conflict (number) do nothing returning id, number, employee_id, since
    )
    insert into asset_history (kind, asset_id, label, employee_id, from_date) select 'sim', id, number, employee_id, since from ins;
    insert into asset_seed_done values ('sim');
  end if;
  if not exists (select 1 from asset_seed_done where kind = 'email') then
    with src as (
      select distinct on (lower(trim(email))) lower(trim(email)) as email, id, coalesce(joining_date, private.today()) as since,
        case when lower(email) like '%@gmail.com' then 'Gmail' else 'Other' end as provider
      from employees where status = 'Active' and trim(coalesce(email, '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      order by lower(trim(email)), id
    ), ins as (
      insert into company_emails (email, provider, status, employee_id, since)
      select email, provider, 'Assigned', id, since from src
      where not exists (select 1 from company_emails c where lower(c.email) = src.email)
      returning id, email, employee_id, since
    )
    insert into asset_history (kind, asset_id, label, employee_id, from_date) select 'email', id, email, employee_id, since from ins;
    insert into asset_seed_done values ('email');
  end if;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('assets_list','asset_save','asset_assign','asset_free','asset_delete','asset_history_list','employee_assets')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
