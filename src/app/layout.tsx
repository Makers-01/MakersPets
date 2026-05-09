import type { Metadata } from "next";
import { env } from "@/lib/env";
import { ensureReminderScheduler } from "@/lib/reminder-scheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: env.NEXT_PUBLIC_APP_NAME,
  description: "Independent AI pet control plane for MakersPet."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureReminderScheduler();

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
