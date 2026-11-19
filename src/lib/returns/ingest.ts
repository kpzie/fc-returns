import { createHash, randomUUID } from "node:crypto";
import { parseWorkbook } from "./parse";
import { validateReturn } from "./validate";
import { computeKpis } from "./kpis";
import { authorize, type Actor } from "../auth/roles";
import { personOf, type ReturnRecord, type ReturnStore, type ReturnSummary } from "../store/types";

export class DuplicateUploadError extends Error {
  constructor(public readonly existingId: string, existingVersion: number) {
    super(`This exact file was already uploaded (version ${existingVersion}).`);
    this.name = "DuplicateUploadError";
  }
}

/** Parse, validate and store one uploaded workbook. Each upload for a period becomes a new version. */
export async function ingestWorkbook(file: Buffer, fileName: string, store: ReturnStore, actor: Actor | null): Promise<ReturnRecord> {
  authorize(actor, "upload");
  const fileSha256 = createHash("sha256").update(file).digest("hex");
  const dup = await store.findByHash(fileSha256);
  if (dup) throw new DuplicateUploadError(dup.id, dup.version);

  const parsed = await parseWorkbook(file);
  const validation = validateReturn(parsed);
  const version = (await store.latestVersion(parsed.fcCode, parsed.asAt)) + 1;

  const record: ReturnRecord = {
    id: randomUUID(),
    fcCode: parsed.fcCode,
    fcName: parsed.fcName,
    asAt: parsed.asAt,
    version,
    status: validation.ok ? "validated" : "needs-fixes",
    fileName,
    fileSha256,
    uploadedAt: new Date().toISOString(),
    submittedAt: null,
    uploadedBy: personOf(actor),
    submittedBy: null,
    counts: validation.counts,
    issues: validation.issues,
    kpis: computeKpis(parsed),
    parsed,
  };
  await store.insert(record, file);
  return record;
}

/** Record that a version was filed with CBN. Approvers only; refuses a return with validation errors. */
export async function submitReturn(id: string, store: ReturnStore, actor: Actor | null): Promise<ReturnSummary> {
  authorize(actor, "submit");
  return store.markSubmitted(id, actor);
}
