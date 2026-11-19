import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSubmittable, type ReturnRecord, type ReturnStore, type ReturnSummary } from "./types";

const TABLE = "fc_returns";
const BUCKET = "fc-return-files";
const SUMMARY_COLUMNS =
  "id, fc_code, fc_name, as_at, version, status, file_name, file_sha256, uploaded_at, submitted_at, error_count, warning_count";

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
  error_count: number;
  warning_count: number;
  issues?: ReturnRecord["issues"];
  kpis?: ReturnRecord["kpis"];
  parsed?: ReturnRecord["parsed"];
};

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
  counts: { errors: r.error_count, warnings: r.warning_count },
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Production store: Postgres table + private Storage bucket (see supabase/migrations). */
export class SupabaseStore implements ReturnStore {
  constructor(private readonly db: SupabaseClient) {}

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
    const up = await this.db.storage
      .from(BUCKET)
      .upload(`${r.id}.xlsx`, original, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (up.error) throw new Error(`File storage error: ${up.error.message}`);
    check(
      await this.db.from(TABLE).insert({
        id: r.id,
        fc_code: r.fcCode,
        fc_name: r.fcName,
        as_at: r.asAt,
        version: r.version,
        status: r.status,
        file_name: r.fileName,
        file_sha256: r.fileSha256,
        uploaded_at: r.uploadedAt,
        error_count: r.counts.errors,
        warning_count: r.counts.warnings,
        issues: r.issues,
        kpis: r.kpis,
        parsed: r.parsed,
      }),
    );
  }

  async markSubmitted(id: string) {
    const current = check(await this.db.from(TABLE).select(SUMMARY_COLUMNS).eq("id", id).maybeSingle()) as Row | null;
    assertSubmittable(current ? toSummary(current) : null, id);
    const row = check(
      await this.db.from(TABLE).update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id).select(SUMMARY_COLUMNS).single(),
    ) as Row;
    return toSummary(row);
  }
}
