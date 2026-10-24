"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Eye, Pencil, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { ErrorBanner, Loading, PageHeader, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { EmployeeFormDialog, EmployeeFormValues } from "@/components/employees/employee-form-dialog";
import { ResetPasswordDialog } from "@/components/employees/reset-password-dialog";
import { useSession } from "@/context/session-context";
import { DEPARTMENTS, ROLES, weekOffLabel } from "@/lib/constants";
import { Employee } from "@/types";
import { formatINR, formatDate, cn } from "@/lib/utils";
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
    <div className="space-y-4 pt-2 md:space-y-5 md:pt-4">
      <PageHeader
        title="Employees"
        subtitle={loading && !data ? "Loading…" : `${filtered.length} of ${employees.length} employees`}
        actions={<PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Employee</PrimaryButton>}
      />

      <ErrorBanner message={loadError && `Couldn't load employees: ${loadError}`} onRetry={reload} />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
        <div className="relative col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or ID…" aria-label="Search employees"
            className="min-h-11 w-full rounded-pill border border-surface-border bg-white py-2 pl-8 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-brand sm:min-h-10 sm:w-60 sm:text-sm" />
        </div>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={cn(selectCls, "col-span-2 sm:col-auto")} aria-label="Department">
          <option value="All">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectCls} aria-label="Role">
          <option value="All">All roles</option>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label="Status">
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="All">All statuses</option>
        </select>
      </div>

      {/* Phones and tablets: one card per person, actions as big buttons. */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
        {loading && !data && <li><Card className="px-4"><Loading /></Card></li>}
        {filtered.map((e) => (
          <li key={e.id}>
            <Card className="h-full p-3">
              <button onClick={() => setViewing(e)} className="flex w-full items-center gap-3 text-left" aria-label={`View ${e.name}`}>
                <Avatar name={e.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.name}</p>
                  <p className="truncate text-xs text-ink-faint">{e.id} · {e.department} · {e.role}</p>
                </div>
                <StatusPill status={e.status} />
              </button>
              {canManage(e) && (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-surface-border pt-2">
                  <button onClick={() => { setEditing(e); setDialogOpen(true); }} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-medium text-ink" aria-label={`Edit ${e.name}`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button onClick={() => setResetTarget(e)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-medium text-ink" aria-label={`Reset password for ${e.name}`}>
                    <KeyRound className="h-4 w-4" /> Password
                  </button>
                </div>
              )}
            </Card>
          </li>
        ))}
        {!loading && filtered.length === 0 && <li className="py-10 text-center text-sm text-ink-faint">No employees match your filters.</li>}
      </ul>

      <Card className="hidden overflow-hidden p-5 lg:block">
        {loading && !data && <Loading />}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={tableHeadCls}>
                <th className="px-2 py-2.5">Employee</th>
                <th className="px-2 py-2.5">Department</th>
                <th className="px-2 py-2.5">Role</th>
                <th className="hidden px-2 py-2.5 xl:table-cell">Designation</th>
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
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="max-w-[16rem] truncate text-xs text-ink-faint" title={e.email || undefined}>{e.id}{e.email && ` · ${e.email}`}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.department}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{e.role}</td>
                  <td className="hidden px-2 py-2.5 text-ink-muted xl:table-cell">{e.designation}</td>
                  <td className="px-2 py-2.5"><StatusPill status={e.status} /></td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewing(e)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-white hover:text-ink-muted" title="View" aria-label={`View ${e.name}`}><Eye className="h-3.5 w-3.5" /></button>
                      {canManage(e) && (
                        <>
                          <button onClick={() => { setEditing(e); setDialogOpen(true); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-white hover:text-ink-muted" title="Edit" aria-label={`Edit ${e.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setResetTarget(e)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-white hover:text-ink-muted" title="Reset password" aria-label={`Reset password for ${e.name}`}><KeyRound className="h-3.5 w-3.5" /></button>
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
              ["Reporting Manager", viewing.manager], ["Weekly Off", weekOffLabel(viewing.weekOff)], ["Status", viewing.status]].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-ink-faint">{label}</p>
                <p className="mt-0.5 break-words font-medium text-ink">{value || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
