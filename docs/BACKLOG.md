# Backlog

Ordered by priority. ⛔ = blocked on the client/CBN.

## P0 — before any real data
1. **Authentication + roles.** Supabase Auth; roles `uploader` and `approver`. Only approvers can mark submitted. Tighten the RLS policies in `supabase/migrations/0001_returns.sql` and move server calls off the service-role key where possible. Record who uploaded/submitted.
2. **Run SupabaseStore against a live project.** Apply the migration, add an integration test (skipped unless `SUPABASE_URL` is set) mirroring `test/ingest.test.ts`.
3. **Test with a real filled return** (anonymised). Expect to tune: header detection, numeric/date column rules, `uniqueCodes`, reconciliation rules. Add it as a fixture only if fully anonymised.

## P1 — correctness
4. ⛔ **Official CBN XML exporter.** Needs the XSD/spec or an accepted XML sample. Add `xsd/`, implement `XmlExporter` with `isDraft: false`, validate output against the XSD (e.g. `libxmljs2` or `xmllint` in CI) in tests and before every download.
5. **More reconciliation rules** — remaining "Specify MFCR xxx" lines in MFCR300 (e.g. 10520→MFCR318, 10640/10770/10890/11010→MFCR320, 11250/11370→MFCR330, 11460→MFCR334, 20340→MFCR387). Confirm each against real data first; MFCR379 vs 20140 did NOT reconcile in the sample, so verify before adding.
6. **Cross-period checks** — YEAR_TO_DATE should equal last month's YTD + this month's CURRENT_MONTH (MFCR1000) within a financial year. Warning level.
7. **Upload size/timeouts on Vercel** — route handler body limits; if needed upload straight to Supabase Storage with a signed URL, then ingest.

## P2 — product
8. ⛔ **KPI sign-off** with management; currency unit (₦ vs ₦'000) for display.
9. Validation report export (PDF/CSV) to send back to whoever runs the source system.
10. Side-by-side diff between two versions of the same period.
11. Multi-company support in the UI (filter by FC_CODE) if the client runs several entities.
12. Audit log page (uploads, exports, submissions, by whom).

## Done
- Parser, validation (structure, types, 42 arithmetic + 5 reconciliation rules), KPIs, versioned storage, draft XML, UI, 38 tests.
