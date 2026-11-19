/** Pure: decides from environment variables whether we run with Supabase Auth or the local dev user. */
export type AuthConfig =
  | { mode: "supabase"; url: string; anonKey: string; serviceRoleKey: string }
  /** No login; a single local user with both roles. Never allowed in production. */
  | { mode: "dev" };

const KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function resolveAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const missing = KEYS.filter((k) => !env[k]);
  if (missing.length === 0) {
    return { mode: "supabase", url: env.SUPABASE_URL!, anonKey: env.SUPABASE_ANON_KEY!, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY! };
  }
  if (missing.length < KEYS.length) throw new Error(`Supabase is partly configured: set ${missing.join(", ")}.`);
  if (env.NODE_ENV === "production") throw new Error(`${KEYS.join(", ")} must be set in production.`);
  return { mode: "dev" };
}
