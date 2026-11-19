/**
 * Arithmetic and reconciliation rules for the FC monthly return.
 *
 * Source: derived from the line descriptions in the CBN FC return template
 * (e.g. "TOTAL CASH", "Specify MFCR 304"). Every rule below was checked
 * against the template's own sample figures, which reconcile for these lines.
 * CBN has not published a rulebook for this return, so treat this list as
 * ours to maintain: add rules as CBN feedback or guidance confirms them.
 */

/** total = sum(plus) - sum(minus), on one line-item sheet. */
export interface ArithmeticRule {
  sheet: string;
  columns: string[]; // value columns the identity holds for
  total: string; // line code
  plus: string[];
  minus?: string[];
  label: string;
}

/** A line on a line-item sheet must equal the sum of a schedule column. */
export interface ReconciliationRule {
  line: { sheet: string; codes: string[]; column: string }; // sum of these codes
  schedule: { sheets: string[]; column: string }; // sum of this column across sheets
  label: string;
}

const BS = { sheet: "MFCR300", columns: ["AMOUNT"] };
const PL = { sheet: "MFCR1000", columns: ["CURRENT_MONTH", "YEAR_TO_DATE"] };

export const ARITHMETIC_RULES: ArithmeticRule[] = [
  // Statement of financial position (MFCR300)
  { ...BS, total: "10140", plus: ["10110", "10120"], label: "Total cash = notes + coins" },
  { ...BS, total: "10190", plus: ["10170", "10180", "10185"], label: "Total due from banks in Nigeria" },
  { ...BS, total: "10230", plus: ["10210", "10220"], label: "Total due from banks outside Nigeria" },
  { ...BS, total: "10240", plus: ["10250", "10260"], label: "Money at call" },
  { ...BS, total: "10270", plus: ["10280", "10290", "10295"], label: "Bank placements" },
  { ...BS, total: "10300", plus: ["10310", "10320"], label: "Discount houses" },
  { ...BS, total: "10330", plus: ["10190", "10230", "10240", "10270", "10300"], label: "Total due from" },
  { ...BS, total: "10380", plus: ["10360", "10370"], label: "Total derivative financial assets" },
  { ...BS, total: "11500", plus: ["11480"], minus: ["11490"], label: "Net bills payable from banks in Nigeria" },
  { ...BS, total: "11530", plus: ["11510"], minus: ["11520"], label: "Net bills payable from banks outside Nigeria" },
  { ...BS, total: "11560", plus: ["11540"], minus: ["11550"], label: "Net bills from non-bank sources" },
  { ...BS, total: "11570", plus: ["11500", "11530", "11560"], label: "Net total bills discounted" },
  { ...BS, total: "11610", plus: ["11590"], minus: ["11600"], label: "Net banker's acceptances" },
  { ...BS, total: "11640", plus: ["11620"], minus: ["11630"], label: "Net commercial papers" },
  { ...BS, total: "11670", plus: ["11650"], minus: ["11660"], label: "Net promissory notes" },
  { ...BS, total: "11700", plus: ["11680"], minus: ["11690"], label: "Net other financial assets" },
  { ...BS, total: "11710", plus: ["11610", "11640", "11670", "11700"], label: "Net other financial assets held" },
  { ...BS, total: "11930", plus: ["11910"], minus: ["11920"], label: "Net loans/receivables and leases" },
  { ...BS, total: "12130", plus: ["12110"], minus: ["12120"], label: "Net investment in subsidiaries/associates" },
  { ...BS, total: "12170", plus: ["12150"], minus: ["12160"], label: "Other assets net" },
  { ...BS, total: "12200", plus: ["12180"], minus: ["12190"], label: "Net intangible assets" },
  { ...BS, total: "12210", plus: ["12170", "12200"], label: "Net other and intangible assets" },
  { ...BS, total: "12240", plus: ["12220"], minus: ["12230"], label: "Net non-current assets held for sale" },
  { ...BS, total: "12510", plus: ["12090", "12505"], label: "Total assets" },
  { ...BS, total: "20180", plus: ["20120", "20130", "20140", "20150", "20160", "20170"], label: "Total borrowings" },
  { ...BS, total: "20230", plus: ["20210", "20220"], label: "Total negotiable certificates of deposit" },
  { ...BS, total: "20470", plus: ["20430", "20440", "20450", "20460"], label: "Total debentures/loan stock" },
  { ...BS, total: "20560", plus: ["20520", "20550"], label: "Total capital" },
  { ...BS, total: "20780", plus: ["20710", "20720", "20730", "20740", "20750", "20760", "20770"], label: "Total contingent liabilities" },

  // Statement of comprehensive income (MFCR1000)
  { ...PL, total: "30180", plus: ["30120", "30130", "30140", "30150", "30160", "30170"], label: "Total interest income" },
  { ...PL, total: "30230", plus: ["30200", "30220"], label: "Total interest expense" },
  { ...PL, total: "30240", plus: ["30180"], minus: ["30230"], label: "Net interest income" },
  { ...PL, total: "30290", plus: ["30260", "30270", "30280"], label: "Total fees & commission income" },
  { ...PL, total: "30310", plus: ["30290"], minus: ["30300"], label: "Net fees & commission income" },
  { ...PL, total: "30400", plus: ["30330", "30340", "30350", "30360", "30370", "30390"], label: "Total trading income" },
  { ...PL, total: "30420", plus: ["30240", "30310", "30400", "30410"], label: "Operating income" },
  { ...PL, total: "30440", plus: ["30420", "30430"], label: "Total operating income" },
  { ...PL, total: "30550", plus: ["30460", "30470", "30480", "30490", "30500", "30510", "30520", "30530", "30540"], label: "Total operating expenses" },
  { ...PL, total: "30560", plus: ["30440"], minus: ["30550"], label: "Net profit/(loss) before tax" },
  { ...PL, total: "30600", plus: ["30560"], minus: ["30590"], label: "Profit/(loss) after tax" },
  { ...PL, total: "30790", plus: ["30770"], minus: ["30780"], label: "Total OCI after tax" },
  { ...PL, total: "30800", plus: ["30600", "30790"], label: "Comprehensive income for the period" },
];

export const RECONCILIATION_RULES: ReconciliationRule[] = [
  {
    line: { sheet: "MFCR300", codes: ["10190"], column: "AMOUNT" },
    schedule: { sheets: ["MFCR302"], column: "AMOUNT" },
    label: "Due from banks in Nigeria = MFCR302 schedule",
  },
  {
    line: { sheet: "MFCR300", codes: ["10240"], column: "AMOUNT" },
    schedule: { sheets: ["MFCR304"], column: "AMOUNT" },
    label: "Money at call = MFCR304 schedule",
  },
  {
    line: { sheet: "MFCR300", codes: ["10270", "10300"], column: "AMOUNT" },
    schedule: { sheets: ["MFCR308"], column: "AMOUNT" },
    label: "Bank and discount-house placements = MFCR308 schedule",
  },
  {
    line: { sheet: "MFCR300", codes: ["11910"], column: "AMOUNT" },
    schedule: { sheets: ["MFCR350"], column: "OPENING_CARRYING_AMOUNT" },
    label: "Total loans/receivables and leases = MFCR350 schedule",
  },
  {
    line: { sheet: "MFCR300", codes: ["20180"], column: "AMOUNT" },
    schedule: { sheets: ["MFCR381"], column: "OUTSTANDING_AMOUNT" },
    label: "Total borrowings = MFCR381 schedule",
  },
];

/** Money amounts are compared to the nearest kobo. */
export const TOLERANCE = 0.01;
