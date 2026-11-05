-- ===========================================================================
-- Builder Data: builder projects, their unit inventory, and localities.
-- Run AFTER functions.sql (which adds the "Builder Data – manage" permission).
-- Safe to re-run: it only creates what's missing and replaces functions.
--
-- Access (Permissions page): "Builder Data" = view; "Builder Data – manage" =
-- add / edit / delete and see the sensitive fields (owner, contact phone,
-- brokerage %, payout plan, sale deed amount). Viewers never receive those:
-- the functions below leave them out.
-- No real data lives in this file: import projects in Supabase yourself.
-- ===========================================================================

create table if not exists localities (
  id bigint generated always as identity primary key,
  city text not null check (city in ('Ahmedabad','Gandhinagar')),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists localities_city_name_idx on localities (city, lower(name));

create table if not exists builder_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Residential' check (category in ('Residential','Commercial')),
  city text not null default 'Ahmedabad',
  locality text not null default '',
  sub_locality text not null default '',
  amenities_count int check (amenities_count >= 0),
  floors int check (floors >= 0),
  blocks int check (blocks >= 0),
  parking_per_unit numeric check (parking_per_unit >= 0),
  status text not null default 'Under Construction' check (status in ('Under Construction','Ready to Move','New Launch')),
  possession_date date,
  rera boolean not null default false,
  builder_firm text not null default '',
  owner_name text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  brokerage_pct numeric check (brokerage_pct >= 0 and brokerage_pct <= 100),
  payout_plan text not null default '',
  remark text not null default '',
  sold_out boolean not null default false,
  message_template text not null default '',
  created_by text references employees(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_by text references employees(id) on update cascade on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists builder_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references builder_projects(id) on delete cascade,
  unit_type text not null check (unit_type in ('1 BHK','2 BHK','2.5 BHK','3 BHK','4 BHK','5 BHK','Shop','Showroom','Office','Bungalow','Plot','Penthouse')),
  size numeric check (size > 0),
  size_unit text not null default 'sq.ft' check (size_unit in ('sq.yrd','sq.ft')),
  total_units int not null default 0 check (total_units >= 0),
  available_units int not null default 0 check (available_units >= 0),
  price_per_unit numeric check (price_per_unit >= 0),
  box_price numeric check (box_price >= 0),
  sale_deed_amount numeric check (sale_deed_amount >= 0),
  position int not null default 0,
  check (available_units <= total_units)
);
create index if not exists builder_units_project_idx on builder_units (project_id);

alter table localities enable row level security;
alter table builder_projects enable row level security;
alter table builder_units enable row level security;
revoke all on localities, builder_projects, builder_units from anon, authenticated;

-- A starting list of localities (place names only). HR/Admin add more in the panel.
insert into localities (city, name)
select 'Ahmedabad', x from unnest(array[
  'Bopal','South Bopal','Shela','Ghuma','Sanand','Science City','Sola','Gota','Chandkheda','Motera','Sabarmati','Ranip',
  'Vastrapur','Bodakdev','Thaltej','Satellite','Prahlad Nagar','Jodhpur','Vejalpur','Makarba','Sarkhej','Ambli','Iscon',
  'Navrangpura','Naranpura','Ellisbridge','Paldi','Vasna','Maninagar','Isanpur','Vatva','Narol','Naroda','Nikol','Vastral',
  'Bapunagar','Gota-Ognaj','Tragad','Zundal','Vaishnodevi','Shilaj','Bhadaj','Sindhu Bhavan Road','SG Highway','Gurukul',
  'Memnagar','Ghatlodia','Chanakyapuri','New Ranip','Khokhra','Odhav','Ramol','Hathijan'
]) x
on conflict do nothing;
insert into localities (city, name)
select 'Gandhinagar', x from unnest(array[
  'GIFT City','Kudasan','Raysan','Randesan','Sargasan','Koba','Bhat','Infocity','Vavol','Urjanagar','Por','Adalaj',
  'Pethapur','Sector 1','Sector 21','Sector 30'
]) x
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.builder_access(me public.employees)
returns text language sql stable set search_path = public, private as $$
  -- 'manage', 'view' or null.
  select case
    when coalesce((private.permissions_json(me) ->> 'builderManage')::boolean, false) then 'manage'
    when coalesce((private.permissions_json(me) ->> 'builderData')::boolean, false) then 'view'
  end
$$;

create or replace function private.builder_require(p_token text, p_manage boolean)
returns public.employees language plpgsql stable set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
  a text := private.builder_access(me);
begin
  if a is null or (p_manage and a <> 'manage') then
    raise exception '%', case when p_manage then 'You can''t change Builder Data. Ask Admin for "Builder Data – manage".' else 'Builder Data isn''t turned on for you.' end
      using errcode = '42501';
  end if;
  return me;
end $$;

-- One project with its units. Sensitive fields only when p_manage.
create or replace function private.builder_json(p public.builder_projects, p_manage boolean)
returns jsonb language sql stable set search_path = public, private as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'category', p.category, 'city', p.city, 'locality', p.locality, 'subLocality', p.sub_locality,
    'amenities', p.amenities_count, 'floors', p.floors, 'blocks', p.blocks, 'parkingPerUnit', p.parking_per_unit,
    'status', p.status, 'possession', p.possession_date, 'rera', p.rera, 'builder', p.builder_firm,
    'contactName', p.contact_name, 'remark', p.remark, 'soldOut', p.sold_out, 'message', p.message_template,
    'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'units', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'type', u.unit_type, 'size', u.size, 'sizeUnit', u.size_unit, 'total', u.total_units,
        'available', u.available_units, 'pricePerUnit', u.price_per_unit, 'boxPrice', u.box_price)
        || case when p_manage then jsonb_build_object('saleDeed', u.sale_deed_amount) else '{}'::jsonb end
        order by u.position, u.unit_type, u.size) from builder_units u where u.project_id = p.id), '[]'::jsonb))
  || case when p_manage then jsonb_build_object('owner', p.owner_name, 'contactPhone', p.contact_phone,
       'brokeragePct', p.brokerage_pct, 'payoutPlan', p.payout_plan) else '{}'::jsonb end
