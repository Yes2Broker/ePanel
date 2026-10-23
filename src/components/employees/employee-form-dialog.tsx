"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Employee, Department, Role, EmploymentStatus } from "@/types";
import { DEPARTMENTS, ROLES, WEEKDAYS } from "@/lib/constants";

export interface EmployeeFormValues {
  id: string; name: string; email: string; mobile: string; salary: number | "";
  joiningDate: string; department: Department; designation: string; role: Role;
  manager: string; status: EmploymentStatus; weekOff: number | null; password?: string;
}

type FormState = Omit<EmployeeFormValues, "salary"> & { salary: string };

const EMPTY: FormState = {
  id: "", name: "", email: "", mobile: "", salary: "", joiningDate: "",
  department: "Sales", designation: "", role: "Employee", manager: "", status: "Active", weekOff: 7, password: "",
};

export function EmployeeFormDialog({
  open, onClose, onSave, initial, saving, canAssignAdmin,
}: { open: boolean; onClose: () => void; onSave: (data: EmployeeFormValues) => void; initial: Employee | null; saving?: boolean; canAssignAdmin: boolean }) {
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    setForm(initial ? { ...initial, salary: initial.salary ? String(initial.salary) : "", password: "" } : EMPTY);
  }, [initial, open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Employee" : "Add Employee"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...form, salary: form.salary.trim() === "" ? "" : Number(form.salary) });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name"><input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
          <Field label="Employee ID"><input required disabled={!!initial} value={form.id} onChange={(e) => set("id", e.target.value)} className={inputCls} /></Field>
          <Field label="Email (optional)"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} /></Field>
          <Field label="Mobile Number"><input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} className={inputCls} /></Field>
          <Field label="Salary"><input type="number" min={0} value={form.salary} onChange={(e) => set("salary", e.target.value)} className={inputCls} /></Field>
          <Field label="Date of Joining"><input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} className={inputCls} /></Field>
          <Field label="Department">
            <select value={form.department} onChange={(e) => set("department", e.target.value as Department)} className={inputCls}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Designation"><input value={form.designation} onChange={(e) => set("designation", e.target.value)} className={inputCls} /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => set("role", e.target.value as Role)} className={inputCls}>
              {ROLES.filter((r) => canAssignAdmin || r !== "Admin").map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Reporting Manager"><input value={form.manager} onChange={(e) => set("manager", e.target.value)} className={inputCls} /></Field>
          <Field label="Weekly Off">
            <select value={form.weekOff ?? ""} onChange={(e) => set("weekOff", e.target.value ? Number(e.target.value) : null)} className={inputCls}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              <option value="">No weekly off</option>
            </select>
          </Field>
          <Field label="Employment Status">
            <select value={form.status} onChange={(e) => set("status", e.target.value as EmploymentStatus)} className={inputCls}>
              <option>Active</option><option>Inactive</option>
            </select>
          </Field>
          {!initial && (
            <Field label="Initial Password">
              <input required minLength={8} type="text" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" className={inputCls} />
            </Field>
          )}
        </div>
        {!initial && (
          <p className="text-xs text-ink-faint">Share this password with the employee directly. They can change it later from their Profile.</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add employee"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
