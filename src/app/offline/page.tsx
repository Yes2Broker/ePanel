import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo";
import { RetryButton } from "./retry";

export const metadata: Metadata = { title: "Offline | Yes2Broker" };

/** Shown by the service worker when a page is opened without internet. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <LogoIcon size={56} />
      <div className="mt-8 rounded-full bg-white p-4 shadow-card">
        <WifiOff className="h-7 w-7 text-brand" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-ink">You&apos;re offline</h1>
      <p className="mt-1.5 max-w-xs text-sm text-ink-muted">Please reconnect to the internet to use the Yes2Broker panel.</p>
      <RetryButton />
    </main>
  );
}