$$;

-- ---------------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------------
-- Everything the page needs: projects (latest first), localities, and whether this person can manage.
create or replace function public.builder_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.builder_require(p_token, false);
  v_manage boolean := private.builder_access(me) = 'manage';
begin
  return jsonb_build_object(
    'canManage', v_manage,
    'canAddLocality', v_manage or me.role in ('HR','Admin'),
    'projects', coalesce((select jsonb_agg(private.builder_json(p, v_manage) order by p.created_at desc) from builder_projects p), '[]'::jsonb),
    'localities', coalesce((select jsonb_agg(jsonb_build_object('city', l.city, 'name', l.name) order by l.city, l.name) from localities l), '[]'::jsonb));
end $$;

-- Add (p_id null) or edit a project with its units (units not in the list are removed).
create or replace function public.builder_save(p_token text, p_id uuid, p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.builder_require(p_token, true);
  v_id uuid := p_id;
  u jsonb;
  v_keep uuid[] := '{}';
  v_uid uuid;
  n int := 0;
  num text;
begin
  if length(trim(coalesce(p_data ->> 'name', ''))) = 0 then raise exception 'Enter the project name.' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_data -> 'units', '[]'::jsonb)) = 0 then raise exception 'Add at least one unit type.' using errcode = '22023'; end if;
  for u in select * from jsonb_array_elements(p_data -> 'units') loop
    if coalesce((u ->> 'available')::int, 0) > coalesce((u ->> 'total')::int, 0) then
      raise exception 'Available units can''t be more than total units (%).', u ->> 'type' using errcode = '22023';
    end if;
  end loop;

  if v_id is null then
    insert into builder_projects (name, created_by, updated_by) values (trim(p_data ->> 'name'), me.id, me.id) returning id into v_id;
  elsif not exists (select 1 from builder_projects where id = v_id) then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
  update builder_projects set
    name = trim(p_data ->> 'name'),
    category = coalesce(nullif(p_data ->> 'category', ''), 'Residential'),
    city = coalesce(nullif(p_data ->> 'city', ''), 'Ahmedabad'),
    locality = trim(coalesce(p_data ->> 'locality', '')),
    sub_locality = trim(coalesce(p_data ->> 'subLocality', '')),
    amenities_count = nullif(p_data ->> 'amenities', '')::int,
    floors = nullif(p_data ->> 'floors', '')::int,
    blocks = nullif(p_data ->> 'blocks', '')::int,
    parking_per_unit = nullif(p_data ->> 'parkingPerUnit', '')::numeric,
    status = coalesce(nullif(p_data ->> 'status', ''), 'Under Construction'),
    possession_date = nullif(p_data ->> 'possession', '')::date,
    rera = coalesce((p_data ->> 'rera')::boolean, false),
    builder_firm = trim(coalesce(p_data ->> 'builder', '')),
    owner_name = trim(coalesce(p_data ->> 'owner', '')),
    contact_name = trim(coalesce(p_data ->> 'contactName', '')),
    contact_phone = trim(coalesce(p_data ->> 'contactPhone', '')),
    brokerage_pct = nullif(p_data ->> 'brokeragePct', '')::numeric,
    payout_plan = trim(coalesce(p_data ->> 'payoutPlan', '')),
    remark = trim(coalesce(p_data ->> 'remark', '')),
    sold_out = coalesce((p_data ->> 'soldOut')::boolean, false),
    message_template = coalesce(p_data ->> 'message', ''),
    updated_by = me.id, updated_at = now()
  where id = v_id;

  for u in select * from jsonb_array_elements(p_data -> 'units') loop
    n := n + 1;
    v_uid := nullif(u ->> 'id', '')::uuid;
    if v_uid is not null and exists (select 1 from builder_units where id = v_uid and project_id = v_id) then
      update builder_units set unit_type = u ->> 'type', size = nullif(u ->> 'size', '')::numeric, size_unit = coalesce(nullif(u ->> 'sizeUnit', ''), 'sq.ft'),
        total_units = coalesce(nullif(u ->> 'total', '')::int, 0), available_units = coalesce(nullif(u ->> 'available', '')::int, 0),
        price_per_unit = nullif(u ->> 'pricePerUnit', '')::numeric, box_price = nullif(u ->> 'boxPrice', '')::numeric,
        sale_deed_amount = nullif(u ->> 'saleDeed', '')::numeric, position = n
      where id = v_uid;
    else
      insert into builder_units (project_id, unit_type, size, size_unit, total_units, available_units, price_per_unit, box_price, sale_deed_amount, position)
      values (v_id, u ->> 'type', nullif(u ->> 'size', '')::numeric, coalesce(nullif(u ->> 'sizeUnit', ''), 'sq.ft'),
        coalesce(nullif(u ->> 'total', '')::int, 0), coalesce(nullif(u ->> 'available', '')::int, 0),
        nullif(u ->> 'pricePerUnit', '')::numeric, nullif(u ->> 'boxPrice', '')::numeric, nullif(u ->> 'saleDeed', '')::numeric, n)
      returning id into v_uid;
    end if;
    v_keep := v_keep || v_uid;
  end loop;
  delete from builder_units where project_id = v_id and not (id = any(v_keep));
  return v_id;
