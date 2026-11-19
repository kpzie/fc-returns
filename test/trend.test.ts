import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { ingestWorkbook } from "@/lib/returns/ingest";
import { loadTrend } from "@/lib/returns/trend";
import { FileStore } from "@/lib/store/file-store";
import type { Actor } from "@/lib/auth/roles";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));

async function variant(edit: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fixture as unknown as ArrayBuffer);
  edit(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const uploader: Actor = { id: "u1", email: "uploader@example.test", roles: ["uploader"] };
const setPeriod = (asAt: string) => (wb: ExcelJS.Workbook) => wb.worksheets.forEach((ws) => (ws.getCell("C6").value = asAt));

describe("loadTrend", () => {
  it("returns one point per period, oldest first, using the latest clean version", async () => {
    const store = new FileStore(mkdtempSync(path.join(tmpdir(), "fc-trend-")));
    await ingestWorkbook(fixture, "mar.xlsx", store, uploader); // 2026-03-31 v1, clean
    await ingestWorkbook(await variant(setPeriod("2026-02-28")), "feb.xlsx", store, uploader);
    // March v2 breaks a reconciliation, so the trend must keep using March v1.
    await ingestWorkbook(await variant((wb) => (wb.getWorksheet("MFCR304")!.getCell("J9").value = 1)), "mar-v2.xlsx", store, uploader);

    const trend = await loadTrend(store, "40196");
    expect(trend.map((t) => [t.asAt, t.version])).toEqual([
      ["2026-02-28", 1],
      ["2026-03-31", 1],
    ]);
    expect(trend[0].kpis.find((k) => k.id === "total_assets")?.value).toBe(356530.51);
  });

  it("ignores other finance companies", async () => {
    const store = new FileStore(mkdtempSync(path.join(tmpdir(), "fc-trend-")));
    await ingestWorkbook(fixture, "mar.xlsx", store, uploader);
    expect(await loadTrend(store, "99999")).toEqual([]);
  });
});
