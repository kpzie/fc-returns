import { getStore } from "@/lib/store";
import { defaultExporter, packageXmlZip, zipFileName } from "@/lib/returns/xml";

export const runtime = "nodejs";

/** Zip of one CBN call report XML per sheet. Refused while the return has validation errors. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) return new Response("Not found", { status: 404 });
  if (rec.status === "needs-fixes") {
    return new Response("This return has validation errors. Fix them in the source and re-upload before exporting XML.", { status: 409 });
  }
  const zip = packageXmlZip(defaultExporter.buildFiles(rec.parsed));
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName(rec.parsed)}"`,
    },
  });
}
