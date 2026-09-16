"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Eye, Pencil, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Modal } from "@/components/ui/modal";
import { EmployeeFormDialog, EmployeeFormValues } from "@/components/employees/employee-form-dialog";
import { ResetPasswordDialog } from "@/components/employees/reset-password-dialog";
import { DEPARTMENTS, ROLES } from "@/data/employees";
import { Employee } from "@/types";
import { initials, formatINR } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { mapEmployeeRow } from "@/lib/employee-mapper";

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.rpc("list_employees");
    if (error) {
      setLoadError(error.message);
    } else {
      setEmployees((data || []).map(mapEmployeeRow));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const filtered = useMemo(() => employees.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === "All" || e.department === deptFilter;
    const matchesRole = roleFilter === "All" || e.role === roleFilter;
    return matchesSearch && matchesDept && matchesRole;
  }), [employees, search, deptFilter, roleFilter]);

  const save = async (data: EmployeeFormValues) => {
    setSaving(true);
    if (editing) {
      const { error } = await supabase.rpc("update_employee", {
        p_id: data.id, p_name: data.name, p_email: data.email, p_mobile: data.mobile,
        p_department: data.department, p_role: data.role, p_designation: data.designation,
        p_salary: data.salary, p_joining_date: data.joiningDate || null, p_manager: data.manager,
        p_status: data.status,
      });
      setSaving(false);
      if (error) { alert(`Could not save: ${error.message}`); return; }
    } else {
      const { error } = await supabase.rpc("create_employee", {
        p_id: data.id, p_name: data.name, p_email: data.email, p_mobile: data.mobile,
        p_department: data.department, p_role: data.role, p_designation: data.designation,
        p_salary: data.salary, p_joining_date: data.joiningDate || null, p_manager: data.manager,
        p_status: data.status, p_password: data.password || "ChangeMe@123",
      });
      setSaving(false);
      if (error) { alert(`Could not add employee: ${error.message}`); return; }
    }
    setDialogOpen(false);
    setEditing(null);
    loadEmployees();
  };

  const savePassword = async (newPassword: string) => {
    if (!resetTarget) return;
    setSaving(true);
    const { error } = await supabase.rpc("reset_employee_password", {
      p_id: resetTarget.id, p_new_password: newPassword,
    });
    setSaving(false);
    if (error) { alert(`Could not reset password: ${error.message}`); return; }
    setResetTarget(null);
    alert(`Password updated for ${resetTarget.name}.`);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">Employees</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {loading ? "Loading…" : `${filtered.length} of ${employees.length} employees`}
          </p>
        </div>
        <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Employee</PrimaryButton>
      </div>

      {loadError && (
        <div className="rounded-xl bg-status-dangerBg px-4 py-3 text-sm text-status-danger">
          Couldn't load employees: {loadError}
        </div>
      )}

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
                      <button onClick={() => setViewing(e)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="View"><Eye className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { setEditing(e); setDialogOpen(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setResetTarget(e)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="Reset password"><KeyRound className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-10 text-center text-sm text-ink-faint">No employees match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EmployeeFormDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={save} initial={editing} saving={saving} />
      <ResetPasswordDialog open={!!resetTarget} onClose={() => setResetTarget(null)} onSave={savePassword} employeeName={resetTarget?.name || ""} saving={saving} />

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
