/**
 * Who may do what. Pure — no framework or Supabase imports.
 * The database enforces the same rules again with RLS (supabase/migrations/0002_auth_roles.sql).
 */
export const ROLES = ["uploader", "approver"] as const;
export type Role = (typeof ROLES)[number];

/** A signed-in user. `roles` come from public.fc_user_roles. */
export interface Actor {
  id: string;
  email: string;
  roles: Role[];
}

export type Action = "view" | "upload" | "submit";

const NEEDS: Record<Action, readonly Role[]> = {
  view: ROLES,
  upload: ["uploader"],
  submit: ["approver"],
};

export function can(actor: Actor | null, action: Action): boolean {
  return !!actor && actor.roles.some((r) => NEEDS[action].includes(r));
}

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function authorize(actor: Actor | null, action: Action): asserts actor is Actor {
  if (!actor) throw new AuthError(401, "Sign in to continue.");
  if (!can(actor, action)) {
    const roles = NEEDS[action].join(" or ");
    throw new AuthError(403, `You need the ${roles} role to ${action === "view" ? "view returns" : `${action} returns`}.`);
  }
}

export function parseRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is Role => (ROLES as readonly unknown[]).includes(v)))];
}
