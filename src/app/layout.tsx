import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FC Returns",
  description: "Validate CBN finance company returns, review KPIs and export XML.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            FC Returns
          </Link>
          <span className="muted small">Monthly return · validation · KPIs · XML</span>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
