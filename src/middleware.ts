import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveAuthConfig } from "@/lib/auth/config";

/**
 * Keeps the Supabase session cookie fresh and sends signed-out visitors to /login.
 * This is a convenience layer only: every page and API route checks the role itself, and RLS checks it again.
 */
export async function middleware(req: NextRequest) {
  const cfg = resolveAuthConfig(process.env);
  if (cfg.mode === "dev") return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const db = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await db.auth.getUser();

  const path = req.nextUrl.pathname;
  if (!data.user && path !== "/login") {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
