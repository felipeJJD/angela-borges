# Tickets #7/#8 — persistence slice report

Base: `fe8f278a19d2dac9d92fd12f1b368f3e4e177049`

## Outcome

- Added an additive `0005` migration with one versioned own-user draft, immutable submissions, a server-only retry outbox, RLS, CAS/row-locking RPCs, stable UUID identity, server timestamps, payload hashes, and minimum role/function grants.
- Added a user-bound `SupabaseAnamnesisDraftRepository` and a coalescing serialized saver. The adapter strictly maps server rows, rejects user/revision/schema/identity drift, saves through the narrow RPC, and submits identifiers only through the Edge Function.
- Wired the signed-in user to a stable production repository in `Anamnese`, including account-keyed remounting, load/resume, debounced answer saves, immediate navigation saves, concise saving/error state, and retryable submission. Clinical answers are not written to browser storage.
- Staged `angela-anamnesis-submit` with a pure WebCrypto core, caller-JWT authentication, server-only configuration aliases, immutable submit/outbox replay, server-resolved profile data, exact canonical body partitioning, raw-body HMAC-SHA256, bounded delivery, and bounded retry state.

## Design seam

The existing repository interface remains the narrow application boundary. Supabase row/RPC knowledge stays in the adapter, write ordering stays in `SerializedAnamnesisDraftSaver`, UI journey logic stays transport-agnostic, and Dashboard canonicalization/HMAC stays in the pure Edge core rather than browser code.

## TDD evidence

Vitest contract tests were introduced first and observed failing for the absent Supabase adapter, serialized saver, migration, Edge core/runtime, and production UI wiring. Review hardening also produced focused red tests for unrestricted service-role table privileges and nullable CAS/schema parameters before the migration was tightened; all are green in the final suite.

## Verification

- `npm test -- --run`: PASS — 11 files, 44 tests.
- `npm run lint`: PASS.
- `npm run build`: PASS — TypeScript and Vite/PWA production build.
- `deno fmt --check supabase/functions/angela-anamnesis-submit`: PASS.
- `deno lint supabase/functions/angela-anamnesis-submit`: PASS.
- `deno check supabase/functions/angela-anamnesis-submit/core.ts`: PASS.
- Browser-source scan: PASS — zero clinical-storage API hits and zero privileged Edge alias/service-role hits in the Anamnese persistence runtime.
- Raw-secret pattern scan over changed persistence/Edge sources: PASS — zero hits.
- TestSprite: not run because this worktree has no `.testsprite/config.json`, `.testsprite` directory, or `TESTSPRITE_PROJECT_ID` link.

## Residual gates

- The migration was not applied or exercised against a database; no `psql`, Supabase CLI, or local PostgreSQL parser is installed in this worktree. Deployment and live RLS/RPC probes remain the next controlled gate.
- Full `deno check` of `index.ts` remains unverified because the JSR Supabase package is not cached and `--no-remote` correctly refused the remote manifest. The pure core is type-checked and both Edge files are linted/formatted.
- The Edge Function, secrets, migration, and Dashboard delivery were staged only. Nothing was deployed, pushed, or sent to Supabase, Dashboard, Railway, GitHub, or any network service.

## Follow-up hardening (task_6a7c08d5c6b7)

- The webhook target is now fail-closed: the Angela Supabase URL is pinned, the Dashboard URL must be HTTPS at exactly `/api/anamnese/from-app` on a separately configured expected origin, and browser CORS uses an explicit production/development allowlist.
- Payload hashes use recursively canonicalized JSON with an explicit lexical comparator, never locale-dependent ordering or PostgreSQL `jsonb::text`. Cross-runtime fixtures cover the Dashboard hash, nested key order/decimals, and `timestamp.rawBody` HMAC-SHA256.
- Submit is now a service-role-only atomic RPC. The Edge authenticates the student, reads her RLS-bound draft, validates all 25 semantic answers, computes the canonical hash in TypeScript, and passes the exact user/revision/answers/hash snapshot into the locked RPC; authenticated callers retain only the save RPC and own delivery-status access.
- Dashboard delivery requires a new short-lived HS256 JWT on every attempt using the server-only `ANGELA_DASHBOARD_DELIVERY_JWT_SECRET` alias. Its exact claims bind issuer, audience, user, correlation, fixed account, source, issued-at and expiry; the separate webhook HMAC still signs the Unix timestamp plus the exact raw body.
- Delivery accepts only bounded 2xx JSON acknowledgments with `success: true` and the matching correlation id. The same pure delivery seam serves interactive retries and a leased, bounded, service-only outbox drainer; no student token, delivery JWT, HMAC secret, answers, name or email is logged or stored as a credential.
- `supabase/config.toml` sets `verify_jwt = false` only for `angela-anamnesis-submit`. This is required so the opaque drain bearer can reach the handler; the handler then validates user JWTs with `auth.getUser` for submit/status and checks `ANGELA_OUTBOX_DRAIN_TOKEN` in constant time for drain requests.
- The PWA now renders `accepted_pending`, `delivered`, and `failed` honestly, checks delivery on reload, and retries the stable submission without placing clinical answers in browser storage.

### Follow-up residual dependency

The Dashboard-side verifier for the timestamped HMAC, exact delivery-JWT claims, canonical payload hash, and structured acknowledgment is outside this worktree and must be promoted in lockstep. This PWA worktree was intentionally not connected to Supabase, Dashboard, Railway, GitHub, or any deployed URL, so database execution, gateway behavior, and the cross-repository handshake remain controlled external gates.

### Follow-up verification

- `npm test -- --run`: PASS - 14 files, 66 tests.
- `npm run lint`: PASS.
- `npm run build`: PASS - TypeScript and Vite/PWA production build.
- `deno fmt --check` and `deno lint` for the complete Edge directory: PASS.
- `deno check` for `core.ts`, `config.ts`, `delivery-jwt.ts`, and `delivery.ts`: PASS. Full `index.ts` type-check remains unknown because its JSR dependency is not cached and network access was prohibited.
- SQL execution, TestSprite, deployed browser QA, and the Dashboard handshake remain unverified because no local PostgreSQL/Supabase CLI, linked TestSprite project/deployed URL, or permitted live target was available.
