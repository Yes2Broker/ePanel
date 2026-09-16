import { Employee } from "@/types";

export function mapEmployeeRow(row: any): Employee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    department: row.department,
    role: row.role,
    designation: row.designation,
    salary: Number(row.salary),
    joiningDate: row.joining_date,
    manager: row.manager,
    status: row.status,
  };
}
