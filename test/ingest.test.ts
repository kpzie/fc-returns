import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { ingestWorkbook, DuplicateUploadError } from "@/lib/returns/ingest";
import { FileStore } from "@/lib/store/file-store";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));

/** Same period, different content: change one schedule amount. */
async function editedCopy(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fixture as unknown as ArrayBuffer);
  wb.getWorksheet("MFCR304")!.getCell("J9").value = 1;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let store: FileStore;
beforeEach(() => {
  store = new FileStore(mkdtempSync(path.join(tmpdir(), "fc-store-")));
});

describe("ingestWorkbook", () => {
  it("stores a clean return as version 1, validated", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store);
    expect(rec.fcCode).toBe("40196");
    expect(rec.asAt).toBe("2026-03-31");
    expect(rec.version).toBe(1);
    expect(rec.status).toBe("validated");
    expect(rec.counts.errors).toBe(0);
    expect(await store.get(rec.id)).toMatchObject({ id: rec.id, fileName: "march.xlsx" });
  });

  it("refuses the exact same file twice", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store);
    await expect(ingestWorkbook(fixture, "march-again.xlsx", store)).rejects.toBeInstanceOf(DuplicateUploadError);
  });

  it("stores a changed file for the same period as the next version, flagged when it fails validation", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store);
    const rec = await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store);
    expect(rec.version).toBe(2);
    expect(rec.status).toBe("needs-fixes");
    expect(rec.issues.some((i) => i.rule === "reconciliation")).toBe(true);
  });

  it("lists returns newest period first, then newest version", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store);
    await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store);
    const list = await store.list();
    expect(list.map((r) => r.version)).toEqual([2, 1]);
  });

  it("keeps the original upload so it can be downloaded later", async () => {
    const rec = await ingestWorkbook(fixture, "march.xlsx", store);
    const original = await store.getOriginal(rec.id);
    expect(original?.equals(fixture)).toBe(true);
  });

  it("only allows submitted status on a validated return", async () => {
    await ingestWorkbook(fixture, "march.xlsx", store);
    const bad = await ingestWorkbook(await editedCopy(), "march-v2.xlsx", store);
    await expect(store.markSubmitted(bad.id)).rejects.toThrow(/validation errors/);
  });
});
