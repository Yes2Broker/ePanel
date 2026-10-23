"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Eye, Pencil, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { ErrorBanner, PageHeader, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { EmployeeFormDialog, EmployeeFormValues } from "@/components/employees/employee-form-dialog";
import { ResetPasswordDialog } from "@/components/employees/reset-password-dialog";
import { useSession } from "@/context/session-context";
import { DEPARTMENTS, ROLES } from "@/lib/constants";
import { Employee } from "@/types";
import { formatINR, formatDate } from "@/lib/utils";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export default function AdminEmployeesPage() {
  const { user } = useSession();
  const toast = useToast();
  const { data, loading, error: loadError, reload } = useApi(() => api.listEmployees());
  const employees = data ?? [];
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "Admin";

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);

  const filtered = useMemo(() => employees.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    const matchesDept = deptFilter === "All" || e.department === deptFilter;
    const matchesRole = roleFilter === "All" || e.role === roleFilter;
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;
    return matchesSearch && matchesDept && matchesRole && matchesStatus;
  }), [employees, search, deptFilter, roleFilter, statusFilter]);

  // HR can manage everyone except Admin accounts (the database enforces this too).
  const canManage = (e: Employee) => isAdmin || e.role !== "Admin";

  const save = async ({ password, ...data }: EmployeeFormValues) => {
    setSaving(true);
    try {
      if (editing) {
        await api.updateEmployee(editing.id, data);
        toast(`Saved changes for ${data.name}.`);
      } else {
        await api.createEmployee(data, password || "");
        toast(`${data.name} added. Share their password with them directly.`);
      }
      setDialogOpen(false);
      setEditing(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (newPassword: string) => {
    if (!resetTarget) return;
    setSaving(true);
    try {
      await api.resetPassword(resetTarget.id, newPassword);
      toast(`Password updated for ${resetTarget.name}.`);
      setResetTarget(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pt-4">
      <PageHeader
        title="Employees"
        subtitle={loading && !data ? "Loading…" : `${filtered.length} of ${employees.length} employees`}
        actions={<PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Employee</PrimaryButton>}
      />

      <ErrorBanner message={loadError && `Couldn't load employees: ${loadError}`} onRetry={reload} />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or ID…" className="w-60 rounded-pill border border-surface-border bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls}>
          <option value="All">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectCls}>
          <option value="All">All roles</option>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="All">All statuses</option>
        </select>
      </div>

      <Card className="overflow-hidden p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={tableHeadCls}>
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
                      <Avatar name={e.name} />
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-ink-faint">{e.id} · {e.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.department}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.role}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.designation}</td>
                  <td className="px-2 py-2.5"><StatusPill status={e.status} /></td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewing(e)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="View" aria-label={`View ${e.name}`}><Eye className="h-3.5 w-3.5" /></button>
                      {canManage(e) && (
                        <>
                          <button onClick={() => { setEditing(e); setDialogOpen(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="Edit" aria-label={`Edit ${e.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setResetTarget(e)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="Reset password" aria-label={`Reset password for ${e.name}`}><KeyRound className="h-3.5 w-3.5" /></button>
                        </>
                      )}
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

      <EmployeeFormDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={save} initial={editing} saving={saving} canAssignAdmin={isAdmin} />
      <ResetPasswordDialog open={!!resetTarget} onClose={() => setResetTarget(null)} onSave={savePassword} employeeName={resetTarget?.name || ""} saving={saving} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Employee Details" wide>
        {viewing && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[["Full Name", viewing.name], ["Employee ID", viewing.id], ["Email", viewing.email], ["Mobile", viewing.mobile],
              ["Department", viewing.department], ["Role", viewing.role], ["Designation", viewing.designation],
              ["Salary", formatINR(viewing.salary)], ["Date of Joining", viewing.joiningDate ? formatDate(viewing.joiningDate) : ""],
              ["Reporting Manager", viewing.manager], ["Status", viewing.status]].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-ink-faint">{label}</p>
                <p className="mt-0.5 font-medium text-ink">{value || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
