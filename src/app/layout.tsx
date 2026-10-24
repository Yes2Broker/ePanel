import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/session-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { ToastProvider } from "@/components/ui/toast";
import { PwaProvider } from "@/context/pwa-context";

export const metadata: Metadata = {
  title: "Yes2Broker | Employee Panel",
  // Private panel: no description, and nothing for search engines to index or quote.
  robots: { index: false, follow: false, noarchive: true, nosnippet: true, googleBot: { index: false, follow: false, noarchive: true, nosnippet: true } },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/manifest.webmanifest",
  applicationName: "Yes2Broker Panel",
  appleWebApp: { capable: true, title: "Y2B Panel", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#273992",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use the iPhone notch / home bar safe areas
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <PreferencesProvider>
            <ToastProvider><PwaProvider>{children}</PwaProvider></ToastProvider>
          </PreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
