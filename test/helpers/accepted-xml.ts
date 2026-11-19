import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TEMPLATE } from "@/lib/returns/validate";
import type { ParsedReturn, ParsedSheet, Row } from "@/lib/returns/types";

export const ACCEPTED_DIR = path.join(__dirname, "../fixtures/accepted-xml");
const tag = (x: string, n: string) => x.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1] ?? "";
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const isCode = (c: string) => c === "CODE" || c === "S_N" || c.endsWith("_CODE");

/** Reads the CBN-accepted call report XMLs back into a ParsedReturn (test use only). */
export function readAcceptedReturn(): ParsedReturn {
  const sheets: ParsedSheet[] = readdirSync(ACCEPTED_DIR).map((f) => {
    const x = readFileSync(path.join(ACCEPTED_DIR, f), "utf8").replace(/^﻿/, "");
    const id = tag(x, "CALLREPORT_ID");
    const t = TEMPLATE.sheets.find((s) => s.id === id)!;
    const rows: Row[] = [...x.matchAll(/<CALLREPORT_DATA>([\s\S]*?)<\/CALLREPORT_DATA>/g)].map((m) => {
      const r: Row = {};
      for (const [, col, raw] of m[1].matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)) {
        const v = unescape(raw);
        r[col] = v === "" ? null : !isCode(col) && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      }
      return r;
    });
    return {
      id,
      description: unescape(tag(x, "CALLREPORT_DESCRIPTION")),
      fcCode: tag(x, "FC_CODE"),
      fcName: unescape(tag(x, "FC_NAME")),
      asAt: tag(x, "AS_AT"),
      kind: t.kind,
      headerRow: 8,
      columns: t.columns,
      rows,
    };
  });
  const first = sheets.find((s) => s.id === "MFCR300")!;
  return { fcCode: first.fcCode, fcName: first.fcName, asAt: first.asAt, sheets, issues: [] };
}
