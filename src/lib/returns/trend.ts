import type { ReturnStore } from "../store/types";
import type { Kpi } from "./kpis";

export interface TrendPoint {
  asAt: string;
  version: number;
  kpis: Kpi[];
}

/** KPIs per period for one finance company, oldest first, from the latest version without errors. */
export async function loadTrend(store: ReturnStore, fcCode: string): Promise<TrendPoint[]> {
  const clean = (await store.list()).filter((r) => r.fcCode === fcCode && r.status !== "needs-fixes");
  const latest = new Map<string, (typeof clean)[number]>();
  for (const r of clean) {
    const seen = latest.get(r.asAt);
    if (!seen || r.version > seen.version) latest.set(r.asAt, r);
  }
  const picks = [...latest.values()].sort((a, b) => a.asAt.localeCompare(b.asAt));
  const records = await Promise.all(picks.map((p) => store.get(p.id)));
  return records.filter((r) => r !== null).map((r) => ({ asAt: r.asAt, version: r.version, kpis: r.kpis }));
}
