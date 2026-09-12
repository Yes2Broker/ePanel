"use client";

import { useState } from "react";
import { Sun, Moon, Monitor, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Appearance = "Light" | "Dark" | "System";

export default function SettingsPage() {
  const [appearance, setAppearance] = useState<Appearance>("Light");
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [sections, setSections] = useState({ "Today's Tasks": true, "Recent Reports": true, "Recent Activity": true });
  const [notifications, setNotifications] = useState({ taskReminders: true, reportReminders: true, announcements: true });

  const AppearanceOption = ({ value, icon: Icon, label }: { value: Appearance; icon: any; label: string }) => (
    <button
      onClick={() => setAppearance(value)}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-xl border px-4 py-3 text-sm",
        appearance === value ? "border-brand-dark bg-brand-soft text-ink" : "border-surface-border text-ink-muted hover:bg-surface"
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="max-w-2xl space-y-6 pt-4">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-faint">Personalize how your panel looks and behaves.</p>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Appearance</h3>
        <div className="flex gap-3">
          <AppearanceOption value="Light" icon={Sun} label="Light" />
          <AppearanceOption value="Dark" icon={Moon} label="Dark" />
          <AppearanceOption value="System" icon={Monitor} label="System" />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Sidebar</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink">Compact sidebar</p>
            <p className="text-xs text-ink-faint">Show icons only, no labels.</p>
          </div>
          <Toggle checked={compactSidebar} onChange={setCompactSidebar} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Dashboard sections</h3>
        <div className="space-y-3">
          {Object.entries(sections).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <p className="text-sm text-ink">{label}</p>
              <Toggle checked={value} onChange={(v) => setSections((s) => ({ ...s, [label]: v }))} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Notifications</h3>
        <div className="space-y-3">
          {([["taskReminders", "Task reminders"], ["reportReminders", "Report reminders"], ["announcements", "Company announcements"]] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <p className="text-sm text-ink">{label}</p>
              <Toggle checked={notifications[key]} onChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-ink">Password, role, department & permissions</p>
          <p className="text-xs text-ink-faint">Managed by HR or Admin — not editable here.</p>
        </div>
        <Lock className="h-4 w-4 text-ink-faint" />
      </Card>
    </div>
  );
}