end $$;

create or replace function public.builder_delete(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  perform private.builder_require(p_token, true);
  delete from builder_projects where id = p_id;
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
end $$;

-- Quick "Update availability" for one unit row.
create or replace function public.builder_set_available(p_token text, p_unit uuid, p_available int) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.builder_require(p_token, true);
  v_total int;
begin
  select total_units into v_total from builder_units where id = p_unit;
  if not found then raise exception 'Unit not found.' using errcode = 'P0002'; end if;
  if p_available < 0 or p_available > v_total then raise exception 'Available must be between 0 and % (total units).', v_total using errcode = '22023'; end if;
  update builder_units set available_units = p_available where id = p_unit;
  update builder_projects set updated_by = me.id, updated_at = now() where id = (select project_id from builder_units where id = p_unit);
end $$;

-- New locality (HR/Admin, or anyone with manage).
create or replace function public.locality_add(p_token text, p_city text, p_name text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if not (me.role in ('HR','Admin') or private.builder_access(me) = 'manage') then
    raise exception 'Only HR or Admin can add a locality.' using errcode = '42501';
  end if;
  if p_city not in ('Ahmedabad','Gandhinagar') then raise exception 'Choose Ahmedabad or Gandhinagar.' using errcode = '22023'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the locality name.' using errcode = '22023'; end if;
  insert into localities (city, name) values (p_city, initcap(trim(p_name))) on conflict do nothing;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('builder_list','builder_save','builder_delete','builder_set_available','locality_add')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
