import ExcelJS from "exceljs";
import type { CellValue, Issue, ParsedReturn, ParsedSheet, Row } from "./types";

/** Labels expected in column B, rows 2-6, on every sheet of the return. */
const HEADER_LABELS = ["CALLREPORT_ID", "CALLREPORT_DESCRIPTION", "FC_CODE", "FC_NAME", "AS_AT"] as const;
const LABEL_COL = 2; // B
const VALUE_COL = 3; // C
const FIRST_DATA_COL = 2; // tables start in column B
const HEADER_SEARCH_FROM = 7;
const HEADER_SEARCH_TO = 15;

/** Columns whose numeric values are identifiers and must be emitted as text. */
function isCodeColumn(name: string): boolean {
  return name === "CODE" || name === "S_N" || name.endsWith("_CODE");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Flatten an ExcelJS cell value to a plain string / number / null. */
function plain(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "object") {
    if ("richText" in v) return plain(v.richText.map((p) => p.text).join(""));
    if ("result" in v) return plain(v.result as ExcelJS.CellValue);
    if ("text" in v) return plain(v.text as ExcelJS.CellValue);
    if ("error" in v) return null;
  }
  return String(v);
}

/** Identifiers stored as floats (40196.0) become "40196"; text is kept verbatim (leading zeros). */
function asCode(v: CellValue): CellValue {
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  return v;
}

function asText(v: CellValue): string {
  return v === null ? "" : String(asCode(v));
}

function parseSheet(ws: ExcelJS.Worksheet, issues: Issue[]): ParsedSheet {
  const cell = (r: number, c: number) => plain(ws.getRow(r).getCell(c).value);

  HEADER_LABELS.forEach((label, i) => {
    const found = cell(2 + i, LABEL_COL);
    if (found !== label) {
      issues.push({
        severity: "error",
        rule: "sheet-header-label",
        sheet: ws.name,
        row: 2 + i,
        column: "B",
        message: `Expected "${label}" in B${2 + i}, found "${found ?? ""}".`,
      });
    }
  });

  const id = asText(cell(2, VALUE_COL)) || ws.name;
  if (id !== ws.name) {
    issues.push({
      severity: "warning",
      rule: "sheet-name-mismatch",
      sheet: ws.name,
      message: `Sheet tab "${ws.name}" has CALLREPORT_ID "${id}".`,
    });
  }

  let headerRow = -1;
  for (let r = HEADER_SEARCH_FROM; r <= HEADER_SEARCH_TO; r++) {
    if (cell(r, FIRST_DATA_COL) !== null) {
      headerRow = r;
      break;
    }
  }

  const columns: string[] = [];
  if (headerRow === -1) {
    issues.push({ severity: "error", rule: "no-column-header", sheet: ws.name, message: "Could not find the column header row." });
  } else {
    for (let c = FIRST_DATA_COL; ; c++) {
      const name = cell(headerRow, c);
      if (name === null) break;
      columns.push(String(name));
    }
  }

  const rows: Row[] = [];
  if (headerRow !== -1) {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const values = columns.map((_, i) => cell(r, FIRST_DATA_COL + i));
      if (values.every((v) => v === null)) break; // first blank row ends the table
      const row: Row = {};
      columns.forEach((col, i) => {
        row[col] = isCodeColumn(col) ? asCode(values[i]) : values[i];
      });
      rows.push(row);
    }
  }

  return {
    id,
    description: asText(cell(3, VALUE_COL)),
    fcCode: asText(cell(4, VALUE_COL)),
    fcName: asText(cell(5, VALUE_COL)),
    asAt: asText(cell(6, VALUE_COL)),
    kind: columns[0] === "CODE" ? "line-items" : "schedule",
    headerRow,
    columns,
    rows,
  };
}

export async function parseWorkbook(data: ArrayBuffer | Buffer | Uint8Array): Promise<ParsedReturn> {
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS's type wants its own Buffer alias; a Uint8Array view is what it reads.
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new Error("Not a valid .xlsx workbook.");
  }

  const issues: Issue[] = [];
  const sheets = wb.worksheets.map((ws) => parseSheet(ws, issues));
  if (sheets.length === 0) throw new Error("Not a valid .xlsx workbook: it has no sheets.");

  // The return-level header comes from the first sheet; every other sheet must agree.
  const [first] = sheets;
  for (const s of sheets) {
    for (const key of ["fcCode", "fcName", "asAt"] as const) {
      if (s[key] !== first[key]) {
        issues.push({
          severity: "error",
          rule: "header-mismatch",
          sheet: s.id,
          message: `${key} is "${s[key]}" but the first sheet (${first.id}) says "${first[key]}".`,
        });
      }
    }
  }

  return { fcCode: first.fcCode, fcName: first.fcName, asAt: first.asAt, sheets, issues };
}
