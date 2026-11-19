import type { ParsedReturn } from "./types";

export type KpiUnit = "NGN" | "ratio";
export type KpiGroup = "Balance sheet" | "Income (current month)" | "Ratios";

export interface Kpi {
  id: string;
  label: string;
  group: KpiGroup;
  unit: KpiUnit;
  value: number | null; // null = source line missing or ratio undefined
  source: string; // where the number comes from, shown on the dashboard
}

/**
 * Management KPIs. These are the client's view of the return, not CBN's
 * prudential ratio definitions — confirm the list and formulas with management.
 */
interface LineRef {
  sheet: "MFCR300" | "MFCR1000";
  code: string;
}
const BS = (code: string): LineRef => ({ sheet: "MFCR300", code });
const PL = (code: string): LineRef => ({ sheet: "MFCR1000", code });

type Def =
  | { id: string; label: string; group: KpiGroup; line: LineRef }
  | { id: string; label: string; group: KpiGroup; num: LineRef[]; den: LineRef };

const DEFS: Def[] = [
  { id: "total_assets", label: "Total assets", group: "Balance sheet", line: BS("12510") },
  { id: "gross_loans", label: "Loans, receivables & leases (gross)", group: "Balance sheet", line: BS("11910") },
  { id: "net_loans", label: "Net loans, receivables & leases", group: "Balance sheet", line: BS("11930") },
  { id: "total_investments", label: "Total investments", group: "Balance sheet", line: BS("11380") },
  { id: "total_borrowings", label: "Total borrowings", group: "Balance sheet", line: BS("20180") },
  { id: "capital_reserves", label: "Total capital & reserves", group: "Balance sheet", line: BS("20680") },
  { id: "net_interest_income", label: "Net interest income", group: "Income (current month)", line: PL("30240") },
  { id: "operating_income", label: "Total operating income", group: "Income (current month)", line: PL("30440") },
  { id: "operating_expenses", label: "Total operating expenses", group: "Income (current month)", line: PL("30550") },
  { id: "profit_before_tax", label: "Profit/(loss) before tax", group: "Income (current month)", line: PL("30560") },
  { id: "profit_after_tax", label: "Profit/(loss) after tax", group: "Income (current month)", line: PL("30600") },
  { id: "capital_to_assets", label: "Capital & reserves / total assets", group: "Ratios", num: [BS("20680")], den: BS("12510") },
  { id: "impairment_coverage", label: "Loan impairment / gross loans", group: "Ratios", num: [BS("11920")], den: BS("11910") },
  { id: "liquid_assets_ratio", label: "Cash & due from banks / total assets", group: "Ratios", num: [BS("10140"), BS("10330")], den: BS("12510") },
  { id: "loans_to_assets", label: "Net loans / total assets", group: "Ratios", num: [BS("11930")], den: BS("12510") },
  { id: "cost_to_income", label: "Cost-to-income", group: "Ratios", num: [PL("30550")], den: PL("30440") },
];

const VALUE_COLUMN: Record<LineRef["sheet"], string> = { MFCR300: "AMOUNT", MFCR1000: "CURRENT_MONTH" };

function read(ret: ParsedReturn, ref: LineRef): number | null {
  const row = ret.sheets.find((s) => s.id === ref.sheet)?.rows.find((r) => r.CODE === ref.code);
  const v = row?.[VALUE_COLUMN[ref.sheet]];
  return typeof v === "number" ? v : null;
}

const cite = (refs: LineRef[]) => `${refs[0].sheet} · ${refs.map((r) => r.code).join(" + ")}`;

export function computeKpis(ret: ParsedReturn): Kpi[] {
  return DEFS.map((d) => {
    if ("line" in d) {
      return { id: d.id, label: d.label, group: d.group, unit: "NGN", value: read(ret, d.line), source: cite([d.line]) };
    }
    const parts = d.num.map((r) => read(ret, r));
    const den = read(ret, d.den);
    const value = parts.some((p) => p === null) || den === null || den === 0 ? null : (parts as number[]).reduce((a, b) => a + b, 0) / den;
    return { id: d.id, label: d.label, group: d.group, unit: "ratio", value, source: `${cite(d.num)} ÷ ${d.den.code}` };
  });
}
