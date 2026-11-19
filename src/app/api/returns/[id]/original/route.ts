import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const [rec, file] = await Promise.all([store.get(id), store.getOriginal(id)]);
  if (!rec || !file) return new Response("Not found", { status: 404 });
  const safe = rec.fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}"`,
    },
  });
}
