import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Runs every migration in supabase/migrations against PGlite (real Postgres) on top of a small
 * Supabase stub, then checks the row-level security as each kind of user would hit it.
 */
const MIGRATIONS = path.join(__dirname, "../supabase/migrations");

const UPLOADER = { id: "11111111-1111-1111-1111-111111111111", email: "uploader@example.test" };
const APPROVER = { id: "22222222-2222-2222-2222-222222222222", email: "approver@example.test" };
const NOBODY = { id: "33333333-3333-3333-3333-333333333333", email: "norole@example.test" };
const CLEAN = "aaaaaaaa-0000-0000-0000-000000000001";
const BROKEN = "aaaaaaaa-0000-0000-0000-000000000002";

let db: PGlite;

async function as(who: "postgres" | "anon" | "service_role" | { id: string }) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [typeof who === "object" ? who.id : ""]);
  if (who === "postgres") return;
  await db.exec(`set role ${typeof who === "object" ? "authenticated" : who}`);
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows;
}

async function insertReturn(id: string, status: string, errors: number, version: number, uploadedBy: string | null = UPLOADER.id) {
  await db.query(
    `insert into public.fc_returns (id, fc_code, fc_name, as_at, version, status, file_name, file_sha256, error_count, parsed,
       uploaded_by, uploaded_by_email)
     values ($1::uuid, '40196', 'Test FC', '2026-03-31', $2, $3, 'r.xlsx', $1::text, $4, '{}'::jsonb, $5, 'uploader@example.test')`,
    [id, version, status, errors, uploadedBy],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, "support/supabase-stub.sql"), "utf8"));
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
  for (const u of [UPLOADER, APPROVER, NOBODY]) await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
  await db.query("insert into public.fc_user_roles (user_id, role) values ($1, 'uploader'), ($2, 'approver')", [UPLOADER.id, APPROVER.id]);
}, 60_000);

beforeEach(async () => {
  await as("postgres");
  await db.exec("alter table public.fc_returns disable trigger fc_returns_lock; delete from public.fc_returns; alter table public.fc_returns enable trigger fc_returns_lock;");
  await db.exec("delete from storage.objects");
  await as("service_role");
  await insertReturn(CLEAN, "validated", 0, 1);
  await insertReturn(BROKEN, "needs-fixes", 3, 2);
  await db.query("insert into storage.objects (bucket_id, name) values ('fc-return-files', $1)", [`${CLEAN}.xlsx`]);
});

describe("reading returns", () => {
  it("shows nothing to anonymous visitors", async () => {
    await as("anon");
    await expect(rows("select id from public.fc_returns")).rejects.toThrow(/permission denied/);
  });

  it("shows nothing to a signed-in user without a role", async () => {
    await as(NOBODY);
    expect(await rows("select id from public.fc_returns")).toEqual([]);
  });

  it("shows every return to uploaders and approvers", async () => {
    for (const who of [UPLOADER, APPROVER]) {
      await as(who);
      expect(await rows("select id from public.fc_returns")).toHaveLength(2);
    }
  });
});

describe("writing returns", () => {
  it("does not let signed-in users insert directly (the server inserts after validating)", async () => {
    await as(UPLOADER);
    await expect(insertReturn("aaaaaaaa-0000-0000-0000-000000000003", "validated", 0, 3)).rejects.toThrow(/permission denied/);
  });

  it("does not let signed-in users edit or delete a return directly", async () => {
    for (const who of [UPLOADER, APPROVER]) {
      await as(who);
      await expect(rows("update public.fc_returns set status = 'submitted' where id = $1", [CLEAN])).rejects.toThrow(/permission denied/);
      await expect(rows("delete from public.fc_returns where id = $1", [CLEAN])).rejects.toThrow(/permission denied/);
    }
  });

  it("requires every new return to record who uploaded it", async () => {
    await as("service_role");
    await expect(insertReturn("aaaaaaaa-0000-0000-0000-000000000004", "validated", 0, 4, null)).rejects.toThrow(/uploaded_by/);
  });
});

describe("fc_submit_return", () => {
  it("lets an approver submit a validated return and records who did it", async () => {
    await as(APPROVER);
    await rows("select public.fc_submit_return($1)", [CLEAN]);
    const [r] = await rows("select status, submitted_at, submitted_by, submitted_by_email from public.fc_returns where id = $1", [CLEAN]);
    expect(r).toMatchObject({ status: "submitted", submitted_by: APPROVER.id, submitted_by_email: APPROVER.email });
    expect(r.submitted_at).not.toBeNull();
  });

  it("refuses uploaders, users without a role and anonymous callers", async () => {
    for (const who of [UPLOADER, NOBODY]) {
      await as(who);
      await expect(rows("select public.fc_submit_return($1)", [CLEAN])).rejects.toThrow(/approver/);
    }
    await as("anon");
    await expect(rows("select public.fc_submit_return($1)", [CLEAN])).rejects.toThrow(/permission denied/);
    await as("postgres");
    expect((await rows("select status from public.fc_returns where id = $1", [CLEAN]))[0].status).toBe("validated");
  });

  it("refuses a return with validation errors", async () => {
    await as(APPROVER);
    await expect(rows("select public.fc_submit_return($1)", [BROKEN])).rejects.toThrow(/validation errors/);
  });

  it("refuses a return that is already submitted", async () => {
    await as(APPROVER);
    await rows("select public.fc_submit_return($1)", [CLEAN]);
    await expect(rows("select public.fc_submit_return($1)", [CLEAN])).rejects.toThrow(/locked/);
  });
});

describe("roles table", () => {
  it("lets a user read their own roles only", async () => {
    await as(UPLOADER);
    expect(await rows("select user_id, role from public.fc_user_roles")).toEqual([{ user_id: UPLOADER.id, role: "uploader" }]);
  });

  it("does not let a user grant themselves a role", async () => {
    await as(UPLOADER);
    await expect(rows("insert into public.fc_user_roles (user_id, role) values ($1, 'approver')", [UPLOADER.id])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("original workbook files", () => {
  it("can be read by staff but not by users without a role", async () => {
    await as(UPLOADER);
    expect(await rows("select name from storage.objects")).toHaveLength(1);
    await as(NOBODY);
    expect(await rows("select name from storage.objects")).toEqual([]);
  });

  it("cannot be uploaded, replaced or deleted directly by signed-in users", async () => {
    await as(UPLOADER);
    await expect(rows("insert into storage.objects (bucket_id, name) values ('fc-return-files', 'x.xlsx')")).rejects.toThrow(
      /row-level security/,
    );
    expect(await rows("delete from storage.objects returning id")).toEqual([]);
  });
});
