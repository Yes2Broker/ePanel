"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { DatePicker, Select } from "@/components/ui/pickers";
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
          <Field label="Employee ID"><input required disabled={!!initial} autoCapitalize="characters" value={form.id} onChange={(e) => set("id", e.target.value)} className={inputCls} /></Field>
          <Field label="Email (optional)"><input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} /></Field>
          <Field label="Mobile Number"><input type="tel" inputMode="tel" autoComplete="off" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} className={inputCls} /></Field>
          <Field label="Salary"><input type="number" inputMode="numeric" min={0} value={form.salary} onChange={(e) => set("salary", e.target.value)} className={inputCls} /></Field>
          <Field label="Date of Joining"><DatePicker variant="field" ariaLabel="Date of Joining" value={form.joiningDate} onChange={(v) => set("joiningDate", v)} /></Field>
          <Field label="Department">
            <Select variant="field" ariaLabel="Department" value={form.department} onChange={(v) => set("department", v as Department)}
              options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Designation"><input value={form.designation} onChange={(e) => set("designation", e.target.value)} className={inputCls} /></Field>
          <Field label="Role">
            <Select variant="field" ariaLabel="Role" value={form.role} onChange={(v) => set("role", v as Role)}
              options={ROLES.filter((r) => canAssignAdmin || r !== "Admin").map((r) => ({ value: r, label: r }))} />
          </Field>
          <Field label="Reporting Manager"><input value={form.manager} onChange={(e) => set("manager", e.target.value)} className={inputCls} /></Field>
          <Field label="Weekly Off">
            <Select variant="field" ariaLabel="Weekly Off" value={form.weekOff == null ? "" : String(form.weekOff)} onChange={(v) => set("weekOff", v ? Number(v) : null)}
              options={[...WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d })), { value: "", label: "No weekly off" }]} />
          </Field>
          <Field label="Employment Status">
            <Select variant="field" ariaLabel="Employment Status" value={form.status} onChange={(v) => set("status", v as EmploymentStatus)}
              options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
          </Field>
          {!initial && (
            <Field label="Initial Password">
              <input required minLength={8} type="text" autoCapitalize="none" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" className={inputCls} />
            </Field>
          )}
        </div>
        {!initial && (
          <p className="text-xs text-ink-faint">Share this password with the employee directly. They can change it later from their Profile.</p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
          <SecondaryButton type="button" onClick={onClose} className="justify-center">Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving} className="justify-center">
            {saving ? "Saving…" : initial ? "Save changes" : "Add employee"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
