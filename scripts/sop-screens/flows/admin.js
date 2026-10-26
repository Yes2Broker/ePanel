// Admin: Amit Desai (EMP100).
const { dialog } = require("./helpers");

module.exports = async ({ page, shot, login, APP }) => {
  await login(page, "amit.desai@example.com");

  // Dashboard + Customise
  await page.getByText("Employee Overview").waitFor();
  await page.getByRole("button", { name: "Customise", exact: true }).click();
  const panel = dialog(page, "Customise dashboard");
  await panel.waitFor();
  await shot(page, "dashboard-customise", "Admin dashboard. Tap Customise to pick a preset (Today, Team reports…) or choose your own cards.", panel.getByRole("radiogroup"));
  await panel.getByRole("button", { name: "Close" }).click();

  // Salary sheet
  await page.goto(`${APP}/attendance?tab=salary`);
  const row = page.locator("main table tbody tr").filter({ hasText: "Rohan Mehta" }).first();
  await row.waitFor();
  await shot(page, "salary-sheet", "Open Attendance → Salary sheet to see everyone's payable days and final salary for the month.", page.locator("main table").first());
  await row.click();
  const details = dialog(page, "Rohan Mehta");
  await details.waitFor();
  await shot(page, "salary-details", "Tap a person to see how their salary was worked out.", details);
  await details.getByRole("button", { name: "Close" }).first().click();
  await shot(page, "salary-excel", "Tap Salary Sheet (Excel) to download the month as an Excel file.", page.getByRole("button", { name: "Salary Sheet (Excel)" }));

  // Email settings
  await page.goto(`${APP}/reports?tab=email`);
  const time = page.getByRole("combobox", { name: "Send at (India time)" });
  await time.waitFor();
  await page.getByText("reports@example.com").waitFor().catch(() => {});
  await shot(page, "email-settings", "On Daily Reports → Email, choose when the daily report email goes out and who gets it.", time);

  // Delete a report
  await page.goto(`${APP}/reports?tab=reports`);
  const del = page.getByRole("button", { name: /^Delete / }).first();
  await del.waitFor();
  await del.click();
  const confirm = dialog(page, "Delete this report?");
  await confirm.waitFor();
  await shot(page, "delete-report", "Only Admin can delete a report: tap the bin icon, then Delete to confirm.", confirm.getByRole("button", { name: "Delete", exact: true }));
  await confirm.getByRole("button", { name: "Cancel" }).click();

  // HR's leave
  await page.goto(`${APP}/leave`);
  const card = page.locator("div.rounded-card").filter({ hasText: "Neha Shah" }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await card.waitFor();
  await shot(page, "hr-leave-request", "HR's own leave requests come to Admin. Approve or reject them on the Leave page.", card.getByRole("button", { name: "Approve" }));
};
