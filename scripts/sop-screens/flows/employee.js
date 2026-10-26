// Employee: Rohan Mehta (EMP101, Sales: Normal report + Sole Selling).
const { choose, pickDate, typeTime, dialog } = require("./helpers");

module.exports = async ({ page, shot, login, APP }) => {
  await login(page, "rohan.mehta@example.com", shot);

  // Dashboard
  const banner = page.getByRole("status").filter({ hasText: "has been updated" }).first();
  await banner.waitFor();
  await page.getByText("Payable days").first().waitFor();
  await shot(page, "dashboard", "After login you see your dashboard. The blue banner means HR updated your attendance – please check it.", banner);
  await page.getByRole("button", { name: "Customise", exact: true }).click();
  const panel = dialog(page, "Customise dashboard");
  await panel.waitFor();
  await shot(page, "customise-dashboard", "Tap Customise to choose what your dashboard shows. Pick a preset or turn cards on and off.", panel.getByRole("radiogroup"));
  await panel.getByRole("button", { name: "Close" }).click();

  // Daily reports
  await page.goto(`${APP}/reports`);
  const newBtn = page.getByRole("button", { name: /New report/ });
  await newBtn.waitFor();
  await page.locator("main table tbody tr").first().waitFor();
  await shot(page, "daily-reports", "Open Daily Reports. Here you see all your reports for the month.", newBtn);
  await newBtn.click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  await shot(page, "new-report-menu", "Tap + New report and choose which report to fill: Normal or your Sole Selling project.", menu);
  await menu.getByText("Normal report").click();
  await page.waitForURL(/reports\/fill/);
  await page.getByLabel(/^Today Leads/).waitFor();
  await page.getByLabel(/^Today Leads/).fill("14");
  await page.getByLabel(/^Today Calls/).fill("38");
  await page.getByLabel(/^Positive Calls/).fill("6");
  await page.getByLabel(/^Visit Scheduled Today/).fill("1");
  await page.getByLabel("Scheduled visit 1 client name").fill("Mr. Malhotra");
  await pickDate(page, "Scheduled visit 1 date", "2026-10-30");
  await page.getByLabel(/^Tokens/).fill("1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "report-form", "Fill today's numbers: leads, calls, positive calls, visits scheduled and tokens.", page.getByLabel(/^Today Leads/));

  // Today's visits
  await choose(page, "Action for Mr. Kapoor", "Done");
  await typeTime(page, "Visit time for Mr. Kapoor", "11:30");
  await choose(page, "Action for Mrs. Bhatt", "Reschedule");
  await pickDate(page, "New date for Mrs. Bhatt", "2026-10-31");
  await shot(page, "report-visits", "For each visit due today, choose what happened: Done (with time), Reschedule or Cancel.", page.getByRole("combobox", { name: "Action for Mr. Kapoor" }));
  await page.getByRole("button", { name: "Submit Report" }).click();
  const summary = dialog(page, "Daily Report");
  await summary.waitFor();
  await shot(page, "report-submitted", "Tap Submit Report. You see a summary of the report you sent.", summary);
  await summary.getByRole("button", { name: "Close" }).first().click();

  // My reports
  await page.goto(`${APP}/reports`);
  await page.locator("main table tbody tr").first().waitFor();
  const firstRow = page.locator("main table tbody tr").first();
  await shot(page, "my-reports", "Your reports table. Use the icons to View, Edit (for 24 hours) or see the History of a report.", firstRow.locator("td").last());
  await firstRow.getByRole("button", { name: /^View / }).click();
  await summary.waitFor();
  await shot(page, "view-report", "Tap the eye icon to view a report with today's and month-to-date totals.", summary);
  await summary.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "History of Normal Daily Report, 24 Oct 2026" }).click();
  const hist = dialog(page, "Change history");
  await hist.waitFor();
  await shot(page, "report-history", "Tap the clock icon to see every change made to a report, by whom and when.", hist);
  await hist.getByRole("button", { name: "Close" }).first().click();

  // Attendance
  await page.goto(`${APP}/attendance`);
  const mark = page.getByRole("button", { name: /Mark as checked/ });
  await mark.waitFor();
  await page.getByText("Payable").first().waitFor();
  await shot(page, "attendance", "Open Attendance to see your month. Check your days, then tap Mark as checked.", mark);

  // Leave
  await page.goto(`${APP}/leave`);
  const apply = page.getByRole("button", { name: "Apply for leave" });
  await apply.waitFor();
  await page.getByText("Family function").waitFor();
  await shot(page, "leave", "Open Leave to see your leave requests. Tap Apply for leave to ask for a day off.", apply);
  await apply.click();
  const form = dialog(page, "Apply for leave");
  await form.waitFor();
  await pickDate(form, "From", "2026-11-03");
  await pickDate(form, "To", "2026-11-04");
  await form.locator("textarea").fill("Attending a family wedding in Pune");
  await form.getByText(/2 days/).first().waitFor().catch(() => {});
  await shot(page, "apply-leave", "Pick the dates, write the reason and tap Send request.", form.getByRole("button", { name: "Send request" }));
  await form.getByRole("button", { name: "Send request" }).click();
  await form.waitFor({ state: "detached" });
  const pending = page.getByText("Attending a family wedding in Pune").locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
  await pending.waitFor();
  await shot(page, "leave-pending", "Your request shows as Pending until HR or Admin approves it.", pending);
  await pending.getByRole("button", { name: "Cancel", exact: true }).click();
  const cancel = dialog(page, "Cancel leave");
  await cancel.waitFor();
  await shot(page, "cancel-leave", "Changed your plan? Tap Cancel on a request, then Cancel leave.", cancel.getByRole("button", { name: "Cancel leave" }));
  await cancel.getByRole("button", { name: "Back" }).click();

  // Profile
  await page.goto(`${APP}/profile`);
  await page.getByText("Full Name").waitFor();
  await shot(page, "profile", "Open Profile to see your details. Ask HR or Admin to change them.", page.getByText("Employee ID").first());
  const pw = page.locator("form").filter({ hasText: "Current password" });
  await pw.locator("input").nth(0).fill("Sample@123");
  await pw.locator("input").nth(1).fill("NewSample@456");
  await pw.locator("input").nth(2).fill("NewSample@456");
  await shot(page, "change-password", "To change your password, type the current one and the new one twice, then tap Update password.", pw.getByRole("button", { name: "Update password" }));

  // Install
  await page.goto(`${APP}/settings`);
  const install = page.getByRole("button", { name: "Install app" });
  await install.waitFor();
  await shot(page, "install-app", "Open Settings and tap Install app to add the panel to your computer or phone.", install);
};
