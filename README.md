# Yes2Broker Employee Panel

The internal panel for Yes2Broker staff: daily reports (Normal + Sole
Selling), attendance, leave, and an HR/Admin side for managing
employees and module access. Built with Next.js (App Router),
TypeScript, Tailwind CSS, lucide-react, Recharts and Supabase (Postgres).

## What each role gets

**Employees**
- **Dashboard** — your details, today's report status and recent reports.
- **Daily Reports** — Normal and/or Sole Selling report, summary popup and image download (details below).
- **Leave** — apply (full or half day, reason, optional photo/PDF) and see/cancel your requests (details below).
- **Attendance** — your month: calendar and list, payable days, lates, short days (details below).
- **Profile** — view details and change your own password.
- **Settings** — compact sidebar and which dashboard sections to show (per device).

**HR and Admin** get all of the above, plus:
- **Dashboard** — team overview with reports filed today.
- **Employees** — add, edit, deactivate, reset passwords.
- **Daily Reports → Team / Old visits / Projects** — totals, every report, history, file or fix any day.
- **Permissions** — turn modules on/off per employee, and assign Sole Selling projects.
- **Leave** — approve/reject requests (with warnings and history).

**Links to other Yes2Broker sites** (open in a new tab, marked ↗ in the sidebar):
- **Builder Data** — https://yes2broker.github.io/Builder-Data/ — shown to
  people with the Builder Data permission (on by default, except the Tech department).
- **Analytics** — https://analytics.yes2broker.in/ — Admins only; the
  permission can't be switched on for any other role.

HR can manage everyone except Admin accounts; only an Admin can create,
edit or reset another Admin.

## Setup

### 1. Install

Node.js 18.18+ is required.

```bash
npm install
```

### 2. Create the database

In your Supabase project, open **SQL Editor → New query** and run these
files, in this order:

1. `supabase/schema.sql` — tables and security
2. `supabase/functions.sql` — everything the app calls
3. `supabase/reports.sql` — Daily Reports (projects, reports, visits, history, import, email data)
4. `supabase/builder_data_defaults.sql` — one-time Builder Data defaults (runs only once, however often you paste it)
5. `supabase/leave.sql` — Leave: requests, approvals, history (after reports.sql)
6. `supabase/attendance.sql` — Attendance: uploaded days, edits + history, code mappings, salary sheet (after leave.sql)
7. *(optional)* `supabase/email_schedule.sql` — the 10 PM email timer (edit the secret first; see below)
Your team was loaded once from a separate seed file kept out of Git.

Both are safe to run again. Whenever `functions.sql` changes, re-run it.

All of these are safe to re-run on a live database: they only create what's
missing and replace functions; they never delete or overwrite rows. `functions.sql`
> removes the old `list_employees` / `create_employee` / `update_employee` /
> `reset_employee_password` functions, which could be called by anyone
> without logging in. Existing employees and passwords are kept.

### 3. Connect the app

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Supabase → Project Settings → API**.

### 4. Brand assets

```
public/brand/yes2broker-logo.webp  -> full logo (login page, desktop sidebar)
public/brand/y2b-icon.png          -> square Y2B icon (phones, compact sidebar)
public/favicon.ico                 -> 16/32/48 favicon
public/apple-touch-icon.png        -> 180×180 home-screen icon (iPhone)
public/icon-192.png, icon-512.png  -> Android / install icons
public/manifest.webmanifest        -> app name + theme colour (#273992)
```

### 5. Run

```bash
npm run dev      # development, http://localhost:3000
npm run build && npm start   # production
```

### 6. Signing in

Everyone signs in with **either their email or their employee code**
(e.g. `EMP004`) — email is optional for people who don't have one.
Passwords must be at least 8 characters when set from the panel; anyone can
change theirs from Profile → Change Password, and HR/Admin can reset it.

## Daily Reports

- **Employees** see a tile per report they're allowed (Permissions page:
  *Normal Daily Report*, and *Sole Selling* + which projects). One report per
  person, per report/project, per day; filed for today only. They can edit it
  for 24 hours after submitting.
- **The form** follows the old Google-Sheets forms: leads, calls, positive
  calls, tokens, visits scheduled today (client + date), an action for every
  visit due today (Done + time / Reschedule from tomorrow / Cancel + reason),
  future visits done today, and walk-ins on Sole Selling. Site Visit Done =
  visits done + future visits done; walk-ins are their own number and aren't
  in any conversion %. Conversions show one decimal (e.g. 1.1%).
