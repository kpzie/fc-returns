import "server-only";
import { NextResponse } from "next/server";
import { AuthError, authorize, type Action, type Actor } from "./roles";
import { getActor } from "./session";

/** The signed-in actor if they may perform `action`; otherwise throws AuthError (401/403). */
export async function requireActor(action: Action): Promise<Actor> {
  const actor = await getActor();
  authorize(actor, action);
  return actor;
}

/** JSON response for an AuthError, or null for any other error. */
export function authErrorResponse(e: unknown): NextResponse | null {
  return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null;
}
