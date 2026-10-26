// Small helpers for the app's own pickers (no native <select>/<input type=date>).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

const pageOf = (scope) => (typeof scope.page === "function" ? scope.page() : scope);

/** Open a Select (role=combobox) by its label and pick an option. */
async function choose(scope, label, option) {
  await scope.getByRole("combobox", { name: label, exact: true }).first().click();
  await pageOf(scope).getByRole("option", { name: option, exact: true }).first().click();
}

/** Open a DatePicker by its label and pick a date ("YYYY-MM-DD"), moving months as needed. */
async function pickDate(scope, label, iso) {
  const page = pageOf(scope);
  await scope.getByRole("button", { name: new RegExp(`^${label}(:|$)`) }).first().click();
  const want = page.getByRole("button", { name: shortDate(iso), exact: true });
  for (let i = 0; i < 24 && !(await want.count()); i++) await page.getByRole("button", { name: "Next month" }).last().click();
  await want.first().click();
}

/** Type a time into a TimeInput ("HH:MM"). */
async function typeTime(scope, label, hhmm) {
  const f = scope.getByLabel(label, { exact: true }).first();
  await f.fill(""); await f.type(hhmm.replace(":", ""));
}

const dialog = (page, name) => page.getByRole("dialog", { name });

module.exports = { choose, pickDate, typeTime, dialog, shortDate };
