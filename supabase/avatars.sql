-- ===========================================================================
-- Employee profile photos. Run AFTER functions.sql. Safe to re-run.
--
-- Files live in the PRIVATE Storage bucket "avatars" (created below when run
-- in Supabase): default/<employee_id>.webp (set by HR/Admin) and
-- own/<employee_id>.webp (set by the employee). The browser never touches
-- Storage: the panel's /api/avatar route checks the session with the
-- functions below, then uploads / removes / signs short-lived URLs with the
-- server-only service key. This table only records which photos exist and
-- when they last changed (used to bust caches).
-- ===========================================================================

alter table employees add column if not exists photo_default_at timestamptz;
alter table employees add column if not exists photo_own_at timestamptz;

-- The private bucket (Supabase only): 2 MB, images only, never public.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 2097152, array['image/webp','image/png','image/jpeg'])
    on conflict (id) do update set public = false, file_size_limit = 2097152,
      allowed_mime_types = array['image/webp','image/png','image/jpeg'];
  end if;
end $$;

-- May this person change (or remove) this photo? Raises if not.
--   default: HR / Admin only.  own: only the employee sets it; the employee or HR / Admin may remove it.
create or replace function private.photo_allowed(v_me employees, p_emp text, p_slot text, p_remove boolean) returns void
language plpgsql stable set search_path = public, private as $$
begin
  if p_slot not in ('default','own') then raise exception 'Unknown photo.' using errcode = '22023'; end if;
  if not exists (select 1 from employees where id = p_emp) then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
  if p_slot = 'default' and not private.is_manager(v_me) then
    raise exception 'Only HR or Admin can set the default photo.' using errcode = '42501';
  end if;
  if p_slot = 'own' and p_emp <> v_me.id and not (p_remove and private.is_manager(v_me)) then
    raise exception 'You can only change your own photo.' using errcode = '42501';
  end if;
end $$;

-- Called by /api/avatar before touching Storage.
create or replace function public.photo_check(p_token text, p_emp text, p_slot text, p_remove boolean) returns void
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.photo_allowed(private.session_employee(p_token), p_emp, p_slot, p_remove);
end $$;

-- Called by /api/avatar after the upload / removal succeeded.
create or replace function public.photo_mark(p_token text, p_emp text, p_slot text, p_on boolean) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  perform private.photo_allowed(private.session_employee(p_token), p_emp, p_slot, not p_on);
  if p_slot = 'default' then
    update employees set photo_default_at = case when p_on then now() end where id = p_emp;
  else
    update employees set photo_own_at = case when p_on then now() end where id = p_emp;
  end if;
end $$;

-- Which photo each employee shows (own, else default) and its version, for
-- anyone signed in. Also whether a default exists (HR/Admin screens).
create or replace function public.photo_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_me employees := private.session_employee(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'slot', case when e.photo_own_at is not null then 'own' else 'default' end,
      'v', floor(extract(epoch from coalesce(e.photo_own_at, e.photo_default_at)))::bigint,
      'hasDefault', e.photo_default_at is not null, 'hasOwn', e.photo_own_at is not null))
    from employees e where e.photo_own_at is not null or e.photo_default_at is not null), '[]'::jsonb);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('photo_check','photo_mark','photo_list')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
