import { create } from "xmlbuilder2";
import type { ParsedReturn } from "./types";

/**
 * One XML format per exporter. When CBN supplies the official XSD/spec, add a
 * new exporter that implements it (validated against the XSD) and make it the
 * default; nothing else in the app has to change.
 */
export interface XmlExporter {
  id: string;
  label: string;
  isDraft: boolean; // drafts are never offered as "ready to submit"
  build(ret: ParsedReturn): string;
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_");
export const xmlFileName = (ret: ParsedReturn, exporter: XmlExporter) =>
  `${fileSafe(ret.fcCode)}_${fileSafe(ret.asAt)}${exporter.isDraft ? "_DRAFT" : ""}.xml`;

/**
 * PROVISIONAL format. It mirrors the Excel template 1:1 (CALLREPORT header
 * fields, then CALLREPORT_DATA items using the template's column names),
 * because the template describes itself in those terms. It is NOT CBN's
 * official format, which has not been obtained yet.
 */
export const draftXmlExporter: XmlExporter = {
  id: "draft-template-mirror",
  label: "Draft XML (mirrors the Excel template — not CBN's official format)",
  isDraft: true,
  build(ret) {
    const doc = create({ version: "1.0", encoding: "UTF-8" })
      .com(" DRAFT - NOT FOR SUBMISSION. Provisional structure mirroring the Excel template; replace with CBN's official XML format before filing. ")
      .ele("FC_RETURN", { STATUS: "DRAFT-NOT-FOR-SUBMISSION" })
      .ele("FC_CODE").txt(ret.fcCode).up()
      .ele("FC_NAME").txt(ret.fcName).up()
      .ele("AS_AT").txt(ret.asAt).up();

    for (const s of ret.sheets) {
      const report = doc.ele("CALLREPORT");
      report.ele("CALLREPORT_ID").txt(s.id);
      report.ele("CALLREPORT_DESCRIPTION").txt(s.description);
      report.ele("FC_CODE").txt(s.fcCode);
      report.ele("FC_NAME").txt(s.fcName);
      report.ele("AS_AT").txt(s.asAt);
      const data = report.ele("CALLREPORT_DATA");
      for (const row of s.rows) {
        const item = data.ele("ITEM");
        for (const col of s.columns) {
          const v = row[col];
          if (v === null || v === undefined) continue;
          item.ele(col).txt(String(v));
        }
      }
    }
    return doc.end({ prettyPrint: true });
  },
};

export const XML_EXPORTERS: XmlExporter[] = [draftXmlExporter];
export const defaultExporter = draftXmlExporter;
