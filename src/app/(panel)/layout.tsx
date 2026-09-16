"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useRequireSession } from "@/context/session-context";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-muted">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar role={user.role} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
