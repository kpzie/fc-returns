import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { create } from "xmlbuilder2";
import { parseWorkbook } from "@/lib/returns/parse";
import { computeKpis } from "@/lib/returns/kpis";
import { draftXmlExporter } from "@/lib/returns/xml";
import type { ParsedReturn } from "@/lib/returns/types";

const fixture = readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx"));
let base: ParsedReturn;
beforeAll(async () => {
  base = await parseWorkbook(fixture);
});
const kpi = (r: ParsedReturn, id: string) => computeKpis(r).find((k) => k.id === id)!;

describe("computeKpis", () => {
  it("reads total assets from MFCR300 line 12510", () => {
    const k = kpi(base, "total_assets");
    expect(k.value).toBe(356530.51);
    expect(k.source).toBe("MFCR300 · 12510");
  });

  it("computes capital-to-assets as capital & reserves / total assets", () => {
    expect(kpi(base, "capital_to_assets").value).toBeCloseTo(365331.5 / 356530.51, 10);
  });

  it("computes cost-to-income from the current month", () => {
    expect(kpi(base, "cost_to_income").value).toBeCloseTo(35284.5 / 5250, 10);
  });

  it("returns null, not zero, when a source line is missing", () => {
    const r = structuredClone(base);
    const bs = r.sheets.find((s) => s.id === "MFCR300")!;
    bs.rows = bs.rows.filter((x) => x.CODE !== "12510");
    expect(kpi(r, "total_assets").value).toBeNull();
    expect(kpi(r, "capital_to_assets").value).toBeNull();
  });

  it("returns null for a ratio with a zero denominator", () => {
    const r = structuredClone(base);
    r.sheets.find((s) => s.id === "MFCR1000")!.rows.find((x) => x.CODE === "30440")!.CURRENT_MONTH = 0;
    expect(kpi(r, "cost_to_income").value).toBeNull();
  });
});

describe("draftXmlExporter", () => {
  let xml: string;
  beforeAll(() => {
    xml = draftXmlExporter.build(base);
  });

  it("is marked as a draft that must not be submitted", () => {
    expect(draftXmlExporter.isDraft).toBe(true);
    expect(xml).toMatch(/NOT FOR SUBMISSION/);
  });

  it("is well-formed XML with one CALLREPORT per sheet", () => {
    const doc = create(xml).end({ format: "object" }) as { FC_RETURN: { CALLREPORT: unknown[] } };
    expect(doc.FC_RETURN.CALLREPORT).toHaveLength(76);
  });

  it("writes FC_CODE without a decimal and keeps leading zeros", () => {
    expect(xml).toContain("<FC_CODE>40196</FC_CODE>");
    expect(xml).not.toContain("40196.0");
    expect(xml).toContain("<INSTITUTION_CODE>00057</INSTITUTION_CODE>");
  });

  it("omits empty cells instead of writing empty elements", () => {
    const r = structuredClone(base);
    const heading = r.sheets.find((s) => s.id === "MFCR300")!.rows.find((x) => x.CODE === "10100")!;
    expect(heading.AMOUNT).toBeNull();
    const out = draftXmlExporter.build(r);
    expect(out).toMatch(/<CODE>10100<\/CODE>\s*<ITEM_DESCRIPTION>FINANCIAL ASSETS<\/ITEM_DESCRIPTION>\s*<\/ITEM>/);
  });

  it("escapes special characters in text", () => {
    const r = structuredClone(base);
    r.fcName = "A & B <Finance>";
    r.sheets[0].fcName = r.fcName;
    const out = draftXmlExporter.build(r);
    expect(out).toContain("A &amp; B &lt;Finance&gt;");
  });
});
