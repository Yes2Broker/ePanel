# Yes2Broker Employee Panel

The internal panel for Yes2Broker staff: daily reports, attendance, leave and
employee management. Next.js 14 (App Router) + Supabase (Postgres).

## Setup

1. **Install** (Node.js 18.18+):
   ```bash
   npm install
   ```
2. **Connect**: `cp .env.example .env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Supabase → Project Settings → API). For the 10 PM report email also set
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `CRON_SECRET` (in Vercel too).
   For phone / PC notifications also set `VAPID_PRIVATE_KEY` (with
   `CRON_SECRET` and `email_schedule.sql`, which also sends any leftover pushes).
   For Y2B Assist set `GROQ_API_KEY` (and optionally `GROQ_MODEL`).
3. **Database**: in Supabase → SQL Editor, run the files below in order.
4. **Run**:
   ```bash
   npm run dev                  # http://localhost:3000
   npm run build && npm start   # production
   ```

People sign in with their email or employee code (e.g. `EMP004`). The team
is loaded once from a seed file kept out of Git.

## SQL run order

1. `supabase/schema.sql` — tables and security
2. `supabase/functions.sql` — sign-in, employees, permissions, dashboards
3. `supabase/notifications.sql` — the bell and push notifications
4. `supabase/reports.sql` — Daily Reports
5. `supabase/leave.sql` — Leave
6. `supabase/attendance.sql` — Attendance and the salary sheet
7. `supabase/assist.sql` — Y2B Assist (question limit and its read-only helpers)
8. `supabase/cleanup_unused.sql` — one time: drops functions and old tables
   the panel no longer uses (only tables nothing depends on)
9. *(optional)* `supabase/email_schedule.sql` — the 10 PM email timer (edit
   the secret first); it also sends notifications that are still waiting

Files 1–7 are safe to re-run on the live database: they only create what's
missing and replace functions. Re-run a file whenever it changes.

## Security

The browser never touches a table: every table has row level security on
with no policies, and the app only calls Postgres functions that check the
session token, role and module permission. Salaries are only ever returned
to an Admin. Ten wrong passwords in a row lock that email/code for 15 minutes.
