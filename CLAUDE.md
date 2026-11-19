# FC Returns — project guide for Claude Code

Web app for a CBN-licensed finance company's **monthly regulatory return** (MFCR/SFCR Excel workbook, 76 sheets).
Flow: upload .xlsx → parse → validate → store versioned → KPI dashboard → export XML for submission to CBN.
The source app that produces the Excel is third-party; we cannot change its output.

## Commands
- `npm test` — vitest, all tests in `test/` (fixture: `test/fixtures/sample-return.xlsx`)
- `npm run typecheck` · `npx next lint` · `npm run build`
- `npm run dev` — local store in `./.data` when Supabase env vars are absent
- `npx tsx scripts/build-template.ts <workbook.xlsx>` — regenerate `src/lib/returns/template.json`

Run test + typecheck + lint + build before calling any change done.

## Architecture
- `src/lib/returns/` — pure domain logic, no framework imports. Keep it that way.
  - `parse.ts` workbook → `ParsedReturn`. Every sheet: header block B2:C6 (CALLREPORT_ID, CALLREPORT_DESCRIPTION, FC_CODE, FC_NAME, AS_AT), column headers on the first non-empty row from 7 (usually 8; MFCR351 is 9), data until the first fully blank row.
  - `validate.ts` + `rules.ts` structure, cell type, arithmetic, cross-sheet reconciliation.
  - `kpis.ts` dashboard KPIs · `xml.ts` CBN call report XML + zip · `ingest.ts` hash→parse→validate→save · `trend.ts`
- `src/lib/store/` — `ReturnStore` interface; `FileStore` (dev/tests) and `SupabaseStore` (prod). Schema: `supabase/migrations/`.
- `src/app/` — Next.js 15 App Router pages + route handlers under `/api/returns`.

## Domain rules — do not break
- **Identifiers are text.** FC_CODE/CODE arrive as floats (40196.0) → emit "40196". Institution codes keep leading zeros ("00057").
- **Dates** are text in the workbook (`YYYY-MM-DD`, sometimes with `T..:..:..`). `*_TO_DATE` columns are amounts, not dates.
- **Never fabricate CBN rules or formats.** Every rule in `rules.ts` must come from the template's line descriptions, CBN guidance, or client confirmation, and be checked against real figures. If unsure, ask — don't guess.
- **XML format = the CBN-accepted samples** in `test/fixtures/accepted-xml/` (69 MFCR files supplied by the client; no XSD exists).
  One file per call report, zipped. `test/cbn-xml.test.ts` checks structure against all 69 and byte-for-byte equality where the
  data matches — never weaken those tests to make a change pass. SFCR call reports have no accepted sample: they go in the
  `SFCR-format-not-verified/` folder of the zip until the client confirms how they are filed.
- `test/accepted-data.test.ts`: validation must raise no errors on CBN-accepted data. A new rule that fails it is wrong.
- A return with validation errors can never be exported or marked submitted. Submitted versions are immutable (DB trigger).
- Amounts are shown as reported — no currency/unit (₦ / ₦'000) is assumed until the client confirms.
- This is regulated financial data: no real client data in fixtures, logs or commits.

## Conventions
- TDD: write the failing test first, watch it fail, then implement. Tests use the real fixture, not mocks.
- Issues carry sheet / column / Excel row so users can find the cell.
- UI: status always icon + label (never colour alone); charts single-axis, with a table view.

## Backlog
See `docs/BACKLOG.md` — work top to bottom unless told otherwise.
