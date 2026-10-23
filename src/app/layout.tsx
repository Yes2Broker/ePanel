import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/session-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Yes2Broker | Employee Panel",
  description: "Yes2Broker central employee panel",
  icons: {
    icon: "/assets/fav.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <PreferencesProvider>
            <ToastProvider>{children}</ToastProvider>
          </PreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
