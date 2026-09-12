"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/button";
import { employees } from "@/data/employees";
import { permissionsInitial, MODULES } from "@/data/permissions";
import { ModuleKey } from "@/types";
import { initials, cn } from "@/lib/utils";

export default function AdminPermissionsPage() {
  const [selectedId, setSelectedId] = useState(employees[0].id);
  const [permissions, setPermissions] = useState(permissionsInitial);
  const employee = employees.find((e) => e.id === selectedId);

  const toggle = (moduleKey: ModuleKey, value: boolean) => {
    setPermissions((p) => ({ ...p, [selectedId]: { ...p[selectedId], [moduleKey]: value } }));
  };

  return (
    <div className="space-y-5 pt-4">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">Permissions</h1>
        <p className="mt-0.5 text-sm text-ink-faint">Choose which modules an employee can access.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-2 lg:col-span-1">
          <ul className="max-h-[520px] space-y-0.5 overflow-y-auto">
            {employees.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setSelectedId(e.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm", selectedId === e.id ? "bg-ink text-white" : "text-ink hover:bg-surface")}
                >
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium", selectedId === e.id ? "bg-brand text-ink" : "bg-status-neutralBg text-ink-muted")}>
                    {initials(e.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className={cn("truncate text-xs", selectedId === e.id ? "text-white/70" : "text-ink-faint")}>{e.department} · {e.role}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          {employee && (
            <>
              <div className="mb-5 flex items-center gap-3 border-b border-surface-border pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-medium text-white">{initials(employee.name)}</div>
                <div>
                  <p className="text-sm font-semibold text-ink">{employee.name}</p>
                  <p className="text-xs text-ink-faint">{employee.department} · {employee.role}</p>
                </div>
              </div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Module Access</p>
              <div className="space-y-1">
                {MODULES.map((m) => (
                  <div key={m.key} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-surface">
                    <span className="text-sm text-ink">{m.label}</span>
                    <Toggle checked={permissions[selectedId]?.[m.key] || false} onChange={(v) => toggle(m.key, v)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
