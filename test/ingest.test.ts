import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { ingestWorkbook, submitReturn, DuplicateUploadError } from "@/lib/returns/ingest";
import { AuthError, type Actor } from "@/lib/auth/roles";
import { FileStore } from "@/lib/store/file-store";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));

/** Same period, different content: change one schedule amount. */
async function editedCopy(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fixture as unknown as ArrayBuffer);
  wb.getWorksheet("MFCR304")!.getCell("J9").value = 1;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const uploader: Actor = { id: "11111111-1111-1111-1111-111111111111", email: "uploader@example.test", roles: ["uploader"] };
const approver: Actor = { id: "22222222-2222-2222-2222-222222222222", email: "approver@example.test", roles: ["approver"] };

let store: FileStore;
beforeEach(() => {
  store = new FileStore(mkdtempSync(path.join(tmpdir(), "fc-store-")));
});

describe("ingestWorkbook", () => {
  it("stores a clean return as version 1, validated", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    expect(rec.fcCode).toBe("40196");
    expect(rec.asAt).toBe("2026-03-31");
    expect(rec.version).toBe(1);
    expect(rec.status).toBe("validated");
    expect(rec.counts.errors).toBe(0);
    expect(await store.get(rec.id)).toMatchObject({ id: rec.id, fileName: "march.xlsx" });
  });

  it("refuses the exact same file twice", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    await expect(ingestWorkbook(fixture, "march-again.xlsx", store, uploader)).rejects.toBeInstanceOf(DuplicateUploadError);
  });

  it("stores a changed file for the same period as the next version, flagged when it fails validation", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    const rec = await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store, uploader);
    expect(rec.version).toBe(2);
    expect(rec.status).toBe("needs-fixes");
    expect(rec.issues.some((i) => i.rule === "reconciliation")).toBe(true);
  });

  it("lists returns newest period first, then newest version", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store, uploader);
    const list = await store.list();
    expect(list.map((r) => r.version)).toEqual([2, 1]);
  });

  it("keeps the original upload so it can be downloaded later", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    const original = await store.getOriginal(rec.id);
    expect(original?.equals(fixture)).toBe(true);
  });

  it("only allows submitted status on a validated return", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    const bad = await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store, uploader);
    await expect(submitReturn(bad.id, store, approver)).rejects.toThrow(/validation errors/);
  });

  it("records who uploaded each version", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    expect(rec.uploadedBy).toEqual({ id: uploader.id, email: uploader.email });
    expect((await store.get(rec.id))?.uploadedBy).toEqual({ id: uploader.id, email: uploader.email });
    expect(rec.submittedBy).toBeNull();
  });

  it("refuses an upload from someone without the uploader role and stores nothing", async () => {
    await expect(ingestWorkbook(fixture, "march.xlsx", store, approver)).rejects.toMatchObject({ status: 403 });
    await expect(ingestWorkbook(fixture, "march.xlsx", store, null)).rejects.toBeInstanceOf(AuthError);
    expect(await store.list()).toEqual([]);
  });

  it("records which approver marked a return submitted", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    const done = await submitReturn(rec.id, store, approver);
    expect(done.status).toBe("submitted");
    expect(done.submittedBy).toEqual({ id: approver.id, email: approver.email });
    expect((await store.get(rec.id))?.submittedBy).toEqual({ id: approver.id, email: approver.email });
  });

  it("does not let an uploader mark a return submitted", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store, uploader);
    await expect(submitReturn(rec.id, store, uploader)).rejects.toMatchObject({ status: 403 });
    expect((await store.get(rec.id))?.status).toBe("validated");
  });
});
