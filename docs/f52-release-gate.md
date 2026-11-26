# F52 — release compatibility gate (review only)

This PR is not a deployable production bundle. Keep the existing QA project and production separated. The QA account-state bundle has synthetic account restrictions and must never be copied to production.

- The adapter `f52-existing-pricing-adapter.mjs` targets the inspected existing production pricing contract. It adds note field preservation BEFORE pricing normalization and routes history only after existing authorization. It deliberately does not replace company pricing, receipt, MFA or CAS. It must be composed with the coordinated F49/F51 release, not deployed independently as if it implemented F51.
- The production private schema lacks service_role USAGE. The history RPC requires appropriate schema USAGE and EXECUTE only, no table read grant. Verify access, RLS, revoked sessions and driver-only owner checks before rollout.
- The offline queue now tracks absent administrative notes separately from private notes. Three-way merge preserves missing fields from the verified common ancestor; explicit clears and row deletions remain explicit. Already-normalized historic snapshots may have lost presence metadata. Do not claim to infer intent from an existing empty string.
- No production DDL, backup restore, purge, merge or deployment is authorized by these changes. The current production backup/restore gate and full F49/F51 integration gate are open.
- Retention proposal: current notes according to archive purpose/lifetime; superseded/deleted notes 12 months from replacement/deletion subject to applicable obligations and requests. No automatic purge. Owner approval and a tested erasure procedure are required; never expose private note text to administrators or logs.
- Release order only after explicit approval and validated backup: compatible database migration and baseline snapshot, coordinated Edge and session/tariff protections, frontend, authenticated smoke test and monitoring. Application rollback must not delete the history or overwrite newer archives.

## F49/F51 schema comparison

Production has an extra manual-customer catalog trigger that still emits v1 hints. The review-only `f52-manual-customer-hint.sql` adapts that trigger function to F49 session targets. An equivalent QA trigger test with a temporary synthetic table and transaction rollback passed: only active eligible sessions, private v2 hints, no note content. Not an actual production-table migration.

Production already has a tariff catalog and extra rates. Its catalog has a created_at field absent in QA; updated_by on extra rates is nullable in production but not in QA. Do not recreate or seed production catalogs from QA. F51 requires adapting its missing retroactive repricing RPC/guard/triggers, audit and receipts to the actual existing rows/schema. No F51 full release candidate or backup restore test completed by this change.
