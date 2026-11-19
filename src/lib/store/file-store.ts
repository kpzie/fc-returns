import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Actor } from "../auth/roles";
import { assertSubmittable, personOf, sortSummaries, summarise, type ReturnRecord, type ReturnStore, type ReturnSummary } from "./types";

/**
 * Local development store: one JSON file + the original .xlsx per upload.
 * Not for production — use SupabaseStore there.
 */
export class FileStore implements ReturnStore {
  constructor(private readonly dir: string) {}

  private json(id: string) {
    return path.join(this.dir, `${id}.json`);
  }
  private xlsx(id: string) {
    return path.join(this.dir, `${id}.xlsx`);
  }

  private async all(): Promise<ReturnRecord[]> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));
    return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(this.dir, f), "utf8")) as ReturnRecord));
  }

  async list() {
    return sortSummaries((await this.all()).map(summarise));
  }

  async get(id: string) {
    if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
    try {
      return JSON.parse(await readFile(this.json(id), "utf8")) as ReturnRecord;
    } catch {
      return null;
    }
  }

  async getOriginal(id: string) {
    if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
    try {
      return await readFile(this.xlsx(id));
    } catch {
      return null;
    }
  }

  async findByHash(sha256: string) {
    const hit = (await this.all()).find((r) => r.fileSha256 === sha256);
    return hit ? summarise(hit) : null;
  }

  async latestVersion(fcCode: string, asAt: string) {
    return Math.max(0, ...(await this.all()).filter((r) => r.fcCode === fcCode && r.asAt === asAt).map((r) => r.version));
  }

  async insert(record: ReturnRecord, original: Buffer) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.xlsx(record.id), original);
    await writeFile(this.json(record.id), JSON.stringify(record));
  }

  async markSubmitted(id: string, by: Actor): Promise<ReturnSummary> {
    const rec = await this.get(id);
    assertSubmittable(rec, id);
    const updated: ReturnRecord = { ...(rec as ReturnRecord), status: "submitted", submittedAt: new Date().toISOString(), submittedBy: personOf(by) };
    await writeFile(this.json(id), JSON.stringify(updated));
    return summarise(updated);
  }
}
