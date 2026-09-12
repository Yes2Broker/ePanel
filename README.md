# Yes2Broker Employee Panel

UI/UX-only prototype. No backend, no database, no real auth — everything is
mock data living in `src/data/*`. Built with Next.js App Router, TypeScript,
Tailwind CSS, lucide-react icons and Recharts, styled to match the light,
yellow-accent SaaS look you shared as a reference.

## 1. Prerequisites

- Node.js 18.18 or newer (check with `node -v`)
- npm (comes with Node)

## 2. Install

Unzip this project, open a terminal in its root folder, then run:

```bash
npm install
```

This pulls in Next.js, React, Tailwind, lucide-react and recharts — nothing
else. It needs an internet connection (this step can't run inside the
sandbox I built the files in, so please run it on your own machine).

## 3. Add your brand assets

Drop your two files into `public/assets/` using these exact names — the code
already points at them:

```
public/assets/logo.webp   -> sidebar + login screen logo
public/assets/fav.jpg     -> browser favicon
```

## 4. Run it

```bash
npm run dev
```

Open http://localhost:3000 — you'll land on the login screen.

## 5. Log in (mock accounts)

There's no real authentication yet. Click one of the three demo accounts on
the login screen, or type an email that matches one in
`src/data/employees.ts` (any password works):

- `ahmed@yes2broker.com` → Employee (Sales) → goes to the Employee Dashboard
- `priya@yes2broker.com` → HR → goes to the Admin-style Dashboard
- `zubair@yes2broker.com` → Admin → goes to the Admin-style Dashboard

The session is stored in `localStorage` only (see
`src/context/session-context.tsx`) so refreshing keeps you logged in, and
"Switch account / Log out" in the header clears it.

## 6. Where things live (so it's easy to keep changing)

```
src/app/                     Next.js App Router pages
  layout.tsx                 root HTML shell, favicon, SessionProvider
  page.tsx                   redirects to /login or /dashboard
  login/page.tsx             login screen
  (panel)/layout.tsx         shared shell: sidebar + header, auth guard
  (panel)/dashboard/         Employee dashboard
  (panel)/admin/             Admin dashboard (the one styled after your reference image)
  (panel)/admin/employees/   Employee list, search/filter, add/edit/view
  (panel)/admin/permissions/ Per-employee module access toggles
  (panel)/attendance/        Attendance (view only)
  (panel)/tasks/             My Tasks (full CRUD, local state)
  (panel)/reports/           Daily Reports (placeholders + past reports table)
  (panel)/profile/           Read-only profile
  (panel)/settings/          Appearance / sidebar / notification preferences

src/components/
  layout/                    Sidebar, Header
  ui/                        Card, StatusPill, PriorityPill, buttons, Modal, Toggle
  dashboard/                 SummaryCard, TopPerformers, PerformanceChart, PerformanceTable, WeeklyTrendChart
  tasks/, employees/         Feature-specific dialogs

src/data/                    ALL mock data lives here (employees, tasks,
                              attendance, reports, permissions). When you're
                              ready to connect Supabase/Postgres/Sheets,
                              replace the exports in this folder only —
                              no component should need to change.

src/types/                   Shared TypeScript types/interfaces
src/context/                 Mock session (localStorage-based) — swap for
                              real auth later without touching page code
src/lib/                     nav config + small utility helpers
```

## 7. Design system — change the whole look from one place

Every color, radius and font in the app comes from `tailwind.config.ts`:

- `colors.surface` — page background / card background / borders
- `colors.ink` — text (default / muted / faint)
- `colors.brand` — the single yellow accent color (`brand`, `brand.dark`, `brand.soft`)
- `colors.status` — success / warning / danger / neutral pill colors
- `borderRadius.card` / `borderRadius.pill` — the two radii used everywhere

Change a value there and it updates across every page, since no component
hardcodes a raw hex color.

## 8. What's intentionally NOT built yet

Per your instructions, this is UI/UX only:

- No Supabase / Postgres / Google Sheets connection
- No real authentication or password reset
- No APIs
- No production hosting config
- No Tech tools, Builder Data, Inquiry Form, or Analytics screens

These slot in later without a UI rewrite — the mock data layer in `src/data/`
and the mock session in `src/context/session-context.tsx` are the only two
places built to be swapped out.

## 9. Suggested next steps

1. Review the Admin Dashboard (`/admin`) against your reference image and
   tell me what to nudge (spacing, exact yellow shade, chart shapes).
2. Once the look is approved, I can wire in shadcn/ui properly (`npx
   shadcn@latest init`) to replace the hand-rolled `components/ui` primitives
   with the real library, if you'd like the exact shadcn components under the
   hood.
3. When you're ready, swap `src/data/*` for real API calls and
   `session-context.tsx` for real auth — the rest of the app shouldn't need
   to change.
