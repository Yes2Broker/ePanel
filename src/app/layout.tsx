import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/session-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Yes2Broker | Employee Panel",
  description: "Yes2Broker central employee panel",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#273992",
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
