import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getActor } from "@/lib/auth/session";
import { signOut } from "./login/actions";

/** Every page depends on who is signed in. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FC Returns",
  description: "Validate CBN finance company returns, review KPIs and export XML.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getActor();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            FC Returns
          </Link>
          <span className="muted small">Monthly return · validation · KPIs · XML</span>
          {actor && (
            <span className="whoami small">
              <span>
                {actor.email}
                <span className="muted"> · {actor.roles.length ? actor.roles.join(", ") : "no role"}</span>
              </span>
              <form action={signOut}>
                <button className="btn" type="submit">
                  Sign out
                </button>
              </form>
            </span>
          )}
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
