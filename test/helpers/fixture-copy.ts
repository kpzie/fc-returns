import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

export const fixture = readFileSync(path.join(__dirname, "../fixtures/sample-return.xlsx"));

/**
 * A copy of the sample return with FC_CODE (C4) replaced on every sheet. Optionally breaks the MFCR304
 * schedule so MFCR300 no longer reconciles (the same edit test/ingest.test.ts uses for a needs-fixes version).
 */
export async function fixtureCopy(opts: { fcCode: string; breakReconciliation?: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fixture as unknown as ArrayBuffer);
  wb.worksheets.forEach((ws) => (ws.getCell("C4").value = opts.fcCode));
  if (opts.breakReconciliation) wb.getWorksheet("MFCR304")!.getCell("J9").value = 1;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
