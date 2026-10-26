// HR: Neha Shah (EMP102).
const path = require("path");
const fs = require("fs");
const os = require("os");
const { choose, pickDate, typeTime, dialog } = require("./helpers");

// A small sample upload in the panel's template format (two days, sample codes).
function sampleUpload() {
  const XLSX = require(require.resolve("xlsx", { paths: [path.resolve(__dirname, "../../..")] }));
  const rows = [["Date", "Employee Code", "In Time", "Out Time", "Paid Leave", "Remark"]];
  const people = ["EMP101", "EMP102", "EMP103", "EMP104", "EMP105", "EMP106", "EMP107"];
  people.forEach((c, i) => rows.push(["26/10/2026", c, c === "EMP104" ? "" : `${9 + (i % 2)}:${String(40 + i * 3).padStart(2, "0")}`, c === "EMP104" ? "" : "18:50", c === "EMP104" ? "Yes" : "", c === "EMP104" ? "Approved leave" : ""]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Attendance");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sop-")), "Attendance_26-Oct.xlsx");
  XLSX.writeFile(wb, file);
  return file;
}

module.exports = async ({ page, shot, login, APP }) => {
  await login(page, "neha.shah@example.com");

  // Dashboard
  await page.getByText("Pending approvals").waitFor();
  await page.getByText("Employee Overview").waitFor();
  await shot(page, "dashboard", "HR dashboard: today's attendance, leave requests and reports at a glance.", page.getByText("Pending approvals").locator("xpath=ancestor::a[1]"));

  // Employees
  await page.goto(`${APP}/admin/employees`);
  await page.getByRole("button", { name: "View Rohan Mehta" }).first().waitFor();
  const add = page.getByRole("button", { name: "Add Employee" });
  await shot(page, "employees", "Open Employees to see everyone. Search or filter by department, role and status.", add);
  await add.click();
  const form = dialog(page, "Add Employee");
  await form.waitFor();
  const field = (l) => form.locator("label").filter({ hasText: l }).locator("input").first();
  await field("Full Name").fill("Rahul Verma");
  await field("Employee ID").fill("EMP108");
  await field("Email").fill("rahul.verma@example.com");
  await field("Mobile Number").fill("9000000108");
  await field("Salary").fill("26000");
  await pickDate(form, "Date of Joining", "2026-10-26");
  await choose(form, "Department", "Sales");
  await field("Designation").fill("Sales Executive");
  await field("Reporting Manager").fill("Amit Desai");
  await choose(form, "Weekly Off", "Sunday");
  await field("Initial Password").fill("Welcome@108");
  await shot(page, "add-employee", "Tap Add Employee, fill the details and an initial password, then tap Add employee.", form.getByRole("button", { name: "Add employee" }));
  await form.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "View Rohan Mehta" }).first().click();
  const details = dialog(page, "Employee Details");
  await details.waitFor();
  await shot(page, "employee-details", "Tap the eye icon to see an employee's details.", details);
  await details.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Reset password for Rohan Mehta" }).first().click();
  const reset = page.getByRole("dialog").filter({ hasText: "New Password" });
  await reset.waitFor();
  await reset.locator("input").fill("Reset@2026");
  await shot(page, "reset-password", "Forgot password? Tap the key icon, type a new password and tap Set new password.", reset.getByRole("button", { name: "Set new password" }));
  await reset.getByRole("button", { name: "Cancel" }).click();

  // Permissions
  await page.goto(`${APP}/admin/permissions`);
  await page.locator("main").getByRole("button", { name: /Rohan Mehta/ }).last().click();
  const projects = page.getByRole("checkbox", { name: /Green Valley Residency/ });
  await projects.waitFor();
  await shot(page, "permissions", "Open Permissions, choose the person and turn modules on or off. Tick the Sole Selling projects they report for.", projects.locator("xpath=.."));

  // Daily reports
  await page.goto(`${APP}/reports`);
  await page.getByRole("heading", { name: /Totals/ }).waitFor();
  await page.locator("main").getByText("Rohan Mehta").filter({ visible: true }).first().waitFor();
  await shot(page, "reports-summary", "Daily Reports opens on Summary: today's and this month's totals for each person.", page.getByRole("tab", { name: "Summary" }));
  await page.getByRole("tab", { name: "Reports" }).click();
  await page.locator("main table tbody tr").first().waitFor();
  await choose(page, "Person", "Rohan Mehta");
  await page.waitForTimeout(600);
  await shot(page, "reports-table", "On the Reports tab, filter by person, report and dates to find any report.", page.getByRole("combobox", { name: "Person" }));
  await choose(page, "Person", "All people").catch(() => {});
  await page.getByRole("button", { name: "File for someone" }).click();
  const file = page.getByRole("dialog").filter({ has: page.getByRole("combobox", { name: "Employee" }) });
  await file.waitFor();
  await choose(file, "Employee", "Sneha Rao");
  await file.getByRole("combobox", { name: "Report" }).click().catch(() => {});
  await page.getByRole("option").first().click().catch(() => {});
  await shot(page, "file-for-someone", "Someone couldn't file? Tap File for someone, choose the person, report and date, then Continue.", file.getByRole("button", { name: "Continue" }));
  await file.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.getByLabel("New project name").waitFor();
  await page.getByLabel("New project name").fill("Sunrise Park");
  await shot(page, "projects", "On Projects, add a Sole Selling project or rename / close one.", page.getByLabel("New project name"));

  // Leave
  await page.goto(`${APP}/leave`);
  const card = page.locator("div.rounded-card").filter({ hasText: "Kavya Iyer" }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await card.waitFor();
  await shot(page, "leave-requests", "Open Leave to see pending requests, with warnings for busy days.", card);
  await card.getByRole("button", { name: "Approve" }).click();
  const toast = page.getByText("Approved Kavya Iyer's leave.");
  await toast.waitFor();
  await shot(page, "leave-approved", "Tap Approve (or Reject with a reason). The employee sees the result at once.", toast);

  // Attendance
  await page.goto(`${APP}/attendance`);
  const checks = page.getByRole("button", { name: /checked their/ });
  await checks.waitFor();
  await page.locator("main table tbody tr").first().waitFor();
  await checks.click();
  await shot(page, "attendance-list", "Open Attendance. The top line shows how many people have checked their month.", checks);
  await checks.click();
  await choose(page, "Employee", "Rohan Mehta");
  await page.getByText("Net payable days").waitFor();
  await choose(page, "Status", "Late");
  await page.waitForTimeout(400);
  await shot(page, "attendance-filters", "Use the filters to see one person, one month or one status (for example Late).", page.getByRole("combobox", { name: "Status" }));
  await choose(page, "Status", "All statuses");
  await page.locator("main table tbody tr").filter({ hasText: "16 Oct" }).first().click();
  const day = page.getByRole("dialog", { name: "Rohan Mehta" });
  await day.waitFor();
  await typeTime(day, "Out time", "18:55");
  await day.locator("input").last().fill("Forgot to punch out");
  await shot(page, "edit-day", "Tap a row to change that day: status, in / out time and a remark. Then Save.", day.getByRole("button", { name: "Save" }));
  await day.getByRole("button", { name: "Cancel" }).click();

  // Upload
  await page.goto(`${APP}/attendance?tab=upload`);
  const chooseFile = page.getByRole("button", { name: "Choose file" });
  await chooseFile.waitFor();
  await page.getByText("MonthInOut_Oct_1-24.xls").waitFor();
  await shot(page, "upload", "On the Upload tab, tap Choose file and pick the eTimeOffice report or the template.", chooseFile);
  await page.setInputFiles("input[type=file]", sampleUpload());
  const imp = page.getByRole("button", { name: /^Import \d+ days/ });
  await imp.waitFor();
  await shot(page, "upload-preview", "Check the preview. Nothing is saved until you tap Import.", imp);
  await imp.click();
  await page.getByText(/^Imported:/).waitFor();
  await page.getByText("Attendance_26-Oct.xlsx").waitFor();
  const del = page.getByRole("button", { name: "Delete upload Attendance_26-Oct.xlsx" });
  await shot(page, "uploads-list", "Recent uploads are listed below. Uploaded the wrong file? Tap the bin icon to undo it.", del);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "download-template", "Need the template? Tap Download template, fill one row per person per day and upload it.", page.getByRole("link", { name: "Download template" }));
};
