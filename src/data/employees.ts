import { Employee } from "@/types";

/**
 * MOCK DATA — replace this module's export with a real fetch
 * (Supabase / Postgres / Google Sheets) later. No component should
 * import employee data from anywhere else, so the swap stays isolated here.
 */
export const DEPARTMENTS = ["Sales", "Tech", "HR", "Admin"] as const;
export const ROLES = ["Employee", "HR", "Admin"] as const;

export const employees: Employee[] = [
  { id: "EMP001", name: "Ahmed Khan", email: "ahmed@yes2broker.com", mobile: "+91 98765 43210", department: "Sales", role: "Employee", designation: "Sales Executive", salary: 35000, joiningDate: "2025-03-12", manager: "Karan Mehta", status: "Active" },
  { id: "EMP002", name: "Priya Shah", email: "priya@yes2broker.com", mobile: "+91 91234 56780", department: "HR", role: "HR", designation: "HR Manager", salary: 52000, joiningDate: "2023-06-01", manager: "Zubair Merchant", status: "Active" },
  { id: "EMP003", name: "Zubair Merchant", email: "zubair@yes2broker.com", mobile: "+91 99887 66554", department: "Admin", role: "Admin", designation: "Operations Head", salary: 68000, joiningDate: "2021-01-15", manager: "—", status: "Active" },
  { id: "EMP004", name: "Karan Mehta", email: "karan@yes2broker.com", mobile: "+91 90909 12121", department: "Sales", role: "Employee", designation: "Sales Team Lead", salary: 48000, joiningDate: "2022-09-20", manager: "Zubair Merchant", status: "Active" },
  { id: "EMP005", name: "Aisha Patel", email: "aisha@yes2broker.com", mobile: "+91 93333 44455", department: "Tech", role: "Employee", designation: "Software Engineer", salary: 55000, joiningDate: "2024-02-10", manager: "Zubair Merchant", status: "Active" },
  { id: "EMP006", name: "Rahul Verma", email: "rahul@yes2broker.com", mobile: "+91 98765 11122", department: "Sales", role: "Employee", designation: "Sales Executive", salary: 32000, joiningDate: "2025-05-05", manager: "Karan Mehta", status: "Active" },
  { id: "EMP007", name: "Neha Joshi", email: "neha@yes2broker.com", mobile: "+91 97777 88899", department: "HR", role: "Employee", designation: "HR Executive", salary: 30000, joiningDate: "2024-11-18", manager: "Priya Shah", status: "Active" },
  { id: "EMP008", name: "Farhan Sheikh", email: "farhan@yes2broker.com", mobile: "+91 96666 55544", department: "Admin", role: "Employee", designation: "Admin Executive", salary: 28000, joiningDate: "2025-01-08", manager: "Zubair Merchant", status: "Inactive" },
];

export function getEmployeeById(id: string) {
  return employees.find((e) => e.id === id);
}