- **Overdue visits** (date passed with no action) show in Today's Visits
  with an "Overdue" tag and must be acted on. Imported old visits never block
  anyone; HR/Admin close them in bulk on the **Old visits** tab.
- **The popup** shows Today vs MTD (1st of that month up to the report's date)
  with both conversion %s and **Download image** (on phones **Save image**,
  which opens the share sheet to save to Photos or send anywhere) — also for
  any past report.
- **HR / Admin**: Team tab (Today / MTD per person and project, every report,
  file or fix any day), Projects tab, full change history on each report.
  Admin only: 10 PM email recipients and **Import old data** (CSV from the old
  sheets; re-running it never duplicates).
- **10 PM email**: one email for Normal and one per active project, sent
  through Gmail. Set `GMAIL_USER`, `GMAIL_APP_PASSWORD` (a Google *app
  password*) and `CRON_SECRET` in Vercel, then run `email_schedule.sql` with
  the same `CRON_SECRET`. "Send test email now" on the email tab checks it.

## Leave

Leave is a **request + approval only**. It never changes Attendance
(status, payable days or salary). Rules (`supabase/leave.sql` has them at the top):
- Full day or half day (first/second half = 0.5). Dates up to 7 days back,
  any date ahead. Each person's weekly off is never counted.
- **Approval:** HR or Admin, never your own. HR can't act on an Admin's leave;
  an **Admin's own leave is approved automatically**.
  Rejecting needs a reason.
- **Approver sees:** leave taken this month/year, and warnings — weekend
  (peak site-visit days), "<Project> will have nobody on site on <date>",
  "Already N people on leave that day".
- **Cancel:** the employee cancels a pending request, or an approved one
  before it starts. Once started, HR/Admin cancel the remaining days.
- **Client visits** on leave days must be rescheduled (to a day outside the
  leave) or handed over to a colleague on the same report/project before the
  request can be sent.
- **History:** every action (apply, approve, reject, cancel, visit moved) is
  recorded with who and when.
- **Daily Reports link:** in the Team view and the 10 PM email, people on
  approved leave or their weekly off show "On leave" / "Weekly off" instead
  of "not filed".
- Comp-offs and company holidays are no longer used (their old rows are kept).
- **Attachments** (photo or PDF, max 5 MB) are stored in the database and
  only reachable through the panel's functions (the owner and HR/Admin).
- The **Leave** permission is on by default for everyone.
- Test data from checking a preview can be removed with
  `supabase/leave_test_cleanup.sql` (only rows marked "TEST").

## Attendance

Days come from the eTimeOffice machine: HR uploads the **Month IN/OUT
Report** (.xls, as downloaded) or the upload template
(`public/templates/Y2B_Attendance_Upload_Template.xlsx`, also on the Upload
tab). Rules (copied from the old Apps Script and sheet; `supabase/attendance.sql`
has them at the top):
- **Status:** In and Out → Present; only one of them → **Missed punch** (not
  counted until HR fixes it); otherwise Weekoff on the person's own weekly
  off, else Absent. Paid Leave is only what HR marks or the upload file says;
  leave requests never change attendance.
- **Late** = In after 10:30. The first 2 lates a month are free; from the 3rd,
  each is half a day ("Late Half"). **Short Day** = under 8 hours (Out − In) =
  half a day. A day that is both late and short counts once, as Short.
- **Weekly-off working** (Present on your own weekly off) offsets Absent days,
  capped at the number of Absent days; Absent shown = Absent − that (script.js).
- **Net payable** = Present + Weekoff + Paid Leave + weekly-off working −
  (late deductions + short days × 0.5). **Salary** (Admin only) = monthly
  salary ÷ days in month × net payable.
- **Uploads** preview per person first. Machine codes match automatically
  (0002 → EMP002); others are mapped once and remembered. Re-uploading never
  duplicates a day and never changes a day HR edited.
- **Edits** (HR/Admin): In/Out, status, remark on any past day; Late/Short
  are worked out again; every change is recorded (who, when, old → new).
- **Salaries never leave the database for anyone but an Admin** (employee
  lists, attendance and the salary sheet all check this in SQL).
- Admin can import the old Google Sheet history once (CSV of the
  "Attendance" tab); statuses are kept, Late/Short recalculated, differences
  shown before import.
- Test data from checking a preview can be removed with
  `supabase/attendance_test_cleanup.sql` (only rows with remark "TEST").

## Launching features one at a time

Attendance, Daily Reports and Leave are live.
Personal tasks are not part of this panel.
To launch one, set its `enabled` to `true` in **`src/lib/features.ts`** and
merge. No SQL is needed, because the database side is already in place.

## How security works

- The browser never reads or writes a table. Every table has row level
  security on with no policies, and `anon` has no table privileges.
- The app only calls Postgres functions (`supabase/functions.sql`).
  `login_employee` checks the bcrypt password and returns a random session
  token; only its SHA-256 hash is stored. Every other function takes that
  token, resolves it to an active employee, and checks role and module
  permission before doing anything.
- A login lasts 30 days from the last time the panel was opened (opening
  it extends it), and never more than 90 days from signing in. Log out,
  resetting a password, changing your own password, or deactivating an
  employee signs them out at once (other devices, for a password change).
- Internal helpers live in a `private` schema that the API doesn't expose.

## Phones, tablets and the installed app

- **Phones (below 768px):** a bottom bar like a native app. Employees get
  Dashboard, Reports, Builder Data ↗ (if allowed) and Profile; HR and Admin
  get Dashboard, Reports, Employees and **More** (everything else, plus
  Install app and Log out). The bar hides while the keyboard is open.
  Popups open as bottom sheets.
- **Tablets:** an icon-only sidebar. **Desktop (1024px+):** the full sidebar.
- **Install as an app:** `public/manifest.webmanifest` + the service worker
  at `/sw.js` (`src/app/sw.js/route.ts`). It caches only the app shell and
  static files (JS, CSS, icons) — never API or database responses — and
  shows `/offline` without internet. "Install app" is in the avatar menu,
  the More sheet, Settings and a dashboard banner (phones; hidden for 14 days
  when dismissed). iPhone gets a Share → Add to Home Screen guide. After a
  deploy, open apps show "New version available – Refresh".
- **Hidden from search engines:** `noindex, nofollow, noarchive, nosnippet`
  meta on every page, an `X-Robots-Tag` header on every response
  (`next.config.mjs`), and `public/robots.txt` disallowing everything. No sitemap.

## Office rules you may want to change

At the top of `supabase/functions.sql`, under **Office settings**:

- `private.tz()` — office timezone (`Asia/Kolkata`). Keep `OFFICE_TZ` in
  `src/lib/utils.ts` the same.
- `private.late_after()` — Late cut-off (`10:15`).
- Weekly off is **per employee** (Employees → Edit → Weekly Off). Their
  weekly off doesn't count as an absence.
- `private.session_days()` / `private.session_max_days()` — how long a login
  lasts without opening the panel (30 days), and at most (90 days).

Re-run `functions.sql` after editing.

## Where things live

```
supabase/
  schema.sql                 tables, locks, starter accounts
  functions.sql              every API function + office settings

src/app/                     pages (App Router)
  login/                     sign-in
  (panel)/layout.tsx         sidebar + header shell, sign-in and /admin guards
  (panel)/dashboard/         employee dashboard
  (panel)/attendance/        my month + team day/month, missed punch, upload, salary sheet (Admin)
  (panel)/reports/           my reports + team reports (HR/Admin)
  (panel)/profile/           profile + change password
  (panel)/settings/          per-device preferences
  (panel)/admin/             HR/Admin dashboard, employees, permissions

src/lib/
  api.ts                     every database call, one function per SQL function
  use-api.ts                 small data-loading hook
  constants.ts               departments, roles, modules, REPORT FORM FIELDS
  nav.ts                     sidebar items per role/permission
  utils.ts                   formatting helpers (dates/times in office time)

src/context/
  session-context.tsx        login/logout, token storage, current user + permissions
  preferences-context.tsx    per-device settings

src/components/              UI building blocks and feature dialogs
```

**Design system:** every colour, radius and font comes from
`tailwind.config.ts` (`surface`, `ink`, `brand`, `status`). The accent
(`brand`) is the logo blue, `#273992`.

## Not built yet

- An automatic eTimeOffice API import (uploads go through `att_import`, so one can be added later).
- Self-service "forgot password" (HR/Admin resets it today).
