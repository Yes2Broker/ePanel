-- OPTIONAL STEP 4. Sends the daily report emails at exactly 10:00 PM India time.
-- Run after reports.sql, once Vercel has GMAIL_USER, GMAIL_APP_PASSWORD and
-- CRON_SECRET set and the site is deployed. Safe to re-run (it replaces the
-- schedule). It doesn't touch any report or employee data.
--
-- BEFORE RUNNING: replace the two values on the lines marked "EDIT".
--   * v_secret must be EXACTLY the same text as CRON_SECRET in Vercel.
--   * v_url is your live site's address.
-- Don't save this file with the real secret in it, and don't commit it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_secret text := 'PASTE-THE-SAME-VALUE-AS-CRON_SECRET-HERE';   -- EDIT
  v_url text := 'https://epanel.yes2broker.in';                  -- EDIT if your domain differs
begin
  if v_secret like 'PASTE-%' or length(v_secret) < 24 then
    raise exception 'Set v_secret to your CRON_SECRET (at least 24 characters) before running.';
  end if;

  -- The database keeps only a hash of the secret.
  insert into private.app_secrets (name, secret_hash)
  values ('report_email', encode(extensions.digest(v_secret, 'sha256'), 'hex'))
  on conflict (name) do update set secret_hash = excluded.secret_hash;

  -- 16:30 UTC = 22:00 IST, every day.
  perform cron.unschedule(jobid) from cron.job where jobname = 'daily-report-email';
  perform cron.schedule(
    'daily-report-email',
    '30 16 * * *',
    format(
      $job$select net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000)$job$,
      v_url || '/api/cron/daily-report-email',
      jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json')::text
    )
  );
end $$;

-- Check: one row, schedule "30 16 * * *".
select jobname, schedule, active from cron.job where jobname = 'daily-report-email';
