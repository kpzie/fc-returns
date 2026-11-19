export type CellValue = string | number | null;
export type Row = Record<string, CellValue>;

/** line-items: keyed by a numeric CODE (balance sheet, P&L, memo items).
 *  schedule: a list of records (placements, borrowings, staff, etc.). */
export type SheetKind = "line-items" | "schedule";

export interface ParsedSheet {
  id: string; // CALLREPORT_ID, e.g. "MFCR300"
  description: string;
  fcCode: string;
  fcName: string;
  asAt: string; // YYYY-MM-DD
  kind: SheetKind;
  headerRow: number; // 1-based Excel row of the column headers
  columns: string[];
  rows: Row[];
}

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  rule: string; // machine-readable rule id
  sheet?: string;
  row?: number; // 1-based Excel row
  column?: string;
  message: string;
}

export interface ParsedReturn {
  fcCode: string;
  fcName: string;
  asAt: string;
  sheets: ParsedSheet[];
  issues: Issue[]; // problems found while parsing (header mismatch etc.)
}
