import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { DuplicateUploadError, ingestWorkbook } from "@/lib/returns/ingest";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET() {
  return NextResponse.json(await getStore().list());
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an .xlsx file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx workbooks are accepted." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 413 });

  try {
    const rec = await ingestWorkbook(Buffer.from(await file.arrayBuffer()), file.name, getStore());
    return NextResponse.json({ id: rec.id, status: rec.status, counts: rec.counts, version: rec.version }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateUploadError) {
      return NextResponse.json({ error: e.message, existingId: e.existingId }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
