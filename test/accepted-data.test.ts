import { describe, it, expect } from "vitest";
import { validateReturn } from "@/lib/returns/validate";
import { readAcceptedReturn } from "./helpers/accepted-xml";

describe("validation rules against CBN-accepted data", () => {
  it("raises no errors on accepted call reports, apart from the SFCR sheets they don't include", () => {
    const errors = validateReturn(readAcceptedReturn()).issues.filter((i) => i.severity === "error");
    const unexpected = errors.filter((i) => !(i.rule === "missing-sheet" && i.sheet?.startsWith("SFCR")));
    expect(unexpected).toEqual([]);
    expect(errors).toHaveLength(7);
  });

  it("raises no reconciliation warnings on accepted call reports", () => {
    const warnings = validateReturn(readAcceptedReturn()).issues.filter((i) => i.rule === "reconciliation");
    expect(warnings).toEqual([]);
  });

  // "Specify MFCR xxx" lines confirmed on accepted data only (the sample workbook's schedules are placeholders),
  // so they warn rather than block export until a real return confirms them.
  it.each([
    ["MFCR318", "NET_CARRYING_VALUE", "10520"],
    ["MFCR330", "NET_CARRYING_VALUE", "11250"],
    ["MFCR334", "AMOUNT", "11460"],
    ["MFCR350", "IMPAIRMENT_BALANCE_CLOSING", "11920"],
    ["MFCR350", "NET_CARRYING_AMOUNT", "11930"],
    ["MFCR351", "OUTSTANDING_AMOUNT", "11850"],
    ["MFCR352", "CARRYING_VALUE_AT_END_OF_THE_PERIOD", "12080"],
    ["MFCR354", "IMPAIRMENT", "12120"],
    ["MFCR356", "TOTAL", "12170"],
    ["MFCR358", "TOTAL", "12200"],
    ["MFCR360", "TOTAL", "12240"],
    ["MFCR364", "AMOUNT", "20710"],
    ["MFCR366", "AMOUNT", "20720"],
    ["MFCR368", "AMOUNT", "20730"],
    ["MFCR370", "AMOUNT", "20740"],
    ["MFCR372", "AMOUNT", "20750"],
    ["MFCR374", "AMOUNT", "20760"],
    ["MFCR376", "AMOUNT", "20770"],
    ["MFCR385", "CARRYING_VALUE", "20320"],
    ["MFCR387", "TOTAL", "20340"],
    ["MFCR390", "AMOUNT", "20610"],
  ])("warns when %s %s does not reconcile to MFCR300 line %s", (schedule, column, code) => {
    const r = readAcceptedReturn();
    const row = r.sheets.find((s) => s.id === schedule)!.rows.find((x) => typeof x[column] === "number")!;
    row[column] = (row[column] as number) + 1000;
    const hits = validateReturn(r).issues.filter(
      (i) => i.rule === "reconciliation" && i.message.includes(schedule) && i.message.includes(column) && i.message.includes(code),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("warning");
  });
});
