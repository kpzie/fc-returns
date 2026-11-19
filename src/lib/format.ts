import type { Kpi } from "./returns/kpis";

const amount = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-NG", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Amounts are shown as reported in the return (no currency unit is assumed). */
export function formatKpi(k: Pick<Kpi, "unit" | "value">): string {
  if (k.value === null) return "—";
  return k.unit === "ratio" ? pct.format(k.value) : amount.format(k.value);
}

export function formatPeriod(asAt: string): string {
  const d = new Date(`${asAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return asAt;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export const STATUS_LABEL = { "needs-fixes": "Needs fixes", validated: "Validated", submitted: "Submitted" } as const;
