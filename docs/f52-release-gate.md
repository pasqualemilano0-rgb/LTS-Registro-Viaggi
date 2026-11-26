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

## F51 additive candidate and restore rehearsal

The installed QA F51 functions were extracted as a review-only migration of the existing production catalog (no catalog recreation, seed, or automatic initial repricing). The adapter composes the installed QA F51 write and tariff-save routines with the existing production authorization and origin contract, plus the PR237 history handler. It deliberately removes the old response-side fare projection so stored server-authoritative prices are returned; the current webapp loads the company catalog independently. Older app compatibility, full production-shaped candidate integration in QA, existing catalog v1 trigger migration, and receipt/rollback cutover remain explicit gates. No bundle has been deployed.

QA transaction test: snapshot archives/catalog/history, change synthetic tariff 7500→7600 via live SQL RPC as service_role, reject stale CAS, compare exact expected repricing and revisions, verify history unchanged, compensate to 7500 using the next revision, compare payloads exactly to snapshot, verify two audit events, then rollback entire transaction. Postcheck catalog revision 1 / 7500, archives revisions 5 / 20 with 2 / 0 trips, audit count 0. This is a logical in-transaction restore rehearsal, not a durable/full database backup or live HTTP test. Production 122 tariffs pass aggregate validity checks. Never copy production data to QA.

Second QA transaction: add a synthetic historical double-pickup trip to empty driver B, tariff guard canonicalizes both amounts; reprice both A and B to 7600, verify exact payloads, revision increments, immutable v2 receipt preservation, unchanged note history and private F49 v2 catalog hints; compensate to 7500, exact payload comparison, rollback. Postcheck A rev5/2 trips, B rev20/0 trips, tariff 7500/rev1, history 16, repricing audit 0. Production aggregate preview 358 trips, 272 matched by company catalog, 16 would reprice across 8 archives. No actual repricing in production.

## External QA backup and F49 frontend candidate

External owner-only Drive logical backup verified by exact SHA-256 round-trip, restoring all six data sets as typed rows in QA without replacing live records: 2 archives, 1 tariff, 8 extra rates, 16 note-history rows, 0+0 audit rows. No credentials, auth sessions or production records included. This is a scoped business-data backup, not a physical database or Auth/Storage disaster recovery backup. Production backup remains a separate gate. CI #36 563/563 before frontend F49 change.

Frontend F49: one v2 session topic, no v1 downgrade, session ID extracted as a routing hint from the already authenticated JWT (server still validates JWT and live ownership), reject session changes on rotation and reject roster hints for drivers. Existing authenticated polling remains enabled. Requires coordinated v2 server rollout before releasing frontend. Live Android WebSocket integration not yet repeated for this candidate.
