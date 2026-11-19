import { getStore } from "@/lib/store";
import { defaultExporter, xmlFileName } from "@/lib/returns/xml";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) return new Response("Not found", { status: 404 });
  if (rec.status === "needs-fixes") {
    return new Response("This return has validation errors. Fix them in the source and re-upload before exporting XML.", { status: 409 });
  }
  const xml = defaultExporter.build(rec.parsed);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${xmlFileName(rec.parsed, defaultExporter)}"`,
    },
  });
}
