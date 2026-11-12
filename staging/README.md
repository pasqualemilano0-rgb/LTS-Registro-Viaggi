# LTS Android staging — deployment gate (PR #145)

This folder describes an isolated staging build, **not** a production deployment.

## Required invariants

1. Stage origin: `https://lts-booking-security-stage.pasqualemilano0.workers.dev` (existing Cloudflare Worker). Keep the existing access-code/CSRF gate.
2. Authentication: QA Supabase project `sywxretbfgwxwhvdcknq` only. The QA `lts-phone-auth` Edge Function already allows the exact stage origin. **Never** use `otrqynkscpbeyuvdlgpg` in a browser staging bundle or Worker auth endpoint.
3. No production business state: disable the production `api/public-state` endpoint, realtime, push, shared maps, tariffs, archive, reports, onboarding, and any mutation or background sync unless a QA-only equivalent has been audited.
4. Booking: stage Worker must validate bearer server-side against **QA** `lts-phone-auth`, with session enforcement mandatory and MFA fail-closed. Do not copy the production Worker unmodified: its `LTS_SESSION_ENDPOINT` is hardcoded to production.
5. Stage must have dedicated Cloudflare rate-limit bindings for client and global routes; no mocks, production bindings, or bypasses. CORS must allow only the exact staging origin; never wildcard. Keep credentialed cross-origin requests disabled.
6. Stage must serve the actual PR #145 frontend assets with rewritten root paths and a stage-only service worker scope (or no service worker). The existing stage Worker currently serves **synthetic QA pages**, not the complete frontend.
7. Test HTTP access from Android-compatible browser, preflight, invalid/valid QA session, revoked token, admin MFA, 429 limits, absence of production requests, and no write to production before sharing any URL.

## Current blocker

The frontend has root-relative `/LTS-Registro-Viaggi/` paths, and `runtime-config.mjs` points to production business state and Supabase. A full unmodified copy would **not be isolated**. Until a complete staging-only asset build and independent Worker configuration are ready, do not deploy it or claim an Android test is ready.

No production files or services should be changed as part of this preparation.
