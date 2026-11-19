import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "../auth/roles";
import { type Person, type ReturnRecord, type ReturnStore, type ReturnSummary } from "./types";

const TABLE = "fc_returns";
const BUCKET = "fc-return-files";
const SUMMARY_COLUMNS =
  "id, fc_code, fc_name, as_at, version, status, file_name, file_sha256, uploaded_at, submitted_at, error_count, warning_count, uploaded_by, uploaded_by_email, submitted_by, submitted_by_email";

type Row = {
  id: string;
  fc_code: string;
  fc_name: string;
  as_at: string;
  version: number;
  status: ReturnSummary["status"];
  file_name: string;
  file_sha256: string;
  uploaded_at: string;
  submitted_at: string | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  submitted_by: string | null;
  submitted_by_email: string | null;
  error_count: number;
  warning_count: number;
  issues?: ReturnRecord["issues"];
  kpis?: ReturnRecord["kpis"];
  parsed?: ReturnRecord["parsed"];
};

const person = (id: string | null, email: string | null): Person | null => (id ? { id, email: email ?? "" } : null);

const toSummary = (r: Row): ReturnSummary => ({
  id: r.id,
  fcCode: r.fc_code,
  fcName: r.fc_name,
  asAt: r.as_at,
  version: r.version,
  status: r.status,
  fileName: r.file_name,
  fileSha256: r.file_sha256,
  uploadedAt: r.uploaded_at,
  submittedAt: r.submitted_at,
  uploadedBy: person(r.uploaded_by, r.uploaded_by_email),
  submittedBy: person(r.submitted_by, r.submitted_by_email),
  counts: { errors: r.error_count, warnings: r.warning_count },
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/**
 * Production store: Postgres table + private Storage bucket (see supabase/migrations).
 * `db` acts as the signed-in user, so RLS applies to every read and to submission.
 * `service` (service-role key) is used only by insert(): the database lets no user insert directly, because the
 * row carries validation results computed here (see 0002_auth_roles.sql). Callers must authorize first (ingestWorkbook).
 */
export class SupabaseStore implements ReturnStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly service: SupabaseClient,
  ) {}

  async list() {
    const rows = check(
      await this.db.from(TABLE).select(SUMMARY_COLUMNS).order("as_at", { ascending: false }).order("fc_code").order("version", { ascending: false }),
    ) as Row[];
    return rows.map(toSummary);
  }

  async get(id: string) {
    const row = check(await this.db.from(TABLE).select("*").eq("id", id).maybeSingle()) as Row | null;
    if (!row) return null;
    return { ...toSummary(row), issues: row.issues ?? [], kpis: row.kpis ?? [], parsed: row.parsed! };
  }

  async getOriginal(id: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(`${id}.xlsx`);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async findByHash(sha256: string) {
    const row = check(await this.db.from(TABLE).select(SUMMARY_COLUMNS).eq("file_sha256", sha256).maybeSingle()) as Row | null;
    return row ? toSummary(row) : null;
  }

  async latestVersion(fcCode: string, asAt: string) {
    const row = check(
      await this.db.from(TABLE).select("version").eq("fc_code", fcCode).eq("as_at", asAt).order("version", { ascending: false }).limit(1).maybeSingle(),
    ) as { version: number } | null;
    return row?.version ?? 0;
  }

  async insert(r: ReturnRecord, original: Buffer) {
    if (!r.uploadedBy) throw new Error("A return must record who uploaded it.");
    const up = await this.service.storage
      .from(BUCKET)
      .upload(`${r.id}.xlsx`, original, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (up.error) throw new Error(`File storage error: ${up.error.message}`);
    check(
      await this.service.from(TABLE).insert({
        id: r.id,
        fc_code: r.fcCode,
        fc_name: r.fcName,
        as_at: r.asAt,
        version: r.version,
        status: r.status,
        file_name: r.fileName,
        file_sha256: r.fileSha256,
        uploaded_at: r.uploadedAt,
        uploaded_by: r.uploadedBy.id,
        uploaded_by_email: r.uploadedBy.email,
        error_count: r.counts.errors,
        warning_count: r.counts.warnings,
        issues: r.issues,
        kpis: r.kpis,
        parsed: r.parsed,
      }),
    );
  }

  /** Runs fc_submit_return as the signed-in user: the database checks the approver role and records who. */
  async markSubmitted(id: string, by: Actor) {
    void by; // recorded by the database from the caller's session, not trusted from here
    const { error } = await this.db.rpc("fc_submit_return", { p_id: id });
    if (error) throw new Error(error.message);
    const row = check(await this.db.from(TABLE).select(SUMMARY_COLUMNS).eq("id", id).single()) as Row;
    return toSummary(row);
  }
}
