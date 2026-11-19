# Backlog

Ordered by priority. ⛔ = blocked on the client/CBN.

## P0 — before any real data
1. **Run SupabaseStore against a live project.** The test is written: `test/supabase-live.test.ts` (skipped unless `SUPABASE_TEST_*` is set, see README). Still to do, needs a dedicated Supabase test project: apply the migrations, run that test and fix what it finds, then sign in through the UI as an uploader and an approver (login page, session refresh in middleware, upload, submit).
2. **Test with a real filled return** (anonymised). Expect to tune: header detection, numeric/date column rules, `uniqueCodes`, reconciliation rules. Add it as a fixture only if fully anonymised.

## P1 — correctness
3. ⛔ **SFCR call reports** (SFCR1900–1960): confirm with the client whether they are filed monthly with the MFCR files and in the same format; get one accepted SFCR XML, add it to `test/fixtures/accepted-xml/`, then drop the `SFCR-format-not-verified/` folder.
3b. ⛔ **CALLREPORT_DESCRIPTION**: we pass through the workbook's text. CBN's samples differ on 3 sheets (MFCR100 empty, MFCR300 "MONTHLY STATEMENT OF FINANCIAL POSITION", MFCR1002 shorter). Confirm with the client whether CBN checks it.
4. **Promote reconciliation warnings to errors.** 21 "Specify MFCR xxx" rules are warnings (`severity: "warning"` in `rules.ts`): they reconcile in CBN's accepted call reports but the sample workbook's schedules are placeholders. When a real filled return (item 2) reconciles on a rule, make it an error. Reconcile in neither dataset, so left out unless the client explains: 10640+10770+10890+11010→MFCR320 (66,748.98 vs 86,282.41), 11640→MFCR336, 11860→MFCR349 (off by 0.01), 12500→MFCR362.
5. **Cross-period checks** — YEAR_TO_DATE should equal last month's YTD + this month's CURRENT_MONTH (MFCR1000) within a financial year. Warning level.
6. **Upload size/timeouts on Vercel** — route handler body limits; if needed upload straight to Supabase Storage with a signed URL, then ingest.

## P2 — product
7. ⛔ **KPI sign-off** with management; currency unit (₦ vs ₦'000) for display.
8. Validation report export (PDF/CSV) to send back to whoever runs the source system.
9. Side-by-side diff between two versions of the same period.
10. Multi-company support in the UI (filter by FC_CODE) if the client runs several entities.
11. Audit log page (uploads, exports, submissions, by whom).

## Done
- Authentication + roles: Supabase Auth, `uploader` / `approver`, RLS tightened (0002), submission via `fc_submit_return`, service-role key only for the validated insert, uploaded_by / submitted_by recorded. RLS tested in PGlite; not yet run on a live project (item 1).
- CBN call report XML exporter from accepted samples (one file per call report, zipped); validation proven clean on CBN-accepted data; MFCR100 codes may repeat.
- Parser, validation (structure, types, 42 arithmetic + 10 reconciliation rules + 21 reconciliation warnings), KPIs, versioned storage, UI.
