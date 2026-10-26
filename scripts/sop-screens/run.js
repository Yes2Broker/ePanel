#!/usr/bin/env node
/**
 * SOP screenshots of ePanel, made with SAMPLE data only.
 *
 *   node scripts/sop-screens/run.js            build, start the app, take every screenshot
 *   node scripts/sop-screens/run.js --no-build reuse the last build (it must be a SOP build)
 *   node scripts/sop-screens/run.js --only hr  one role: employee | hr | admin
 *
 * The app is built and started locally with a dummy Supabase URL. Every
 * Supabase RPC the browser makes is answered by page.route() from
 * fixtures.json (sample people, reports, leave, attendance, salary), and any
 * other request to the dummy host is blocked, so no real database or account
 * is ever reached. See README.md for how fixtures.json was made.
 */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs/sop/screens");
const FIXTURES = path.join(__dirname, "fixtures.json");
const PORT = 4310;
const APP = `http://localhost:${PORT}`;
const DUMMY = "http://sop-sample.invalid"; // never resolves: nothing can leak out
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const RECORD = opt("--record"); // dev only: a LOCAL test API loaded with sample-seed.sql
const ONLY = opt("--only");
const PASSWORD = "Sample@123";

function loadPlaywright() {
  for (const m of ["playwright", "playwright-core"]) {
    try { return require(m); } catch { /* try the next one */ }
  }
  throw new Error("Playwright is not installed (npm i -D playwright, then npx playwright install chromium).");
}

// ---------------------------------------------------------------------------
// Sample API: replay fixtures.json (or, with --record, forward to a local
// sample database and save what it answers).
// ---------------------------------------------------------------------------
const READS = new Set([
  "get_me", "list_employees", "get_employee_permissions", "att_month", "att_team_days", "att_salary_sheet", "att_day_changes",
  "att_uploads", "att_dashboard", "att_my_updates", "att_checks", "list_projects", "get_employee_projects", "report_options",
  "report_form", "get_report", "report_history", "my_sales_reports", "list_sales_reports", "team_report_summary",
  "get_report_email_recipients", "get_report_email_time", "list_employee_aliases", "leave_overview", "leave_preview",
  "leave_timeline", "leave_attachment", "leave_queue", "leave_dashboard", "employee_dashboard", "admin_dashboard",
]);
const isMutation = (fn, a) => fn !== "login_employee" && fn !== "logout_employee" && !READS.has(fn) && !(fn === "att_import" && a.p_dry);

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

class SampleApi {
  constructor() {
    this.data = RECORD ? { clock: null, calls: [] } : JSON.parse(fs.readFileSync(FIXTURES, "utf8"));
    this.epoch = 0;          // mutations so far: later reads see their effect
    this.users = new Map();  // session token -> employee id
    this.used = new Set();
  }

  key(fn, a) {
    const { p_token, ...rest } = a;
    const who = p_token ? this.users.get(p_token) ?? "?" : "-";
    return { who, key: `${fn}|${who}|${stable(rest)}` };
  }

  async handle(route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors() });
    const fn = req.url().split("/rpc/")[1].split("?")[0];
    const a = req.postDataJSON() ?? {};
    const { who, key } = this.key(fn, a);
    const mutation = isMutation(fn, a);
    let status, body;
    if (RECORD) {
      const res = await fetch(`${RECORD}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
      status = res.status; body = await res.text();
      if (mutation) this.epoch++;
      this.data.calls.push({ fn, who, key, epoch: this.epoch, status, body });
    } else {
      if (mutation) this.epoch++;
      const rec = this.find(fn, who, key);
      if (!rec) {
        console.warn(`  ! no sample answer for ${fn} (${who}) ${key.slice(0, 160)}`);
        status = 400; body = JSON.stringify({ code: "P0001", message: "No sample data for this screen.", details: null, hint: null });
      } else ({ status, body } = rec);
    }
    if (fn === "login_employee" && status === 200 && body !== "null") {
      const s = JSON.parse(body); this.users.set(s.token, s.employee.id);
    }
    return route.fulfill({ status, headers: { ...cors(), "Content-Type": "application/json" }, body });
  }

  // The answer recorded for this exact call at (or just before) this point in
  // the run. A mutation whose arguments hold random ids falls back to the same
  // function for the same person.
  find(fn, who, key) {
    const pick = (list) => {
      const ok = list.filter((c) => c.epoch <= this.epoch);
      if (!ok.length) return list[0];
      const top = Math.max(...ok.map((c) => c.epoch));
      const same = ok.filter((c) => c.epoch === top);
      const fresh = same.find((c) => !this.used.has(c)) ?? same[same.length - 1];
      this.used.add(fresh);
      return fresh;
    };
    const exact = this.data.calls.filter((c) => c.key === key);
    if (exact.length) return pick(exact);
    const loose = this.data.calls.filter((c) => c.fn === fn && c.who === who);
    return loose.length ? pick(loose) : null;
  }

  save() {
    fs.writeFileSync(FIXTURES, JSON.stringify(this.data, null, 1) + "\n");
    console.log(`saved ${this.data.calls.length} sample answers to ${path.relative(ROOT, FIXTURES)}`);
  }
}
const cors = () => ({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,GET,OPTIONS" });

// ---------------------------------------------------------------------------
// App: next build + next start with the dummy Supabase env.
// ---------------------------------------------------------------------------
const appEnv = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: DUMMY, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sop-sample-anon-key", NEXT_TELEMETRY_DISABLED: "1" };

function build() {
  console.log("next build (dummy Supabase env)…");
  execSync("npx next build", { cwd: ROOT, env: appEnv, stdio: ["ignore", "ignore", "inherit"] });
}

async function startApp() {
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env: appEnv, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${APP}/login`)).ok) return proc; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start did not come up");
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------
const manifest = [];
let browser, api;

