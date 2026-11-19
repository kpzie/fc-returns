import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { parseWorkbook } from "@/lib/returns/parse";
import { buildCallReportXml, cbnXmlExporter, packageXmlZip } from "@/lib/returns/xml";
import type { ParsedReturn, ParsedSheet } from "@/lib/returns/types";

/**
 * Reference: XML files accepted by CBN (supplied by the client, test/fixtures/accepted-xml).
 * They use a test FC header and partly different figures from the sample workbook, so:
 *  - structure is checked for every file;
 *  - bytes are checked for every sheet whose data rows match the workbook.
 */
const ACCEPTED_DIR = path.join(__dirname, "fixtures/accepted-xml");
const accepted = Object.fromEntries(
  readdirSync(ACCEPTED_DIR).map((f) => [f.replace(/\.xml$/, ""), readFileSync(path.join(ACCEPTED_DIR, f))]),
);

const text = (buf: Buffer) => buf.toString("utf8").replace(/^﻿/, "");
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? "";
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** Data rows as arrays of [element, value]. */
const rows = (xml: string) =>
  [...xml.matchAll(/<CALLREPORT_DATA>([\s\S]*?)<\/CALLREPORT_DATA>/g)].map((m) =>
    [...m[1].matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)].map((c) => [c[1], unescape(c[2])]),
  );
/** Give our sheet the accepted file's header so the two can be compared byte-for-byte. */
function withHeaderOf(sheet: ParsedSheet, xml: string): ParsedSheet {
  return {
    ...sheet,
    description: unescape(tag(xml, "CALLREPORT_DESCRIPTION")),
    fcCode: tag(xml, "FC_CODE"),
    fcName: unescape(tag(xml, "FC_NAME")),
    asAt: tag(xml, "AS_AT"),
  };
}

let ret: ParsedReturn;
beforeAll(async () => {
  ret = await parseWorkbook(readFileSync(path.join(__dirname, "fixtures/sample-return.xlsx")));
});
const sheet = (id: string) => ret.sheets.find((s) => s.id === id)!;

describe("buildCallReportXml — structure matches every accepted file", () => {
  it("has an accepted sample for every MFCR sheet", () => {
    const mfcr = ret.sheets.filter((s) => s.id.startsWith("MFCR")).map((s) => s.id).sort();
    expect(Object.keys(accepted).sort()).toEqual(mfcr);
  });

  it.each(Object.keys(accepted))("%s: same header and the same columns, in order, on every row", (id) => {
    const ours = buildCallReportXml(sheet(id));
    const theirs = text(accepted[id]);
    const head = (x: string) => [...x.split("<BODY>")[0].matchAll(/<([A-Z_]+)>/g)].map((m) => m[1]);
    expect(head(ours)).toEqual(head(theirs));
    const cols = (x: string) => rows(x).map((r) => r.map(([k]) => k).join(","));
    expect(new Set(cols(ours))).toEqual(new Set(cols(theirs)));
  });
});

describe("buildCallReportXml — bytes match accepted files where the data is the same", () => {
  const sameData = () =>
    Object.keys(accepted).filter((id) => {
      const ours = buildCallReportXml(sheet(id));
      return JSON.stringify(rows(ours)) === JSON.stringify(rows(text(accepted[id])));
    });

  it("reproduces 38 accepted files exactly, including sheets whose workbook dates carry a time", () => {
    const ids = sameData();
    // The other 31 hold different figures in CBN's test files (checked: data differences only, no formatting).
    expect(ids).toHaveLength(38);
    for (const id of ["MFCR304", "MFCR308", "MFCR338", "MFCR1520"]) expect(ids).toContain(id);
  });

  it("is byte-identical (BOM, CRLF, indentation, empty elements) for every matching sheet", () => {
    for (const id of sameData()) {
      const ours = buildCallReportXml(withHeaderOf(sheet(id), text(accepted[id])));
      expect(Buffer.from(ours, "utf8").equals(accepted[id]), id).toBe(true);
    }
  });
});

describe("value formatting", () => {
  it("writes an empty cell as an open/close pair, never self-closing or omitted", () => {
    const xml = buildCallReportXml(sheet("MFCR300"));
    expect(xml).toMatch(/<CODE>10100<\/CODE>\r\n\s+<ITEM_DESCRIPTION>FINANCIAL ASSETS<\/ITEM_DESCRIPTION>\r\n\s+<AMOUNT><\/AMOUNT>/);
    expect(xml).not.toMatch(/<[A-Z_]+\/>/);
  });

  it("drops the time part of datetimes", () => {
    expect(buildCallReportXml(sheet("MFCR1520"))).toContain("<DATE_AUTHORISED>2026-04-29</DATE_AUTHORISED>");
  });

  it("writes FC_CODE as text and keeps leading zeros", () => {
    const xml = buildCallReportXml(sheet("MFCR304"));
    expect(xml).toContain("<FC_CODE>40196</FC_CODE>");
    expect(xml).toContain("<INSTITUTION_CODE>00057</INSTITUTION_CODE>");
  });

  it("writes numbers without float noise or exponent", () => {
    const s = structuredClone(sheet("MFCR304"));
    s.rows[0].AMOUNT = 0.1 + 0.2;
    s.rows[1].AMOUNT = 123456789012.5;
    const xml = buildCallReportXml(s);
    expect(xml).toContain("<AMOUNT>0.3</AMOUNT>");
    expect(xml).toContain("<AMOUNT>123456789012.5</AMOUNT>");
  });

  it("escapes &, < and > in text", () => {
    const s = structuredClone(sheet("MFCR304"));
    s.rows[0].BANK_NAME = "A & B <Bank>";
    expect(buildCallReportXml(s)).toContain("<BANK_NAME>A &amp; B &lt;Bank&gt;</BANK_NAME>");
  });
});

describe("cbnXmlExporter + packageXmlZip", () => {
  it("produces one file per call report, named <CALLREPORT_ID>.xml", () => {
    const files = cbnXmlExporter.buildFiles(ret);
    expect(files).toHaveLength(76);
    expect(files.find((f) => f.name === "MFCR300.xml")).toBeDefined();
  });

  it("puts SFCR sheets in a separate folder because no accepted sample covers them", () => {
    const names = cbnXmlExporter.buildFiles(ret).map((f) => f.name);
    expect(names.filter((n) => /^SFCR\d+\.xml$/.test(n))).toEqual([]);
    expect(names.filter((n) => n.startsWith("SFCR-format-not-verified/"))).toHaveLength(7);
  });

  it("zips the files so the zip unpacks to exactly what buildFiles returned", () => {
    const files = cbnXmlExporter.buildFiles(ret);
    const unzipped = unzipSync(packageXmlZip(files));
    expect(Object.keys(unzipped).sort()).toEqual(files.map((f) => f.name).sort());
    // compare bytes: TextDecoder would silently strip the BOM
    expect(Buffer.from(unzipped["MFCR304.xml"]).equals(Buffer.from(files.find((f) => f.name === "MFCR304.xml")!.content, "utf8"))).toBe(true);
    expect(strFromU8(unzipped["MFCR304.xml"].subarray(3, 8))).toBe("<?xml");
  });
});
