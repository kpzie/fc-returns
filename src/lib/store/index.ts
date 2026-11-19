import "server-only";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FileStore } from "./file-store";
import { SupabaseStore } from "./supabase-store";
import type { ReturnStore } from "./types";

let store: ReturnStore | undefined;

/**
 * Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise a
 * local folder (.data/) for development. Production must use Supabase.
 */
export function getStore(): ReturnStore {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_FILE_STORE !== "1") {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production.");
    }
    store = new FileStore(path.join(process.cwd(), ".data", "returns"));
  }
  return store;
}
