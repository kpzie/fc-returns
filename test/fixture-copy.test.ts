import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ingestWorkbook } from "@/lib/returns/ingest";
import { FileStore } from "@/lib/store/file-store";
import type { Actor } from "@/lib/auth/roles";
import { fixture, fixtureCopy } from "./helpers/fixture-copy";

const uploader: Actor = { id: "u1", email: "uploader@example.test", roles: ["uploader"] };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** The live Supabase test reuses one project across runs, so each run needs its own FC code and file hash. */
describe("fixtureCopy", () => {
  it("re-codes every sheet so the copy is a different file that still validates clean", async () => {
    const copy = await fixtureCopy({ fcCode: "90001" });
    expect(sha(copy)).not.toBe(sha(fixture));
    const rec = await ingestWorkbook(copy, "copy.xlsx", new FileStore(mkdtempSync(path.join(tmpdir(), "fc-copy-"))), uploader);
    expect(rec.fcCode).toBe("90001");
    expect(rec.status).toBe("validated");
  });

  it("can also break a reconciliation, for a needs-fixes version", async () => {
    const copy = await fixtureCopy({ fcCode: "90001", breakReconciliation: true });
    const rec = await ingestWorkbook(copy, "broken.xlsx", new FileStore(mkdtempSync(path.join(tmpdir(), "fc-copy-"))), uploader);
    expect(rec.status).toBe("needs-fixes");
  });
});
