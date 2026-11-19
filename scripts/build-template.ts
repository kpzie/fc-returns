/**
 * Regenerates src/lib/returns/template.json from a reference workbook.
 * Run when CBN issues a new version of the template:
 *   npx tsx scripts/build-template.ts path/to/template.xlsx
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseWorkbook } from "../src/lib/returns/parse";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: build-template.ts <workbook.xlsx>");
  const parsed = await parseWorkbook(readFileSync(file));
  const template = {
    source: path.basename(file),
    generatedAt: new Date().toISOString().slice(0, 10),
    sheets: parsed.sheets.map((s) => {
      const codes = s.kind === "line-items" ? s.rows.map((r) => r.CODE).filter((c) => c !== null) : [];
      // Some line-item sheets list a code once per item (e.g. MFCR356); only enforce uniqueness where the template does.
      const uniqueCodes = s.kind === "line-items" && new Set(codes).size === codes.length;
      return { id: s.id, description: s.description, kind: s.kind, columns: s.columns, uniqueCodes };
    }),
  };
  const out = path.join(__dirname, "../src/lib/returns/template.json");
  writeFileSync(out, JSON.stringify(template, null, 2) + "\n");
  console.log(`Wrote ${template.sheets.length} sheet definitions to ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
