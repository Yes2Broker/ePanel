"use client";

import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { Preferences, usePreferences } from "@/context/preferences-context";

const DASHBOARD_SECTIONS: { key: keyof Preferences["dashboard"]; label: string }[] = [
  { key: "tasks", label: "Upcoming tasks" },
  { key: "reports", label: "Recent reports" },
  { key: "leave", label: "Upcoming leave" },
];

export default function SettingsPage() {
  const { isManager } = useSession();
  const { prefs, update } = usePreferences();

  return (
    <div className="max-w-2xl space-y-6 pt-4">
      <PageHeader title="Settings" subtitle="Personalize how your panel looks on this device." />

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Sidebar</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink">Compact sidebar</p>
            <p className="text-xs text-ink-faint">Show icons only, no labels (desktop).</p>
          </div>
          <Toggle checked={prefs.compactSidebar} onChange={(v) => update({ compactSidebar: v })} />
        </div>
      </Card>

      {!isManager && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Dashboard sections</h3>
          <div className="space-y-3">
            {DASHBOARD_SECTIONS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <p className="text-sm text-ink">{label}</p>
                <Toggle checked={prefs.dashboard[key]} onChange={(v) => update({ dashboard: { ...prefs.dashboard, [key]: v } })} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-ink">Role, department & module access</p>
          <p className="text-xs text-ink-faint">Managed by HR or Admin — not editable here. Change your password from your Profile.</p>
        </div>
        <Lock className="h-4 w-4 shrink-0 text-ink-faint" />
      </Card>
    </div>
  );
}
