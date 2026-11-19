import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseWorkbook } from "@/lib/returns/parse";
import { validateReturn } from "@/lib/returns/validate";
import type { ParsedReturn, Row } from "@/lib/returns/types";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));
let base: ParsedReturn;
beforeAll(async () => {
  base = await parseWorkbook(fixture);
});

/** A fresh, mutable copy of the sample for each test. */
const sample = () => structuredClone(base);
const sheet = (r: ParsedReturn, id: string) => r.sheets.find((s) => s.id === id)!;
const line = (r: ParsedReturn, id: string, code: string): Row => sheet(r, id).rows.find((x) => x.CODE === code)!;
const rules = (r: ParsedReturn) => validateReturn(r).issues.filter((i) => i.severity === "error").map((i) => i.rule);

describe("validateReturn", () => {
  it("finds no errors in the sample template", () => {
    const result = validateReturn(sample());
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("flags a sheet missing from the workbook", () => {
    const r = sample();
    r.sheets = r.sheets.filter((s) => s.id !== "MFCR304");
    expect(rules(r)).toContain("missing-sheet");
  });

  it("flags a missing column", () => {
    const r = sample();
    const s = sheet(r, "MFCR304");
    s.columns = s.columns.filter((c) => c !== "AMOUNT");
    s.rows.forEach((row) => delete row.AMOUNT);
    expect(rules(r)).toContain("missing-column");
  });

  it("flags text in an amount column, with the Excel row", () => {
    const r = sample();
    sheet(r, "MFCR304").rows[1].AMOUNT = "1,200.32";
    const issue = validateReturn(r).issues.find((i) => i.rule === "not-a-number")!;
    expect(issue.sheet).toBe("MFCR304");
    expect(issue.column).toBe("AMOUNT");
    expect(issue.row).toBe(10); // header on row 8, second data row is row 10
  });

  it("flags a date that is not YYYY-MM-DD", () => {
    const r = sample();
    sheet(r, "MFCR304").rows[0].TRANSACTION_EFFECTIVE_DATE = "31/01/2026";
    expect(rules(r)).toContain("bad-date");
  });

  it("flags a duplicated line-item code", () => {
    const r = sample();
    const bs = sheet(r, "MFCR300");
    bs.rows.push({ ...bs.rows[1] });
    expect(rules(r)).toContain("duplicate-code");
  });

  it("allows a repeated code on MFCR100, as in CBN's accepted MFCR100 (code 21180 twice)", () => {
    const r = sample();
    const memo = sheet(r, "MFCR100");
    memo.rows.push({ ...memo.rows.find((x) => x.CODE === "21180")! });
    expect(rules(r)).not.toContain("duplicate-code");
  });

  it("flags a subtotal that does not add up", () => {
    const r = sample();
    line(r, "MFCR300", "10110").AMOUNT = 999; // notes; TOTAL CASH 10140 no longer = notes + coins
    const issue = validateReturn(r).issues.find((i) => i.rule === "arithmetic")!;
    expect(issue.message).toMatch(/10140/);
  });

  it("flags a schedule that does not reconcile to its balance-sheet line", () => {
    const r = sample();
    sheet(r, "MFCR304").rows[0].AMOUNT = 1; // MFCR300 10240 money at call = sum of MFCR304
    const issue = validateReturn(r).issues.find((i) => i.rule === "reconciliation")!;
    expect(issue.message).toMatch(/MFCR304/);
    expect(issue.message).toMatch(/10240/);
  });

  // "Specify MFCR xxx" lines that reconcile in both the sample workbook and CBN's accepted call reports.
  it.each([
    ["MFCR316", "CARRYING_VALUE", "10380"],
    ["MFCR338", "OUTSTANDING_AMOUNT", "11730"],
    ["MFCR346", "TOTAL_OUTSTANDING", "11750"],
    ["MFCR348", "OUTSTANDING_AMOUNT", "11790"],
    ["MFCR353", "OUTSTANDING_AMOUNT", "11870"],
  ])("flags %s %s that does not reconcile to MFCR300 line %s", (schedule, column, code) => {
    const r = sample();
    const row = sheet(r, schedule).rows[0];
    row[column] = (row[column] as number) + 1000;
    const issue = validateReturn(r).issues.find((i) => i.rule === "reconciliation" && i.message.includes(schedule));
    expect(issue?.message).toMatch(new RegExp(code));
  });

  it("tolerates rounding differences under 1 kobo", () => {
    const r = sample();
    const cash = line(r, "MFCR300", "10140");
    cash.AMOUNT = (cash.AMOUNT as number) + 0.004;
    expect(rules(r)).not.toContain("arithmetic");
  });

  it("carries parse issues through", () => {
    const r = sample();
    r.issues.push({ severity: "error", rule: "header-mismatch", message: "x" });
    expect(rules(r)).toContain("header-mismatch");
  });
});
