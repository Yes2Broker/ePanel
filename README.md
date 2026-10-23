# Yes2Broker Employee Panel

The internal panel for Yes2Broker staff: attendance check-in/out, leave
requests, personal tasks, daily reports, and an HR/Admin side for managing
employees, approvals and module access. Built with Next.js (App Router),
TypeScript, Tailwind CSS, lucide-react, Recharts and Supabase (Postgres).

## What each role gets

**Employees**
- **Dashboard** — live check-in/out, this month's attendance rate, upcoming tasks, recent reports, upcoming leave.
- **Attendance** — check in / check out; month-by-month history. Check-ins after 10:15 AM are marked Late.
- **Leave** — request Casual / Sick / Earned / Unpaid leave, see status and HR's note, cancel while pending.
- **My Tasks** — private to-do list with priority and due dates (overdue tasks are highlighted).
- **Daily Reports** — Normal and Sole Selling report forms; save a draft or submit; fix and resubmit if HR sends one back.
- **Profile** — view details and change your own password.
- **Settings** — compact sidebar and which dashboard sections to show (per device).

**HR and Admin** get all of the above, plus:
- **Dashboard** — who's in today, pending leave and reports, monthly and daily attendance charts, per-employee overview.
- **Employees** — add, edit, deactivate, reset passwords.
- **Attendance → Team** — everyone's check-in for any date, with corrections (status, times, note).
- **Leave → Approvals** — approve or reject with a note. Approved days show as Leave in attendance.
- **Daily Reports → Team reports** — review, approve, or send back with feedback.
- **Permissions** — turn modules on/off per employee. The sidebar and the database both respect this.

HR can manage everyone except Admin accounts; only an Admin can create,
edit or reset another Admin. Nobody can review their own leave or report.

## Setup

### 1. Install

Node.js 18.18+ is required.

```bash
npm install
```

### 2. Create the database

In your Supabase project, open **SQL Editor → New query** and run these two
files, in this order:

1. `supabase/schema.sql` — tables + the three starter accounts
2. `supabase/functions.sql` — everything the app calls

Both are safe to run again. Whenever `functions.sql` changes, re-run it.

> **Upgrading from the earlier prototype?** Just run both files. `functions.sql`
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
public/assets/logo.webp   -> sidebar + login screen logo
public/assets/fav.jpg     -> browser favicon
```

### 5. Run

```bash
npm run dev      # development, http://localhost:3000
npm run build && npm start   # production
```

### 6. Starter accounts

| Email | Password | Role |
| --- | --- | --- |
| `zubair@yes2broker.com` | `Zubair@123` | Admin |
| `priya@yes2broker.com` | `Priya@123` | HR |
| `ahmed@yes2broker.com` | `Ahmed@123` | Employee (Sales) |

**Change these passwords straight away** (Profile → Change Password, or
Employees → key icon). New passwords must be at least 8 characters.

## How security works

- The browser never reads or writes a table. Every table has row level
  security on with no policies, and `anon` has no table privileges.
- The app only calls Postgres functions (`supabase/functions.sql`).
  `login_employee` checks the bcrypt password and returns a random session
  token; only its SHA-256 hash is stored. Every other function takes that
  token, resolves it to an active employee, and checks role and module
  permission before doing anything.
- Sessions last 7 days. Resetting a password, changing your own password,
  or deactivating an employee signs them out (other devices, for a
  password change).
- Internal helpers live in a `private` schema that the API doesn't expose.

## Office rules you may want to change

At the top of `supabase/functions.sql`, under **Office settings**:

- `private.tz()` — office timezone (`Asia/Kolkata`). Keep `OFFICE_TZ` in
  `src/lib/utils.ts` the same.
- `private.late_after()` — Late cut-off (`10:15`).
- `private.is_working_day()` — weekly off (Sunday).
- `private.session_days()` — how long a login lasts (7 days).

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
  (panel)/attendance/        my attendance + team view (HR/Admin)
  (panel)/leave/             my leave + approvals (HR/Admin)
  (panel)/tasks/             personal tasks
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

**Changing a report form:** edit `REPORT_FIELDS` in `src/lib/constants.ts`.
Answers are stored as JSON, so no database change is needed and old
reports keep their answers.

**Design system:** every colour, radius and font comes from
`tailwind.config.ts` (`surface`, `ink`, `brand`, `status`).

## Not built yet

- Builder Data, Inquiry Form and Analytics modules (their permission
  toggles exist and are marked "Coming soon").
- Email / push notifications for approvals and reminders.
- Public holidays (only the weekly off is excluded from attendance).
- Leave balances / yearly quotas per leave type.
- Self-service "forgot password" (HR/Admin resets it today).
