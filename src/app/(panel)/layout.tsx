"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useRequireSession } from "@/context/session-context";
import { Loading, Skeleton } from "@/components/ui/page";
import { ComingSoonPage } from "@/components/feature/coming-soon";
import { featureForPath, isFeatureEnabled } from "@/lib/features";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isManager } = useRequireSession();
  const pathname = usePathname();
  const router = useRouter();

  // Backstop for src/middleware.ts: never render a switched-off feature's page.
  const feature = featureForPath(pathname);
  const lockedFeature = feature && !isFeatureEnabled(feature) ? feature : null;

  // The /admin area is for HR and Admin only. The database enforces this
  // too; this just keeps employees from landing on an empty page.
  // A switched-off feature shows "Coming soon" to everyone instead.
  const blocked = !!user && !isManager && pathname.startsWith("/admin") && !lockedFeature;
  // The installed app opens at /dashboard; HR and Admin's dashboard is /admin.
  const toAdmin = !!user && isManager && pathname === "/dashboard";
  useEffect(() => {
    if (blocked) router.replace("/dashboard");
    else if (toAdmin) router.replace("/admin");
  }, [blocked, toAdmin, router]);

  if (loading || !user || blocked || toAdmin) {
    return (
      <div className="min-h-screen bg-surface px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pl-[108px] lg:pl-[312px]">
        <Skeleton className="mb-6 h-9 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}
        </div>
        <Loading className="mt-4" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main className="min-w-0 flex-1 px-4 pb-[calc(var(--nav-h)+1.5rem)] md:pb-8 lg:px-8">
          {lockedFeature ? <ComingSoonPage feature={lockedFeature} /> : children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
