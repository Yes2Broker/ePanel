-- Notifications: the in-app bell and phone / PC push (Web Push).
-- Run after functions.sql (and before leave.sql, attendance.sql and
-- reports.sql, which call private.notify). Safe to re-run; it doesn't change
-- any existing data.
--
-- How a push goes out: the SQL functions add rows to notifications. Right
-- after the action the app calls /api/push/send, which claims the pending
-- rows (push_claim) and sends them; the every-30-minute cron does the same as
-- a backup. A row is claimed only once, so it's never pushed twice. Claiming
-- needs CRON_SECRET (checked against private.app_secrets 'report_email'), so
-- the browser can never read anyone's push subscriptions.

create table if not exists notifications (
  id bigint generated always as identity primary key,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_batch uuid,        -- set when claimed for sending (never claimed twice)
  pushed_at timestamptz
);
create index if not exists notifications_emp_idx on notifications (employee_id, created_at desc);
create index if not exists notifications_pending_idx on notifications (created_at) where push_batch is null;

-- One row per device (browser) that allowed notifications.
create table if not exists push_subscriptions (
  endpoint text primary key,
  employee_id text not null references employees(id) on update cascade on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists push_subscriptions_emp_idx on push_subscriptions (employee_id);

-- Types a person turned off in Settings → Notifications (no bell item, no push).
create table if not exists notification_prefs (
  employee_id text primary key references employees(id) on update cascade on delete cascade,
  off text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
revoke all on notifications, push_subscriptions, notification_prefs from anon, authenticated;

-- ===========================================================================
-- Helpers (used by leave.sql, attendance.sql, reports.sql)
-- ===========================================================================
create or replace function private.notify_types() returns text[]
language sql immutable as $$
  select array['leave_decision','att_updated','att_day','report_changed','report_reminder',
               'leave_request','leave_cancelled','att_checked','email_failed','visit_today','payslip']
$$;

-- One notification for one person, unless they're inactive or turned the type off.
create or replace function private.notify(p_emp text, p_type text, p_title text, p_body text, p_link text) returns void
language plpgsql volatile set search_path = public, private as $$
begin
  if p_emp is null or not exists (select 1 from employees where id = p_emp and status = 'Active') then return; end if;
  if p_type <> 'test' and exists (select 1 from notification_prefs where employee_id = p_emp and p_type = any (off)) then return; end if;
  insert into notifications (employee_id, type, title, body, link) values (p_emp, p_type, p_title, coalesce(p_body, ''), p_link);
end $$;

-- Everyone active with one of these roles (HR + Admin, or just Admin).
create or replace function private.notify_roles(p_roles text[], p_except text, p_type text, p_title text, p_body text, p_link text) returns void
language plpgsql volatile set search_path = public, private as $$
declare
  e employees;
begin
  for e in select * from employees where status = 'Active' and role = any (p_roles) and id is distinct from p_except loop
    perform private.notify(e.id, p_type, p_title, p_body, p_link);
  end loop;
end $$;

-- Whoever may decide this person's leave: HR + Admin, or only Admin for HR's own.
create or replace function private.notify_deciders(p_emp employees, p_except text, p_type text, p_title text, p_body text, p_link text) returns void
language plpgsql volatile set search_path = public, private as $$
declare
  e employees;
begin
  for e in select * from employees where status = 'Active' and id is distinct from p_except loop
    if private.can_decide(e, p_emp) then
      perform private.notify(e.id, p_type, p_title, p_body, p_link);
    end if;
  end loop;
end $$;

-- "/attendance?month=2026-10" (HR's own days are on the "My attendance" tab).
create or replace function private.att_link(p_emp text, p_day date) returns text
language sql stable set search_path = public, private as $$
  select case when (select role from employees where id = p_emp) = 'HR' then '/attendance?tab=mine&month=' else '/attendance?month=' end
         || to_char(p_day, 'YYYY-MM')
$$;

-- "Tue 3 Nov – Wed 4 Nov · 2 days"
create or replace function private.leave_label(p_id uuid) returns text
language plpgsql stable set search_path = public, private as $$
declare
  a record;
  v_total numeric;
begin
  select * into a from leave_applications where id = p_id;
  select private.app_total(x) into v_total from leave_applications x where x.id = p_id;
  return to_char(a.start_date, 'Dy FMDD Mon')
         || case when a.end_date <> a.start_date then ' – ' || to_char(a.end_date, 'Dy FMDD Mon') else '' end
         || case when a.half is not null then ' (' || a.half || ' half)' else '' end
         || ' · ' || rtrim(rtrim(to_char(v_total, 'FM990.0'), '0'), '.') || case when v_total <= 1 then ' day' else ' days' end;
end $$;

-- The reminder's own time (Daily Reports → Email), IST, "HH:MM" on the hour
-- or half hour. 7:00 PM unless the Admin picks another.
create or replace function private.reminder_time() returns text
language plpgsql stable set search_path = public as $$
begin
  return coalesce((select value #>> '{}' from app_settings where key = 'report_reminder_time'), '19:00');
end $$;

-- Daily report reminder at the reminder time (cron, every 30 min).
-- For employees and HR with a report to file. Runs once a day; Admin can
-- turn it off on Daily Reports → Email.
create or replace function private.make_report_reminders() returns int
language plpgsql volatile set search_path = public, private as $$
declare
  v_now timestamp := now() at time zone private.tz();
  v_slot text := to_char(v_now, 'HH24') || ':' || case when extract(minute from v_now) < 30 then '00' else '30' end;
  v_today date := private.today();
  e employees;
  v_missing text[];
  n int := 0;
begin
  if coalesce((select value #>> '{}' from app_settings where key = 'report_reminders'), 'true') <> 'true' then return 0; end if;
  if v_slot <> private.reminder_time() then return 0; end if;
  insert into app_settings (key, value) values ('report_reminder_last_sent', to_jsonb(v_today::text))
  on conflict (key) do update set value = excluded.value where app_settings.value is distinct from excluded.value;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if; -- already done today
  n := 0;
  for e in select * from employees where status = 'Active' and role <> 'Admin' loop
    if private.day_off(e, v_today) is not null then continue; end if;
    select array_agg(t.title order by t.sort) into v_missing from (
      select 'Normal Daily Report' as title, '0' as sort
      where coalesce((private.permissions_json(e) ->> 'normalReport')::boolean, false)
        and not exists (select 1 from sales_reports where deleted_at is null and employee_id = e.id and report_date = v_today and report_type = 'Normal')
      union all
      select 'Sole Selling – ' || p.name, '1' || lower(p.name)
      from employee_projects ep join projects p on p.id = ep.project_id
      where ep.employee_id = e.id and p.status = 'Active' and coalesce((private.permissions_json(e) ->> 'soleSelling')::boolean, false)
        and not exists (select 1 from sales_reports where deleted_at is null and employee_id = e.id and report_date = v_today
                        and report_type = 'Sole Selling' and project_id = p.id)
    ) t;
    if v_missing is not null then
      perform private.notify(e.id, 'report_reminder', 'Daily report reminder',
        format('You haven''t filed today''s %s yet. Please file it before you leave.', array_to_string(v_missing, ' and ')),
        '/reports');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Morning visit reminder (cron, every 30 min): at its own time (10:00 AM IST
-- unless Admin picks another), once a day, each active person with site
-- visits due today (not on leave or weekly off) gets one notification.
create or replace function private.make_visit_reminders() returns int
language plpgsql volatile set search_path = public, private as $$
declare
  v_now timestamp := now() at time zone private.tz();
  v_slot text := to_char(v_now, 'HH24') || ':' || case when extract(minute from v_now) < 30 then '00' else '30' end;
  v_today date := private.today();
  e employees;
  v_names text[];
  n int := 0;
begin
  if coalesce((select value #>> '{}' from app_settings where key = 'visit_reminders'), 'true') <> 'true' then return 0; end if;
  if v_slot <> coalesce((select value #>> '{}' from app_settings where key = 'visit_reminder_time'), '10:00') then return 0; end if;
  insert into app_settings (key, value) values ('visit_reminder_last_sent', to_jsonb(v_today::text))
  on conflict (key) do update set value = excluded.value where app_settings.value is distinct from excluded.value;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if; -- already done today
  n := 0;
  for e in select * from employees where status = 'Active' loop
    if private.day_off(e, v_today) is not null then continue; end if;
    select array_agg(client_name order by created_at, client_name) into v_names
    from site_visits where employee_id = e.id and status = 'Pending' and coalesce(reschedule_date, visit_date) = v_today;
    if v_names is null then continue; end if;
    perform private.notify(e.id, 'visit_today', 'Today''s visits',
      format('You have %s site visit%s today: %s%s.', cardinality(v_names), case when cardinality(v_names) = 1 then '' else 's' end,
             array_to_string(v_names[1:5], ', '), case when cardinality(v_names) > 5 then ' +' || (cardinality(v_names) - 5) || ' more' else '' end),
      '/reports');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function private.push_secret_ok(p_secret text) returns boolean
language plpgsql stable set search_path = public, extensions, private as $$
begin
  return exists (select 1 from private.app_secrets
                 where name = 'report_email' and secret_hash = encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex'));
end $$;

-- ===========================================================================
-- Bell (session token)
-- ===========================================================================
create or replace function public.notifications_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  return jsonb_build_object(
    'unread', (select count(*) from notifications where employee_id = me.id and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'link', n.link,
                                 'createdAt', n.created_at, 'read', n.read_at is not null) order by n.created_at desc, n.id desc)
                       from (select * from notifications where employee_id = me.id order by created_at desc, id desc limit 30) n), '[]'::jsonb));
end $$;

-- p_id null = mark all read.
create or replace function public.notifications_read(p_token text, p_id bigint) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  update notifications set read_at = now() where employee_id = me.id and read_at is null and (p_id is null or id = p_id);
end $$;

create or replace function public.notification_prefs_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  return jsonb_build_object('off', coalesce((select to_jsonb(off) from notification_prefs where employee_id = me.id), '[]'::jsonb));
end $$;

create or replace function public.notification_prefs_set(p_token text, p_type text, p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if not (p_type = any (private.notify_types())) then
    raise exception 'Unknown notification type.' using errcode = '22023';
  end if;
  insert into notification_prefs (employee_id, off) values (me.id, case when p_on then '{}' else array[p_type] end)
  on conflict (employee_id) do update set
    off = case when p_on then array_remove(notification_prefs.off, p_type)
               else array(select distinct x from unnest(notification_prefs.off || p_type) x) end,
    updated_at = now();
  return public.notification_prefs_get(p_token);
end $$;

-- "Send test notification" (Settings). Always created, whatever is turned off.
create or replace function public.notify_test(p_token text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  perform private.notify(me.id, 'test', 'Test notification', 'Notifications are working on this device.', '/settings');
end $$;

-- ===========================================================================
-- Devices (session token)
-- ===========================================================================
-- Called when a device allows notifications, and again on each visit (keeps
-- last_seen fresh and moves the device to whoever is signed in on it).
create or replace function public.push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if p_endpoint is null or length(p_endpoint) > 1000
     or not (p_endpoint ~ '^https://' ) or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_=-]{20,200}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_=-]{8,100}$' then
    raise exception 'Invalid push subscription.' using errcode = '22023';
  end if;
  insert into push_subscriptions (endpoint, employee_id, p256dh, auth, user_agent, last_seen)
  values (p_endpoint, me.id, p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update set employee_id = me.id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen = now();
end $$;

create or replace function public.push_unsubscribe(p_token text, p_endpoint text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  delete from push_subscriptions where endpoint = p_endpoint and employee_id = me.id;
end $$;

-- /api/push/send checks the caller is signed in before sending.
create or replace function public.push_check(p_token text) returns boolean
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.session_employee(p_token);
  return true;
end $$;

-- ===========================================================================
-- Sending (server only: needs CRON_SECRET)
-- ===========================================================================
-- Claims everything not yet sent and returns it with the devices to send to.
-- p_cron: also make the daily report reminders and drop devices not seen for
-- 90 days. Anything older than a day is marked done without sending.
create or replace function public.push_claim(p_secret text, p_cron boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_batch uuid := gen_random_uuid();
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_cron then
    perform private.make_report_reminders();
    perform private.make_visit_reminders();
    delete from push_subscriptions where last_seen < now() - interval '90 days';
  end if;
  update notifications set push_batch = '00000000-0000-0000-0000-000000000000', pushed_at = now()
  where push_batch is null and created_at < now() - interval '1 day';
  update notifications set push_batch = v_batch where push_batch is null;
  return jsonb_build_object('batch', v_batch, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'link', n.link,
             'subs', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                      from push_subscriptions s where s.employee_id = n.employee_id)) order by n.id)
    from notifications n
    where n.push_batch = v_batch and exists (select 1 from push_subscriptions s where s.employee_id = n.employee_id)), '[]'::jsonb));
end $$;

-- After sending: mark the batch sent and remove devices the push service says are gone.
create or replace function public.push_done(p_secret text, p_batch uuid, p_gone text[]) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  update notifications set pushed_at = now() where push_batch = p_batch and pushed_at is null;
  delete from push_subscriptions
  where endpoint = any (coalesce(p_gone, '{}'))
    and employee_id in (select employee_id from notifications where push_batch = p_batch);
end $$;

-- The scheduled report email couldn't be sent (Gmail error): tell the Admins.
create or replace function public.report_email_failed(p_secret text, p_message text) returns void
language plpgsql volatile security definer set search_path = public, private as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  perform private.notify_roles(array['Admin'], null, 'email_failed', 'Daily report email failed',
    left(coalesce(nullif(trim(p_message), ''), 'Gmail did not accept the email.'), 300), '/reports?tab=email');
end $$;

-- Admin: daily report reminder on/off (Daily Reports → Email).
create or replace function public.get_report_reminders(p_token text) returns boolean
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  return coalesce((select value #>> '{}' from app_settings where key = 'report_reminders'), 'true') = 'true';
end $$;

create or replace function public.set_report_reminders(p_token text, p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  insert into app_settings (key, value) values ('report_reminders', to_jsonb(coalesce(p_on, true)::text))
  on conflict (key) do update set value = excluded.value;
  return coalesce(p_on, true);
end $$;

create or replace function public.get_report_reminder_time(p_token text) returns text
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  return private.reminder_time();
end $$;

create or replace function public.set_report_reminder_time(p_token text, p_time text) returns text
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|30)$' then
    raise exception 'Choose a time on the hour or half hour.' using errcode = '22023';
  end if;
  insert into app_settings (key, value) values ('report_reminder_time', to_jsonb(p_time))
  on conflict (key) do update set value = excluded.value;
  return p_time;
end $$;

-- Admin: morning visit reminder on/off + time (Daily Reports → Email).
create or replace function public.get_visit_reminder(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'on', coalesce((select value #>> '{}' from app_settings where key = 'visit_reminders'), 'true') = 'true',
    'time', coalesce((select value #>> '{}' from app_settings where key = 'visit_reminder_time'), '10:00'));
end $$;

create or replace function public.set_visit_reminder(p_token text, p_on boolean, p_time text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  me employees := private.session_employee(p_token);
begin
  if me.role <> 'Admin' then raise exception 'Only an Admin can do this.' using errcode = '42501'; end if;
  if p_time is not null and p_time !~ '^([01][0-9]|2[0-3]):(00|30)$' then
    raise exception 'Choose a time on the hour or half hour.' using errcode = '22023';
  end if;
  if p_on is not null then
    insert into app_settings (key, value) values ('visit_reminders', to_jsonb(p_on::text)) on conflict (key) do update set value = excluded.value;
  end if;
  if p_time is not null then
    insert into app_settings (key, value) values ('visit_reminder_time', to_jsonb(p_time)) on conflict (key) do update set value = excluded.value;
  end if;
  return public.get_visit_reminder(p_token);
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
      'notifications_list','notifications_read','notification_prefs_get','notification_prefs_set','notify_test',
      'push_subscribe','push_unsubscribe','push_check','push_claim','push_done','report_email_failed',
      'get_report_reminders','set_report_reminders','get_report_reminder_time','set_report_reminder_time',
      'get_visit_reminder','set_visit_reminder'
    )
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
