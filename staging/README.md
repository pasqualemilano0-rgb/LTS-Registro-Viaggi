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

## Verified QA gateway (2026-11-12)

- Cloudflare-to-QA-Supabase transport fixed (`redirect: 'manual'` rather than unsupported `'error'`).
- Live HTTP smoke run `43201625887` passed: origin denial, absent/invalid bearer, CORS preflight, direct QA auth rejection, and Worker-to-QA-auth rejection.
- This is **not** proof of a valid user session, MFA, or a successful TFG booking lookup.
- The separate QA gateway returns `QA_BOOKING_UPSTREAM_DISABLED` even after valid authentication. Never present a screenshot or manually copied TFG result as a live gateway lookup.

## Current blocker

The frontend has root-relative `/LTS-Registro-Viaggi/` paths, and `runtime-config.mjs` points to production business state and Supabase. A full unmodified copy would **not be isolated**. Until a complete staging-only asset build and independent Worker configuration are ready, do not deploy it or claim an Android test is ready.

No production files or services should be changed as part of this preparation.

## Next authorized integration gate

1. Establish an approved TFG data-access mechanism (official endpoint, documented permitted access, or authorized session workflow). Do not bypass access controls or reuse production secrets.
2. Verify a real QA account session and admin MFA, plus revoked-session denial.
3. Add booking lookup behind server-side QA authentication with strict response parsing, no redirect to arbitrary hosts, rate limits, and no production writes.
4. Build a separate Android-installable staging frontend with QA-only network configuration and inspect its actual browser requests.
5. Run live end-to-end booking verification before publishing a staging app link.
