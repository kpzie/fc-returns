# FC Returns

Web app for a CBN-licensed finance company's monthly return (MFCR/SFCR workbook, 76 sheets):

1. **Upload** the `.xlsx` exported from the reporting system.
2. **Validate**: checks the structure, cell values, totals and schedule reconciliations. Errors show the sheet, column and row.
3. **Store**: each upload for a period is saved as a new version with the original file. Uploading the same file twice is refused.
4. **Dashboard**: KPI tiles from MFCR300/MFCR1000, with change vs the prior period and a trend chart.
5. **Export XML**: only from a version with no errors. *Currently a draft format, see below.*
6. **Mark as submitted**: approvers only. Records the filing and who made it. Submitted versions are locked in the database.

## Status: what is and isn't done

| Area | State |
|---|---|
| Parser, validation, KPIs, versioning, UI | Built and tested against the sample template |
| XML export | **DRAFT. Not CBN's format.** It mirrors the Excel template one-to-one. Replace it with CBN's official spec before filing (see "Plugging in the official XML"). |
| Supabase store | Written and type-checked, **not yet run against a live project** |
| Login / roles | Supabase Auth (email + password). Roles `uploader` / `approver`, enforced in the app and again by RLS (tested against real Postgres via PGlite). Not yet run against a live project. |
| KPI list | Proposed set. Needs management sign-off. |
| Validation rules | Taken from the template's line descriptions. Each rule was checked against the template's own sample figures. Extend as CBN feedback comes in (`src/lib/returns/rules.ts`). |

## Run locally

```bash
npm install
npm test          # 67 tests, against test/fixtures/sample-return.xlsx
npm run dev       # http://localhost:3000 (uploads stored in ./.data; no login, you are dev@localhost with both roles)
```

## Deploy (Vercel + Supabase)

1. Create a Supabase project. Run every file in `supabase/migrations/` in order in the SQL editor.
2. In Authentication → Providers → Email: **turn off "Allow new users to sign up"**. Accounts are created by an admin.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (server-only), as in `.env.example`.
4. Create users (Authentication → Users → Add user) and give each a role in the SQL editor:

   ```sql
   insert into public.fc_user_roles (user_id, role)
   select id, 'uploader' from auth.users where email = 'someone@company.example';   -- or 'approver'
   ```

   A user can hold both roles. A signed-in user with no role sees nothing. Remove access with `delete from public.fc_user_roles ...`.

### Who can do what

| | uploader | approver | no role |
|---|---|---|---|
| View returns, KPIs, download original / XML | ✓ | ✓ | – |
| Upload a new version | ✓ | – | – |
| Mark a validated version as submitted | – | ✓ | – |

Enforced three times: the page/route checks the role (`src/lib/auth/roles.ts`), the domain functions `ingestWorkbook` / `submitReturn` check it, and the database checks it (RLS + `fc_submit_return`). Browsers cannot insert, edit or delete returns or files directly: the server inserts a validated upload with the service-role key, and submission goes through `fc_submit_return()` with the user's own session, which records `submitted_by`. Each version records `uploaded_by` / `submitted_by` with the email at the time.

Choose the Supabase region and access rules with the client. This is regulated financial data.

## Code map

```
src/lib/returns/
  parse.ts       workbook → normalised return (header block, 2 sheet shapes, code/date/zero handling)
  template.json  expected sheets + columns (regenerate: npx tsx scripts/build-template.ts <template.xlsx>)
  rules.ts       arithmetic + cross-sheet reconciliation rules
  validate.ts    structure, cell, arithmetic and reconciliation checks
  kpis.ts        dashboard KPI definitions
  xml.ts         XML exporters (draft today; official one goes here)
  ingest.ts      hash → parse → validate → KPIs → versioned save
  trend.ts       KPI history per finance company
src/lib/auth/    roles.ts (who may do what, pure) · config.ts (Supabase vs local dev) · session.ts (current user)
src/lib/store/   FileStore (dev) and SupabaseStore (prod) behind one interface
src/app/         pages + API routes (/api/returns, /xml, /original, /submit)
```

## Plugging in the official XML

When CBN provides the XSD or an accepted XML sample:

1. Add `xsd/` and a new exporter in `src/lib/returns/xml.ts` implementing `XmlExporter` with `isDraft: false`.
2. Validate the output against the XSD in tests and before every download.
3. Point `defaultExporter` at it. The UI drops the "draft" labels automatically.

## When CBN changes the template

Regenerate `template.json` from the new workbook. The validator then reports missing or extra sheets and columns. Review `rules.ts` for codes that moved.
