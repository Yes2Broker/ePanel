"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Eye, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Modal } from "@/components/ui/modal";
import { EmployeeFormDialog } from "@/components/employees/employee-form-dialog";
import { employees as EMPLOYEES, DEPARTMENTS, ROLES } from "@/data/employees";
import { Employee } from "@/types";
import { initials, formatINR } from "@/lib/utils";

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);

  const filtered = useMemo(() => employees.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === "All" || e.department === deptFilter;
    const matchesRole = roleFilter === "All" || e.role === roleFilter;
    return matchesSearch && matchesDept && matchesRole;
  }), [employees, search, deptFilter, roleFilter]);

  const save = (data: Employee) => {
    if (editing) {
      setEmployees(employees.map((e) => (e.id === editing.id ? data : e)));
    } else {
      setEmployees([data, ...employees]);
    }
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">Employees</h1>
          <p className="mt-0.5 text-sm text-ink-faint">{filtered.length} of {employees.length} employees</p>
        </div>
        <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Employee</PrimaryButton>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="w-60 rounded-pill border border-surface-border bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-pill border border-surface-border bg-white px-3 py-2 text-sm text-ink-muted">
          <option value="All">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-pill border border-surface-border bg-white px-3 py-2 text-sm text-ink-muted">
          <option value="All">All roles</option>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-2.5">Employee</th>
                <th className="px-2 py-2.5">Department</th>
                <th className="px-2 py-2.5">Role</th>
                <th className="px-2 py-2.5">Designation</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-2 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">{initials(e.name)}</div>
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-ink-faint">{e.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.department}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.role}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.designation}</td>
                  <td className="px-2 py-2.5"><StatusPill status={e.status} /></td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewing(e)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted"><Eye className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { setEditing(e); setDialogOpen(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-10 text-center text-sm text-ink-faint">No employees match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EmployeeFormDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={save} initial={editing} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Employee Details" wide>
        {viewing && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[["Full Name", viewing.name], ["Employee ID", viewing.id], ["Email", viewing.email], ["Mobile", viewing.mobile],
              ["Department", viewing.department], ["Role", viewing.role], ["Designation", viewing.designation],
              ["Salary", formatINR(viewing.salary)], ["Date of Joining", viewing.joiningDate],
              ["Reporting Manager", viewing.manager], ["Status", viewing.status]].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-ink-faint">{label}</p>
                <p className="mt-0.5 font-medium text-ink">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