async function newSession(role) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: "block",
    timezoneId: "Asia/Kolkata", locale: "en-IN", acceptDownloads: true,
  });
  await ctx.clock.setFixedTime(new Date(api.data.clock));
  await ctx.route("**/rest/v1/rpc/**", (r) => api.handle(r));
  await ctx.route(`${DUMMY}/**`, (r) => (r.request().url().includes("/rest/v1/rpc/") ? r.fallback() : r.abort()));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`  ! page error (${role}): ${e.message}`));
  // The install prompt only fires on a real installable visit; give the
  // page a sample one so the "Install app" button shows.
  await page.addInitScript(() => {
    window.addEventListener("load", () => setTimeout(() => {
      const e = new Event("beforeinstallprompt");
      e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    }, 300));
  });
  return { ctx, page };
}

function counter(role) {
  let n = 0;
  return async (page, name, caption, target) => {
    n++;
    const file = `${role}/${String(n).padStart(2, "0")}-${name}.png`;
    let highlight = null;
    if (target) {
      const loc = typeof target === "string" ? page.locator(target) : target;
      await loc.first().scrollIntoViewIfNeeded().catch(() => {});
      const b = await loc.first().boundingBox();
      if (b) highlight = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    }
    await page.waitForTimeout(250); // let transitions settle
    await page.screenshot({ path: path.join(OUT, file) });
    manifest.push({ file, role, caption, highlight });
    console.log(`  ${file}`);
  };
}

async function login(page, email, shot) {
  await page.goto(`${APP}/login`);
  await page.locator("#email").waitFor();
  if (shot) await shot(page, "login", "Open the panel. You will see the login page.", "#email");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  if (shot) await shot(page, "login-filled", "Type your email (or employee code) and password, then tap Log in.", page.locator("button[type=submit]"));
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(admin|dashboard)$/);
}

const flows = {
  employee: require("./flows/employee"),
  hr: require("./flows/hr"),
  admin: require("./flows/admin"),
};

(async () => {
  if (!RECORD && !fs.existsSync(FIXTURES)) throw new Error("fixtures.json is missing");
  if (!flag("--no-build")) build();
  const app = await startApp();
  const { chromium } = loadPlaywright();
  browser = await chromium.launch();
  api = new SampleApi();
  if (RECORD) api.data.clock = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const roles = ONLY ? [ONLY] : ["employee", "hr", "admin"];
  let failed = false;
  try {
    for (const role of roles) {
      fs.rmSync(path.join(OUT, role), { recursive: true, force: true });
      fs.mkdirSync(path.join(OUT, role), { recursive: true });
      console.log(role);
      const { ctx, page } = await newSession(role);
      await flows[role]({ page, shot: counter(role), login, APP });
      await ctx.close();
    }
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await browser.close();
    try { process.kill(-app.pid); } catch { /* already gone */ }
  }
  if (RECORD && !failed) api.save();
  if (!failed) {
    const file = path.join(OUT, "manifest.json");
    const old = ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).filter((m) => m.role !== ONLY) : [];
    const all = [...old, ...manifest].sort((a, b) => ["employee", "hr", "admin"].indexOf(a.role) - ["employee", "hr", "admin"].indexOf(b.role) || a.file.localeCompare(b.file));
    fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
    console.log(`${manifest.length} screenshots`);
  }
  process.exit(failed ? 1 : 0);
})();
