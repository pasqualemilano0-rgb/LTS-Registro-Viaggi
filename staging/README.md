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

## Verified status — 2026-11-12

- Live GitHub Actions run `43205234429` succeeded: Cloudflare QA Worker -> public TFG form, fixed booking `280630439`, vessel SALWEEN, voyage 646W. This is a **fixed-reference diagnostic**, not an authenticated browser end-to-end lookup.
- Live run `43205653204` succeeded: frontend origin routing tests, no QA-to-production fallback, invalid bearer 401, CORS and negative authentication tests.
- `porti/tfg_booking.mjs` selects the isolated QA gateway for the **exact** staging origin; `porti/app.js` checks the selected endpoint before forwarding a bearer.
- The QA Worker has a **temporary** `/diag/tfg-reference` endpoint that must be removed before external release. Its access is origin-restricted and rate-limited but it is still unauthenticated.
- **NOT YET VERIFIED:** a valid QA Supabase user session, admin MFA and revoked session behavior, full Android browser flow, installable PWA deployment, and a complete isolated staging asset build.
- **DO NOT SHARE A STAGING INSTALL LINK** or merge this branch until those gates are satisfied.

## Release blockers

1. Produce and audit a stage-only frontend bundle: remove production CSP endpoints, canonical/manifest scope, service-worker and API fallbacks; ensure no production business data calls.
2. Serve this bundle on the exact stage origin using an isolated Cloudflare route without replacing the existing access-code/CSRF gate.
3. Authenticate through QA Supabase with a dedicated authorized QA account. Never place passwords, OTPs, JWTs, or service-role secrets in commits or logs. Validate success and revoked-session/MFA failure modes.
4. Test a real browser lookup of the known TFG booking, including CORS and the absence of production traffic.
5. Remove `/diag/tfg-reference`, rerun security checks, and only then distribute the Android PWA link.
