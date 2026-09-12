import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/session-context";

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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
