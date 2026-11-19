import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthConfig } from "./config";
import { parseRoles, type Actor } from "./roles";

export const authConfig = () => resolveAuthConfig(process.env);

/** Used only when Supabase is not configured and NODE_ENV is not production (see resolveAuthConfig). */
export const DEV_ACTOR: Actor = { id: "00000000-0000-0000-0000-000000000000", email: "dev@localhost", roles: ["uploader", "approver"] };

/** Supabase client acting as the signed-in user (anon key + their session cookie), so RLS applies. */
export async function userClient(): Promise<SupabaseClient> {
  const cfg = authConfig();
  if (cfg.mode !== "supabase") throw new Error("Supabase is not configured.");
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware refreshes the session.
        }
      },
    },
  });
}

/** The signed-in user and their roles, or null. Cached for the duration of one request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  if (authConfig().mode === "dev") return DEV_ACTOR;
  const db = await userClient();
  const { data } = await db.auth.getUser(); // verified with Supabase, not just decoded from the cookie
  if (!data.user) return null;
  const { data: rows, error } = await db.from("fc_user_roles").select("role").eq("user_id", data.user.id);
  if (error) throw new Error(`Could not load roles: ${error.message}`);
  return { id: data.user.id, email: data.user.email ?? "", roles: parseRoles((rows ?? []).map((r) => r.role)) };
});
