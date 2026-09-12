"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Employee, Department, Role, EmploymentStatus } from "@/types";
import { DEPARTMENTS, ROLES } from "@/data/employees";

type FormState = Omit<Employee, "salary"> & { salary: string };

const EMPTY: FormState = {
  id: "", name: "", email: "", mobile: "", salary: "", joiningDate: "",
  department: "Sales", designation: "", role: "Employee", manager: "", status: "Active",
};

export function EmployeeFormDialog({
  open, onClose, onSave, initial,
}: { open: boolean; onClose: () => void; onSave: (data: Omit<Employee, never>) => void; initial: Employee | null }) {
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    setForm(initial ? { ...initial, salary: String(initial.salary) } : EMPTY);
  }, [initial, open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Employee" : "Add Employee"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...form, salary: Number(form.salary) });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full Name"><input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
          <Field label="Employee ID"><input required disabled={!!initial} value={form.id} onChange={(e) => set("id", e.target.value)} className={inputCls} /></Field>
          <Field label="Email"><input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} /></Field>
          <Field label="Mobile Number"><input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} className={inputCls} /></Field>
          <Field label="Salary"><input type="number" value={form.salary} onChange={(e) => set("salary", e.target.value)} className={inputCls} /></Field>
          <Field label="Date of Joining"><input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} className={inputCls} /></Field>
          <Field label="Department">
            <select value={form.department} onChange={(e) => set("department", e.target.value as Department)} className={inputCls}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Designation"><input value={form.designation} onChange={(e) => set("designation", e.target.value)} className={inputCls} /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => set("role", e.target.value as Role)} className={inputCls}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Reporting Manager"><input value={form.manager} onChange={(e) => set("manager", e.target.value)} className={inputCls} /></Field>
          <Field label="Employment Status">
            <select value={form.status} onChange={(e) => set("status", e.target.value as EmploymentStatus)} className={inputCls}>
              <option>Active</option><option>Inactive</option>
            </select>
          </Field>
          <Field label="Profile Photo"><input type="file" className="w-full text-sm text-ink-muted" /></Field>
        </div>
        {!initial && (
          <div className="rounded-xl bg-surface p-3 text-xs text-ink-faint">
            A temporary password will be generated here once real authentication is connected.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit">{initial ? "Save changes" : "Add employee"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
