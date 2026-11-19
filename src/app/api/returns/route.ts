import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { DuplicateUploadError, ingestWorkbook } from "@/lib/returns/ingest";
import { getActor } from "@/lib/auth/session";
import { authErrorResponse, requireActor } from "@/lib/auth/guard";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET() {
  try {
    await requireActor("view");
    return NextResponse.json(await (await getStore()).list());
  } catch (e) {
    const auth = authErrorResponse(e);
    if (auth) return auth;
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    await requireActor("upload"); // before reading a 25 MB body from someone who can't upload
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an .xlsx file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx workbooks are accepted." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 413 });

  try {
    const rec = await ingestWorkbook(Buffer.from(await file.arrayBuffer()), file.name, await getStore(), await getActor());
    return NextResponse.json({ id: rec.id, status: rec.status, counts: rec.counts, version: rec.version }, { status: 201 });
  } catch (e) {
    const auth = authErrorResponse(e);
    if (auth) return auth;
    if (e instanceof DuplicateUploadError) {
      return NextResponse.json({ error: e.message, existingId: e.existingId }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
