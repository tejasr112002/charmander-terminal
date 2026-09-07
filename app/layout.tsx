import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { TopNav } from "@/components/trade/TopNav";
import { FeedProvider } from "@/components/trade/FeedProvider";
import { Toasts } from "@/components/trade/Toasts";
import { StatusPill } from "@/components/trade/StatusPill";
import { Dialogs } from "@/components/dialogs/Dialogs";

export const metadata: Metadata = {
  title: "MockTerminal",
  description: "Mock crypto trading terminal for QA testing",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FeedProvider>
          <TopNav />
          {children}
          <Toasts />
          <StatusPill />
          <Dialogs />
        </FeedProvider>
      </body>
    </html>
  );
}
