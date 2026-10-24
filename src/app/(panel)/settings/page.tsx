"use client";

import { Download, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton, Toggle } from "@/components/ui/button";
import { usePwa } from "@/context/pwa-context";
import { PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { Preferences, usePreferences } from "@/context/preferences-context";
import { FeatureKey, isFeatureEnabled } from "@/lib/features";

// Only sections whose feature is launched can be shown or hidden.
const DASHBOARD_SECTIONS = ([
  { key: "reports", label: "Recent reports" },
] satisfies { key: keyof Preferences["dashboard"] & FeatureKey; label: string }[]).filter((s) => isFeatureEnabled(s.key));

export default function SettingsPage() {
  const { isManager } = useSession();
  const { prefs, update } = usePreferences();
  const { canInstall, install, installed } = usePwa();

  return (
    <div className="max-w-2xl space-y-4 pt-2 md:space-y-6 md:pt-4">
      <PageHeader title="Settings" subtitle="Personalize how your panel looks on this device." />

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">App</h3>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink">{installed ? "Installed on this device" : "Install the panel as an app"}</p>
            <p className="text-xs text-ink-faint">{installed ? "You're using the installed app." : "Opens full screen from your home screen, like any other app."}</p>
          </div>
          {canInstall && <SecondaryButton onClick={install} className="shrink-0"><Download className="h-4 w-4" /> Install app</SecondaryButton>}
        </div>
      </Card>

      <Card className="hidden p-4 sm:p-5 lg:block">
        <h3 className="mb-3 text-sm font-semibold text-ink">Sidebar</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink">Compact sidebar</p>
            <p className="text-xs text-ink-faint">Show icons only, no labels (desktop).</p>
          </div>
          <Toggle checked={prefs.compactSidebar} onChange={(v) => update({ compactSidebar: v })} />
        </div>
      </Card>

      {!isManager && DASHBOARD_SECTIONS.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Dashboard sections</h3>
          <div className="space-y-3">
            {DASHBOARD_SECTIONS.map(({ key, label }) => (
              <div key={key} className="flex min-h-11 items-center justify-between">
                <p className="text-sm text-ink">{label}</p>
                <Toggle checked={prefs.dashboard[key]} onChange={(v) => update({ dashboard: { ...prefs.dashboard, [key]: v } })} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-sm text-ink">Role, department & module access</p>
          <p className="text-xs text-ink-faint">Managed by HR or Admin — not editable here. Change your password from your Profile.</p>
        </div>
        <Lock className="h-4 w-4 shrink-0 text-ink-faint" />
      </Card>
    </div>
  );
}
