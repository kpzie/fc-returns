import type { Kpi } from "../returns/kpis";
import type { Issue, ParsedReturn } from "../returns/types";

/** needs-fixes: has validation errors · validated: clean, ready to export · submitted: filed with CBN */
export type ReturnStatus = "needs-fixes" | "validated" | "submitted";

export interface ReturnSummary {
  id: string;
  fcCode: string;
  fcName: string;
  asAt: string;
  version: number;
  status: ReturnStatus;
  fileName: string;
  fileSha256: string;
  uploadedAt: string;
  submittedAt: string | null;
  counts: { errors: number; warnings: number };
}

export interface ReturnRecord extends ReturnSummary {
  issues: Issue[];
  kpis: Kpi[];
  parsed: ParsedReturn;
}

export interface ReturnStore {
  /** Newest period first, then newest version. */
  list(): Promise<ReturnSummary[]>;
  get(id: string): Promise<ReturnRecord | null>;
  getOriginal(id: string): Promise<Buffer | null>;
  findByHash(sha256: string): Promise<ReturnSummary | null>;
  latestVersion(fcCode: string, asAt: string): Promise<number>; // 0 when none
  insert(record: ReturnRecord, original: Buffer): Promise<void>;
  /** Refuses a return that still has validation errors. */
  markSubmitted(id: string): Promise<ReturnSummary>;
}

export function sortSummaries<T extends ReturnSummary>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.asAt.localeCompare(a.asAt) || a.fcCode.localeCompare(b.fcCode) || b.version - a.version);
}

export function summarise(r: ReturnRecord): ReturnSummary {
  return {
    id: r.id,
    fcCode: r.fcCode,
    fcName: r.fcName,
    asAt: r.asAt,
    version: r.version,
    status: r.status,
    fileName: r.fileName,
    fileSha256: r.fileSha256,
    uploadedAt: r.uploadedAt,
    submittedAt: r.submittedAt,
    counts: r.counts,
  };
}

export function assertSubmittable(r: ReturnSummary | null, id: string): asserts r is ReturnSummary {
  if (!r) throw new Error(`Return ${id} not found.`);
  if (r.status === "needs-fixes") throw new Error("This return still has validation errors and cannot be marked as submitted.");
}
