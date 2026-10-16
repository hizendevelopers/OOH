import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "IBVS · Iraq field operations",
  description: "Billboard inventory and accountable field verification",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "IBVS Field",
    statusBarStyle: "default",
  },
  icons: { apple: "/field-192.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
