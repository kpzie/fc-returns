import { zipSync, strToU8 } from "fflate";
import type { CellValue, ParsedReturn, ParsedSheet } from "./types";

/**
 * CBN submission XML: one file per call report.
 *
 * Source of truth: XML files accepted by CBN, supplied by the client
 * (test/fixtures/accepted-xml, 69 MFCR call reports). Format reproduced exactly:
 *   UTF-8 with BOM · CRLF · 2-space indent · no trailing newline
 *   <CALLREPORT><HEADER>5 fields</HEADER><BODY><CALLREPORT_DATA>…</CALLREPORT_DATA>…</BODY></CALLREPORT>
 *   every template column on every row, in template order; empty cell = <X></X>
 *   dates YYYY-MM-DD (time part dropped); numbers without trailing zeros.
 * No XSD has been supplied; tests compare against the accepted files instead.
 */

export interface XmlFile {
  name: string; // path inside the zip
  content: string; // includes the BOM
}

export interface XmlExporter {
  id: string;
  label: string;
  isDraft: boolean;
  buildFiles(ret: ParsedReturn): XmlFile[];
}

const BOM = "﻿";
const NL = "\r\n";
const DATETIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain decimal, no float noise (0.1+0.2 → "0.3"), never exponent notation. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(10).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function formatValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return formatNumber(v);
  const date = v.match(DATETIME);
  return escape(date ? date[1] : v);
}

const el = (indent: number, name: string, value: string) => `${" ".repeat(indent)}<${name}>${value}</${name}>`;

export function buildCallReportXml(sheet: ParsedSheet): string {
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<CALLREPORT>`,
    `  <HEADER>`,
    el(4, "CALLREPORT_ID", escape(sheet.id)),
    el(4, "CALLREPORT_DESCRIPTION", escape(sheet.description)),
    el(4, "FC_CODE", escape(sheet.fcCode)),
    el(4, "FC_NAME", escape(sheet.fcName)),
    el(4, "AS_AT", formatValue(sheet.asAt)),
    `  </HEADER>`,
    `  <BODY>`,
  ];
  for (const row of sheet.rows) {
    lines.push(`    <CALLREPORT_DATA>`);
    for (const col of sheet.columns) lines.push(el(6, col, formatValue(row[col])));
    lines.push(`    </CALLREPORT_DATA>`);
  }
  lines.push(`  </BODY>`, `</CALLREPORT>`);
  return BOM + lines.join(NL);
}

/** SFCR call reports have no accepted sample yet, so they are kept apart for a person to decide on. */
export const UNVERIFIED_FOLDER = "SFCR-format-not-verified";
const isVerified = (id: string) => id.startsWith("MFCR");

export const cbnXmlExporter: XmlExporter = {
  id: "cbn-callreport",
  label: "CBN call report XML (one file per call report)",
  isDraft: false,
  buildFiles(ret) {
    return ret.sheets.map((s) => ({
      name: isVerified(s.id) ? `${s.id}.xml` : `${UNVERIFIED_FOLDER}/${s.id}.xml`,
      content: buildCallReportXml(s),
    }));
  },
};

export function packageXmlZip(files: XmlFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.name, strToU8(f.content)])), { level: 6 });
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_");
export const zipFileName = (ret: ParsedReturn) => `${fileSafe(ret.fcCode)}_${fileSafe(ret.asAt)}_CBN_XML.zip`;

export const defaultExporter = cbnXmlExporter;
