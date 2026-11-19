import { describe, it, expect } from "vitest";
import { AuthError, authorize, can, parseRoles, type Actor } from "@/lib/auth/roles";

const uploader: Actor = { id: "u1", email: "up@example.test", roles: ["uploader"] };
const approver: Actor = { id: "a1", email: "ap@example.test", roles: ["approver"] };
const both: Actor = { id: "b1", email: "both@example.test", roles: ["uploader", "approver"] };
const noRole: Actor = { id: "n1", email: "none@example.test", roles: [] };

describe("can", () => {
  it("lets any staff role view returns, but not a signed-in user with no role or nobody", () => {
    expect(can(uploader, "view")).toBe(true);
    expect(can(approver, "view")).toBe(true);
    expect(can(noRole, "view")).toBe(false);
    expect(can(null, "view")).toBe(false);
  });

  it("only lets uploaders upload", () => {
    expect(can(uploader, "upload")).toBe(true);
    expect(can(approver, "upload")).toBe(false);
    expect(can(both, "upload")).toBe(true);
  });

  it("only lets approvers mark a return submitted", () => {
    expect(can(uploader, "submit")).toBe(false);
    expect(can(approver, "submit")).toBe(true);
    expect(can(both, "submit")).toBe(true);
  });
});

describe("authorize", () => {
  it("throws 401 when nobody is signed in", () => {
    expect(() => authorize(null, "view")).toThrow(AuthError);
    try {
      authorize(null, "view");
    } catch (e) {
      expect((e as AuthError).status).toBe(401);
    }
  });

  it("throws 403 when the signed-in user lacks the role", () => {
    try {
      authorize(uploader, "submit");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(403);
      expect((e as Error).message).toMatch(/approver/);
    }
  });

  it("passes when the role is held", () => {
    expect(() => authorize(approver, "submit")).not.toThrow();
  });
});

describe("parseRoles", () => {
  it("keeps known roles once and drops anything else", () => {
    expect(parseRoles(["approver", "admin", "uploader", "approver", 3, null])).toEqual(["approver", "uploader"]);
    expect(parseRoles(undefined)).toEqual([]);
  });
});
