"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useRequireSession } from "@/context/session-context";
import { Loading } from "@/components/ui/page";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isManager } = useRequireSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // The /admin area is for HR and Admin only. The database enforces this
  // too; this just keeps employees from landing on an empty page.
  const blocked = !!user && !isManager && pathname.startsWith("/admin");
  useEffect(() => {
    if (blocked) router.replace("/dashboard");
  }, [blocked, router]);

  if (loading || !user || blocked) {
    return <div className="flex min-h-screen items-center justify-center bg-surface"><Loading /></div>;
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
