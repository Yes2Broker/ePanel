"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { DatePicker, Select } from "@/components/ui/pickers";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Asset, Employee, Department, Role, EmploymentStatus } from "@/types";
import { DEPARTMENTS, ROLES, WEEKDAYS } from "@/lib/constants";
import { api } from "@/lib/api";
import { SuggestInput } from "@/components/employees/suggest-input";
import { cn } from "@/lib/utils";

export interface EmployeeFormValues {
  id: string; name: string; email: string; mobile: string; salary: number | "";
  joiningDate: string; department: Department; designation: string; role: Role;
  manager: string; status: EmploymentStatus; weekOff: number | null; password?: string;
  /** The idle company SIM / email picked in Mobile / Email: assigned in the same save (SIMs & Emails). */
  simId?: string; emailId?: string;
}

type FormState = Omit<EmployeeFormValues, "salary"> & { salary: string };

const EMPTY: FormState = {
  id: "", name: "", email: "", mobile: "", salary: "", joiningDate: "",
  department: "Sales", designation: "", role: "Employee", manager: "", status: "Active", weekOff: 7, password: "", simId: "", emailId: "",
};

export function EmployeeFormDialog({
  open, onClose, onSave, initial, saving, canAssignAdmin,
}: { open: boolean; onClose: () => void; onSave: (data: EmployeeFormValues) => void; initial: Employee | null; saving?: boolean; canAssignAdmin: boolean }) {
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    setForm(initial ? { ...initial, salary: initial.salary ? String(initial.salary) : "", password: "" } : EMPTY);
    // New employee: suggest the next ID from the database (highest EMP number ever used + 1).
    if (!initial && open) api.nextEmployeeId().then((id) => setForm((f) => (f.id ? f : { ...f, id }))).catch(() => {});
    // Company SIMs / emails to suggest: every Idle one; on edit, someone who already has one
    // only sees theirs (one company SIM and one company email per person).
    const pickable = (list: Asset[]) => {
      const theirs = initial ? list.filter((x) => x.employee?.id === initial.id) : [];
      return theirs.length ? theirs : list.filter((x) => x.status === "Idle");
    };
    if (open) api.assetsList().then((a) => setIdle({ sims: pickable(a.sims), emails: pickable(a.emails) })).catch(() => setIdle(null));
  }, [initial, open]);
  const [idle, setIdle] = useState<{ sims: Asset[]; emails: Asset[] } | null>(null);
  // The listed item the field now holds (typed values that aren't listed are just text).
  const digits = form.mobile.replace(/\D/g, "");
  const pickedSim = digits.length >= 10 ? idle?.sims.find((x) => x.label === digits.slice(-10)) : undefined;
  const pickedEmail = idle?.emails.find((x) => x.label === form.email.trim().toLowerCase());
  const idValid = /^EMP\d{3,}$/.test(form.id.trim().toUpperCase());

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Employee" : "Add Employee"} wide>
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (!initial && !idValid) return;
          onSave({ ...form, id: form.id.trim().toUpperCase(), salary: form.salary.trim() === "" ? "" : Number(form.salary), simId: pickedSim?.id ?? "", emailId: pickedEmail?.id ?? "" });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name"><input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
          <Field label="Employee ID">
            <input required disabled={!!initial} autoCapitalize="characters" value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="EMP022" className={inputCls} aria-invalid={!initial && !!form.id && !idValid} />
            {!initial && (form.id && !idValid
              ? <span className="mt-1 block text-xs text-status-danger">Use the format EMP followed by the number, e.g. EMP022.</span>
              : <span className="mt-1 block text-xs text-ink-muted">Use the same number in the eTimeOffice machine ({form.id.trim().toUpperCase() || "EMP022"} = {(form.id.match(/\d+/)?.[0] ?? "022").padStart(4, "0")}).</span>)}
          </Field>
          <Field label="Email (optional)">
            <SuggestInput label="Email" type="email" inputMode="email" value={form.email} onChange={(v) => set("email", v)} placeholder="Pick a company email or type any"
              suggestions={(idle?.emails ?? []).map((x) => ({ value: x.label, note: `${x.type} · ${x.status === "Idle" ? "Idle" : "Theirs"}` }))} empty="No idle emails. Add them in SIMs & Emails." />
            <AssetHint kind="emails" list={idle?.emails} picked={!!pickedEmail} />
          </Field>
          <Field label="Mobile Number">
            <SuggestInput label="Mobile Number" type="tel" inputMode="tel" value={form.mobile} onChange={(v) => set("mobile", v)} placeholder="Pick a company SIM or type a personal number"
              suggestions={(idle?.sims ?? []).map((x) => ({ value: x.label, note: `${x.type} · ${x.status === "Idle" ? "Idle" : "Theirs"}` }))} empty="No idle SIMs. Add them in SIMs & Emails." />
            <AssetHint kind="SIMs" list={idle?.sims} picked={!!pickedSim} />
          </Field>
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

/** Under Mobile / Email: what picking from the list does, or that there's nothing idle. */
function AssetHint({ kind, list, picked }: { kind: "SIMs" | "emails"; list: Asset[] | undefined; picked: boolean }) {
  if (!list) return null;
  if (!list.length) return <span className="mt-1 block text-xs text-ink-faint">No idle {kind}. Add them in SIMs &amp; Emails.</span>;
  return (
    <span className={cn("mt-1 block text-xs", picked ? "text-status-success" : "text-ink-faint")}>
      {picked ? `Company ${kind === "SIMs" ? "SIM" : "email"}: assigned to this employee when you save.` : `${list.length} company ${list.length === 1 ? kind.replace(/s$/, "") : kind} to pick, or type any.`}
    </span>
  );
}
