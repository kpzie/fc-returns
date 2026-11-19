import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseWorkbook } from "@/lib/returns/parse";
import type { ParsedReturn } from "@/lib/returns/types";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));

describe("parseWorkbook on the sample FC return", () => {
  let ret: ParsedReturn;
  beforeAll(async () => {
    ret = await parseWorkbook(fixture);
  });

  it("reads every sheet in the workbook", () => {
    expect(ret.sheets).toHaveLength(76);
  });

  it("reads the return header and normalises FC_CODE to an integer string", () => {
    expect(ret.fcCode).toBe("40196");
    expect(ret.fcName).toBe("CANARY POINT FINANCE COMPANY LIMITED");
    expect(ret.asAt).toBe("2026-03-31");
  });

  it("classifies CODE-keyed sheets as line-item returns", () => {
    expect(ret.sheets.find((s) => s.id === "MFCR300")!.kind).toBe("line-items");
    expect(ret.sheets.find((s) => s.id === "MFCR1000")!.kind).toBe("line-items");
    expect(ret.sheets.find((s) => s.id === "MFCR304")!.kind).toBe("schedule");
  });

  it("normalises line-item codes from floats to integer strings", () => {
    const bs = ret.sheets.find((s) => s.id === "MFCR300")!;
    const cash = bs.rows.find((r) => r.CODE === "10140");
    expect(cash).toBeDefined();
    expect(cash!.AMOUNT).toBe(504.5);
  });

  it("keeps leading zeros on institution codes", () => {
    const s = ret.sheets.find((s) => s.id === "MFCR304")!;
    expect(s.rows[0].INSTITUTION_CODE).toBe("00057");
  });

  it("stops at the first blank row on long schedules", () => {
    expect(ret.sheets.find((s) => s.id === "MFCR304")!.rows).toHaveLength(2);
    expect(ret.sheets.find((s) => s.id === "MFCR379")!.rows).toHaveLength(13);
  });

  it("finds the column header row when it is not on row 8 (MFCR351)", () => {
    const s = ret.sheets.find((s) => s.id === "MFCR351")!;
    expect(s.columns[0]).toBe("S_N");
    expect(s.columns[1]).toBe("OBLIGOR");
    expect(s.headerRow).toBe(9);
  });

  it("keeps section-heading rows with a null amount", () => {
    const bs = ret.sheets.find((s) => s.id === "MFCR300")!;
    const heading = bs.rows.find((r) => r.CODE === "10100");
    expect(heading).toBeDefined();
    expect(heading!.AMOUNT).toBeNull();
  });

  it("reports no parse issues on the clean sample", () => {
    expect(ret.issues).toEqual([]);
  });
});

describe("parseWorkbook on bad input", () => {
  it("rejects a file that is not an xlsx workbook", async () => {
    await expect(parseWorkbook(Buffer.from("not a workbook"))).rejects.toThrow(/not a valid .xlsx/i);
  });
});
