import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { submitReturn } from "@/lib/returns/ingest";
import { getActor } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/guard";

export const runtime = "nodejs";

/** Records that this version was filed with CBN. Approvers only. Locks it (see migration trigger). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await submitReturn(id, await getStore(), await getActor()));
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 409 });
  }
}
