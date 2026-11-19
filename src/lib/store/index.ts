import "server-only";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { authConfig, userClient } from "../auth/session";
import { FileStore } from "./file-store";
import { SupabaseStore } from "./supabase-store";
import type { ReturnStore } from "./types";

let fileStore: FileStore | undefined;

/**
 * Supabase in production: reads and submissions run as the signed-in user (RLS applies); only the insert
 * of a validated upload uses the service-role key. Without Supabase (dev only) a local folder, .data/.
 */
export async function getStore(): Promise<ReturnStore> {
  const cfg = authConfig();
  if (cfg.mode === "dev") return (fileStore ??= new FileStore(path.join(process.cwd(), ".data", "returns")));
  const service = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return new SupabaseStore(await userClient(), service);
}
