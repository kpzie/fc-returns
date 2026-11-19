# FC Returns

Web app for a CBN-licensed finance company's monthly return (MFCR/SFCR workbook, 76 sheets):

1. **Upload** the `.xlsx` exported from the reporting system.
2. **Validate**: checks the structure, cell values, totals and schedule reconciliations. Errors show the sheet, column and row.
3. **Store**: each upload for a period is saved as a new version with the original file. Uploading the same file twice is refused.
4. **Dashboard**: KPI tiles from MFCR300/MFCR1000, with change vs the prior period and a trend chart.
5. **Export XML**: only from a version with no errors. A zip with one XML file per call report, in the format of CBN-accepted files.
6. **Mark as submitted**: records the filing. Submitted versions are locked in the database.

## Status: what is and isn't done

| Area | State |
|---|---|
| Parser, validation, KPIs, versioning, UI | Built and tested against the sample template |
| XML export | Matches the 69 CBN-accepted MFCR files (structure for all, byte-for-byte for the 38 whose data matches the sample workbook). SFCR files are kept in a separate `SFCR-format-not-verified/` folder until confirmed. No XSD exists. |
| Supabase store | Written and type-checked, **not yet run against a live project** |
| Login / roles | **Not built.** Required before real data goes in. |
| KPI list | Proposed set. Needs management sign-off. |
| Validation rules | Taken from the template's line descriptions. Each rule was checked against the template's own sample figures. Extend as CBN feedback comes in (`src/lib/returns/rules.ts`). |

## Run locally

```bash
npm install
npm test          # tests against test/fixtures/sample-return.xlsx and the CBN-accepted XMLs
npm run dev       # http://localhost:3000 (uploads stored in ./.data)
```

## Deploy (Vercel + Supabase)

1. Create a Supabase project. Run `supabase/migrations/0001_returns.sql` in the SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (server-only), as in `.env.example`.
3. Add authentication before go-live. Supabase Auth is the natural fit; the RLS policies are a starting point.

Choose the Supabase region and access rules with the client. This is regulated financial data.

## Code map

```
src/lib/returns/
  parse.ts       workbook → normalised return (header block, 2 sheet shapes, code/date/zero handling)
  template.json  expected sheets + columns (regenerate: npx tsx scripts/build-template.ts <template.xlsx>)
  rules.ts       arithmetic + cross-sheet reconciliation rules
  validate.ts    structure, cell, arithmetic and reconciliation checks
  kpis.ts        dashboard KPI definitions
  xml.ts         CBN call report XML (one file per sheet) + zip
  ingest.ts      hash → parse → validate → KPIs → versioned save
  trend.ts       KPI history per finance company
src/lib/store/   FileStore (dev) and SupabaseStore (prod) behind one interface
src/app/         pages + API routes (/api/returns, /xml, /original, /submit)
```

## XML format

The reference is `test/fixtures/accepted-xml/`: call report XMLs that CBN accepted, supplied by the client. To change the format, add the new accepted files there first, then let the tests in `test/cbn-xml.test.ts` drive the change.

## When CBN changes the template

Regenerate `template.json` from the new workbook. The validator then reports missing or extra sheets and columns. Review `rules.ts` for codes that moved.
