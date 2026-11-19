import templateJson from "./template.json";
import { ARITHMETIC_RULES, RECONCILIATION_RULES, TOLERANCE } from "./rules";
import type { Issue, ParsedReturn, ParsedSheet } from "./types";

export interface TemplateSheet {
  id: string;
  description: string;
  kind: "line-items" | "schedule";
  columns: string[];
  uniqueCodes: boolean; // line codes may appear only once on this sheet
}
export const TEMPLATE: { sheets: TemplateSheet[] } = templateJson as { sheets: TemplateSheet[] };

export interface ValidationResult {
  ok: boolean; // no errors (warnings allowed)
  issues: Issue[];
  counts: { errors: number; warnings: number };
}

/** Columns that must hold numbers, judged by name. */
const NUMERIC_COLUMN = /(^|_)(AMOUNT|VALUE|BALANCE)(_|$)|^(CURRENT_MONTH|YEAR_TO_DATE)$/;
/** Columns that must hold ISO dates, judged by name ("..._TO_DATE" columns are cumulative amounts, not dates). */
const isDateColumn = (col: string) =>
  /(^|_)DATE(_|$)/.test(col) && !/TO_DATE/.test(col) && !TEXT_COLUMNS_NAMED_LIKE_DATES.has(col);
/** Named like dates, but the template fills them with free text. */
const TEXT_COLUMNS_NAMED_LIKE_DATES = new Set(["CREDIT_DATE_UTILISATION_EXCEEDED_LIMIT"]);
/** The template writes dates as YYYY-MM-DD, sometimes with a time part. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

const excelRow = (s: ParsedSheet, index: number) => s.headerRow + 1 + index;
const fmt = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function checkStructure(ret: ParsedReturn, issues: Issue[]) {
  const byId = new Map(ret.sheets.map((s) => [s.id, s]));
  for (const t of TEMPLATE.sheets) {
    const s = byId.get(t.id);
    if (!s) {
      issues.push({ severity: "error", rule: "missing-sheet", sheet: t.id, message: `Sheet ${t.id} (${t.description}) is missing.` });
      continue;
    }
    for (const col of t.columns) {
      if (!s.columns.includes(col)) {
        issues.push({ severity: "error", rule: "missing-column", sheet: s.id, column: col, message: `Column ${col} is missing from ${s.id}.` });
      }
    }
    for (const col of s.columns) {
      if (!t.columns.includes(col)) {
        issues.push({ severity: "warning", rule: "unexpected-column", sheet: s.id, column: col, message: `Column ${col} is not in the template for ${s.id}.` });
      }
    }
  }
  const known = new Set(TEMPLATE.sheets.map((t) => t.id));
  for (const s of ret.sheets) {
    if (!known.has(s.id)) {
      issues.push({ severity: "warning", rule: "unexpected-sheet", sheet: s.id, message: `Sheet ${s.id} is not part of the template and will be ignored.` });
    }
  }
}

function checkCells(ret: ParsedReturn, issues: Issue[]) {
  for (const s of ret.sheets) {
    s.rows.forEach((row, i) => {
      for (const col of s.columns) {
        const v = row[col];
        if (v === null || v === undefined) continue;
        if (NUMERIC_COLUMN.test(col) && typeof v !== "number") {
          issues.push({ severity: "error", rule: "not-a-number", sheet: s.id, row: excelRow(s, i), column: col, message: `${s.id} ${col} row ${excelRow(s, i)}: "${v}" is not a number.` });
        }
        if (isDateColumn(col) && !(typeof v === "string" && ISO_DATE.test(v))) {
          issues.push({ severity: "error", rule: "bad-date", sheet: s.id, row: excelRow(s, i), column: col, message: `${s.id} ${col} row ${excelRow(s, i)}: "${v}" is not a YYYY-MM-DD date.` });
        }
      }
    });
    if (TEMPLATE.sheets.find((t) => t.id === s.id)?.uniqueCodes) {
      const seen = new Map<string, number>();
      s.rows.forEach((row, i) => {
        const code = String(row.CODE ?? "");
        if (!code) return;
        if (seen.has(code)) {
          issues.push({ severity: "error", rule: "duplicate-code", sheet: s.id, row: excelRow(s, i), message: `${s.id}: code ${code} appears on rows ${seen.get(code)} and ${excelRow(s, i)}.` });
        } else seen.set(code, excelRow(s, i));
      });
    }
  }
}

/** Value of a line code in a column; missing or blank lines count as 0. */
function lineValue(s: ParsedSheet, code: string, column: string): number {
  const v = s.rows.find((r) => r.CODE === code)?.[column];
  return typeof v === "number" ? v : 0;
}

function checkArithmetic(ret: ParsedReturn, issues: Issue[]) {
  for (const rule of ARITHMETIC_RULES) {
    const s = ret.sheets.find((x) => x.id === rule.sheet);
    if (!s || !s.rows.some((r) => r.CODE === rule.total)) continue; // structure check reports the gap
    for (const col of rule.columns) {
      if (!s.columns.includes(col)) continue;
      const expected =
        rule.plus.reduce((a, c) => a + lineValue(s, c, col), 0) - (rule.minus ?? []).reduce((a, c) => a + lineValue(s, c, col), 0);
      const actual = lineValue(s, rule.total, col);
      if (Math.abs(expected - actual) >= TOLERANCE) {
        const formula = rule.plus.join(" + ") + (rule.minus?.length ? " − " + rule.minus.join(" − ") : "");
        issues.push({
          severity: "error",
          rule: "arithmetic",
          sheet: s.id,
          column: col,
          message: `${s.id} ${col}: ${rule.label} — line ${rule.total} is ${fmt(actual)} but ${formula} = ${fmt(expected)} (difference ${fmt(actual - expected)}).`,
        });
      }
    }
  }
}

function checkReconciliation(ret: ParsedReturn, issues: Issue[]) {
  for (const rule of RECONCILIATION_RULES) {
    const line = ret.sheets.find((x) => x.id === rule.line.sheet);
    const schedules = rule.schedule.sheets.map((id) => ret.sheets.find((x) => x.id === id));
    if (!line || schedules.some((s) => !s)) continue;
    const lineTotal = rule.line.codes.reduce((a, c) => a + lineValue(line, c, rule.line.column), 0);
    const schedTotal = schedules.reduce(
      (a, s) => a + s!.rows.reduce((b, r) => b + (typeof r[rule.schedule.column] === "number" ? (r[rule.schedule.column] as number) : 0), 0),
      0,
    );
    if (Math.abs(lineTotal - schedTotal) >= TOLERANCE) {
      issues.push({
        severity: rule.severity ?? "error",
        rule: "reconciliation",
        sheet: rule.schedule.sheets.join(", "),
        message: `${rule.label}: ${rule.line.sheet} line ${rule.line.codes.join(" + ")} is ${fmt(lineTotal)} but ${rule.schedule.sheets.join(" + ")} ${rule.schedule.column} totals ${fmt(schedTotal)} (difference ${fmt(lineTotal - schedTotal)}).`,
      });
    }
  }
}

export function validateReturn(ret: ParsedReturn): ValidationResult {
  const issues: Issue[] = [...ret.issues];
  checkStructure(ret, issues);
  checkCells(ret, issues);
  checkArithmetic(ret, issues);
  checkReconciliation(ret, issues);
  const errors = issues.filter((i) => i.severity === "error").length;
  return { ok: errors === 0, issues, counts: { errors, warnings: issues.length - errors } };
}
