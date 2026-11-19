import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DuplicateUploadError, ingestWorkbook, submitReturn } from "@/lib/returns/ingest";
import { SupabaseStore } from "@/lib/store/supabase-store";
import type { Actor, Role } from "@/lib/auth/roles";
import type { ReturnRecord } from "@/lib/store/types";
import { fixtureCopy } from "./helpers/fixture-copy";

/**
 * End-to-end against a real Supabase project: Auth sign-in, RLS, Storage, fc_submit_return.
 * Skipped unless SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY are set.
 *
 * Use a DEDICATED TEST PROJECT, never production: each run leaves one submitted return behind
 * (submitted returns are locked by design) under a run-specific FC code starting with 9, and three test
 * users (fc-it-*@example.test). Apply every file in supabase/migrations/ to the project first.
 */
const env = {
  url: process.env.SUPABASE_TEST_URL,
  anon: process.env.SUPABASE_TEST_ANON_KEY,
  service: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
};
const configured = !!(env.url && env.anon && env.service);

const T = 30_000;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type TestUser = { actor: Actor; db: SupabaseClient; store: SupabaseStore };

describe.skipIf(!configured)("SupabaseStore against a live project", () => {
  const fcCode = `9${randomInt(100_000, 999_999)}`; // keeps this run's rows apart from earlier runs
  let service: SupabaseClient;
  let uploader: TestUser, approver: TestUser, noRole: TestUser;
  let clean: ReturnRecord, broken: ReturnRecord;

  /** Find-or-create a confirmed user with a fresh password and exactly `roles`, then sign in as them. */
  async function signedIn(name: string, roles: Role[]): Promise<TestUser> {
    const email = `fc-it-${name}@example.test`;
    const password = randomBytes(24).toString("base64url");
    const { data: list, error: listErr } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;
    let id = list.users.find((u) => u.email === email)?.id;
    if (id) {
      const { error } = await service.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    } else {
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      id = data.user.id;
    }
    const del = await service.from("fc_user_roles").delete().eq("user_id", id);
    if (del.error) throw del.error;
    if (roles.length) {
      const ins = await service.from("fc_user_roles").insert(roles.map((role) => ({ user_id: id, role })));
      if (ins.error) throw ins.error;
    }
    const db = createClient(env.url!, env.anon!, noSession);
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { actor: { id, email, roles }, db, store: new SupabaseStore(db, service) };
  }

  beforeAll(async () => {
    service = createClient(env.url!, env.service!, noSession);
    const probe = await service.from("fc_user_roles").select("user_id").limit(1);
    if (probe.error) throw new Error(`Apply supabase/migrations/ to the test project first (${probe.error.message}).`);
    [uploader, approver, noRole] = await Promise.all([
      signedIn("uploader", ["uploader"]),
      signedIn("approver", ["approver"]),
      signedIn("norole", []),
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!service) return;
    // Submitted returns are locked and stay; everything else from this run is removed.
    const { data } = await service.from("fc_returns").select("id").eq("fc_code", fcCode).neq("status", "submitted");
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) {
      await service.storage.from("fc-return-files").remove(ids.map((id) => `${id}.xlsx`));
      await service.from("fc_returns").delete().in("id", ids);
    }
    await Promise.all([uploader, approver, noRole].filter(Boolean).map((u) => u.db.auth.signOut()));
  }, 60_000);

  it("stores an uploader's clean return as version 1, validated, recording who uploaded it", async () => {
    clean = await ingestWorkbook(await fixtureCopy({ fcCode }), "live.xlsx", uploader.store, uploader.actor);
    expect(clean).toMatchObject({ fcCode, version: 1, status: "validated" });
    const read = await approver.store.get(clean.id);
    expect(read).toMatchObject({ id: clean.id, fileName: "live.xlsx", uploadedBy: { id: uploader.actor.id, email: uploader.actor.email } });
    expect(read?.parsed.sheets.length).toBe(clean.parsed.sheets.length);
  }, T);

  it("refuses the exact same file twice", async () => {
    await expect(ingestWorkbook(await fixtureCopy({ fcCode }), "again.xlsx", uploader.store, uploader.actor)).rejects.toBeInstanceOf(
      DuplicateUploadError,
    );
  }, T);

  it("stores a changed file for the period as version 2, flagged needs-fixes", async () => {
    broken = await ingestWorkbook(await fixtureCopy({ fcCode, breakReconciliation: true }), "live-v2.xlsx", uploader.store, uploader.actor);
    expect(broken).toMatchObject({ version: 2, status: "needs-fixes" });
  }, T);

  it("lists this period's versions newest first and serves the original workbook back", async () => {
    const mine = (await approver.store.list()).filter((r) => r.fcCode === fcCode);
    expect(mine.map((r) => r.version)).toEqual([2, 1]);
    expect((await uploader.store.getOriginal(clean.id))?.equals(await fixtureCopy({ fcCode }))).toBe(true);
  }, T);

  it("shows a signed-in user with no role nothing", async () => {
    expect((await noRole.store.list()).filter((r) => r.fcCode === fcCode)).toEqual([]);
    expect(await noRole.store.get(clean.id)).toBeNull();
    expect(await noRole.store.getOriginal(clean.id)).toBeNull();
  }, T);

  it("does not let an uploader write a return with their own login", async () => {
    const { error } = await uploader.db
      .from("fc_returns")
      .update({ status: "submitted" })
      .eq("id", clean.id)
      .select("id");
    expect(error).not.toBeNull();
    const upload = await uploader.db.storage.from("fc-return-files").upload(`${clean.id}-x.xlsx`, Buffer.from("x"));
    expect(upload.error).not.toBeNull();
  }, T);

  it("does not let an uploader submit, in the app or by calling the database directly", async () => {
    await expect(submitReturn(clean.id, uploader.store, uploader.actor)).rejects.toMatchObject({ status: 403 });
    await expect(uploader.store.markSubmitted(clean.id, uploader.actor)).rejects.toThrow(/approver/);
    expect((await approver.store.get(clean.id))?.status).toBe("validated");
  }, T);

  it("does not let an approver submit a version with validation errors", async () => {
    await expect(submitReturn(broken.id, approver.store, approver.actor)).rejects.toThrow(/validation errors/);
  }, T);

  it("lets an approver submit the clean version, records who, and then locks it", async () => {
    const done = await submitReturn(clean.id, approver.store, approver.actor);
    expect(done).toMatchObject({ status: "submitted", submittedBy: { id: approver.actor.id, email: approver.actor.email } });
    expect(done.submittedAt).not.toBeNull();
    const edit = await service.from("fc_returns").update({ file_name: "changed.xlsx" }).eq("id", clean.id);
    expect(edit.error?.message).toMatch(/locked/);
  }, T);
});
