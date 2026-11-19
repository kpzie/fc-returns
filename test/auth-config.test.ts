import { describe, it, expect } from "vitest";
import { resolveAuthConfig } from "@/lib/auth/config";

const supa = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

describe("resolveAuthConfig", () => {
  it("uses Supabase when all three settings are present", () => {
    expect(resolveAuthConfig({ ...supa, NODE_ENV: "production" })).toEqual({
      mode: "supabase",
      url: supa.SUPABASE_URL,
      anonKey: "anon",
      serviceRoleKey: "service",
    });
  });

  it("falls back to the local dev user only outside production when nothing is set", () => {
    expect(resolveAuthConfig({ NODE_ENV: "development" })).toEqual({ mode: "dev" });
    expect(resolveAuthConfig({ NODE_ENV: "test" })).toEqual({ mode: "dev" });
  });

  it("refuses to run production without Supabase", () => {
    expect(() => resolveAuthConfig({ NODE_ENV: "production" })).toThrow(/SUPABASE_URL/);
    expect(() => resolveAuthConfig({ NODE_ENV: "production", ALLOW_FILE_STORE: "1" })).toThrow(/SUPABASE_URL/);
  });

  it("refuses a half-configured Supabase rather than silently dropping login", () => {
    expect(() => resolveAuthConfig({ NODE_ENV: "development", SUPABASE_URL: supa.SUPABASE_URL })).toThrow(/SUPABASE_ANON_KEY/);
    expect(() => resolveAuthConfig({ NODE_ENV: "development", SUPABASE_URL: "u", SUPABASE_ANON_KEY: "a" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});
