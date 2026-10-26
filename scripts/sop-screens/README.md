# SOP screenshots

Desktop screenshots of ePanel for the SOP, made with **sample data only**.

```bash
node scripts/sop-screens/run.js             # next build + next start, then every screen
node scripts/sop-screens/run.js --no-build  # reuse the last build (only one made by this script)
node scripts/sop-screens/run.js --only hr   # one role: employee | hr | admin
```

Needs Playwright with Chromium (`require("playwright")`).

Output: `docs/sop/screens/{employee,hr,admin}/NN-name.png` (1440×900 at 2×) and
`docs/sop/screens/manifest.json`. Each manifest entry has `file`, `role`, a one-line
`caption`, and `highlight` {x, y, width, height}, the main button or field for that step,
in CSS pixels of the 1440×900 viewport. Multiply by 2 for image pixels.

## How it stays away from real data

- The app is built and started with `NEXT_PUBLIC_SUPABASE_URL=http://sop-sample.invalid`,
  a host that never resolves.
- Every `**/rest/v1/rpc/**` call is answered by `page.route()` from `fixtures.json`.
  Any other request to the dummy host is blocked.
- Service workers are blocked, so nothing can bypass the routes.
- The browser clock is fixed to the time the fixtures were recorded, so the dates match.

## Sample data

Sample people:
- Amit Desai (Admin, EMP100)
- Rohan Mehta (Employee, EMP101; Normal report + Sole Selling)
- Neha Shah (HR, EMP102)
- Kavya Iyer, Arjun Nair, Priya Kulkarni, Vikram Joshi and Sneha Rao (EMP103–107)

Everything else is sample data too: `@example.com` emails, made-up salaries, projects,
October 2026 reports, leave and attendance. It all lives in `sample-seed.sql`.

## Re-recording fixtures.json (only when the screens change)

`fixtures.json` holds the answers the real SQL functions gave on a **throw-away local
Postgres** loaded with `supabase/*.sql` plus `sample-seed.sql`. To record it again:

1. Load a fresh local database. Never use the real Supabase project.
2. Serve that database at a local PostgREST-compatible URL.
3. Run `node scripts/sop-screens/run.js --record http://localhost:54321`.

Recording sends the same flows to that URL and saves each answer. Replay answers each call
with what was recorded at the same point of the run: the same function, person and
arguments, after the same number of changes.
