# Angela profile logout and production E2E implementation plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Align the shared button content and prove the existing incident student completes the full Angela production workflow.

**Architecture:** Make one presentation-only change in the shared `Button`, protected by an SSR regression test. Treat the PWA, Supabase intake, Angela-scoped Dashboard, worker, publication path, and PWA plan readback as separate observable boundaries. Use exact account/auth mappings and DPAPI-injected credentials for live verification.

**Tech stack:** React 19, TypeScript, Vitest, Tailwind CSS, Vite PWA, Supabase, Next.js Dashboard, Railway, Playwright/Chromium.

---

### Task 1: Document and reproduce the logout alignment defect

**Files:**
- Create: `app/src/components/Button.test.ts`
- Inspect: `app/src/components/Button.tsx`
- Inspect: `app/src/pages/Perfil.tsx`

1. Render the real `Button` with an SVG and text using `react-dom/server`.
2. Assert that the immediate content wrapper uses inline flex alignment and an internal gap.
3. Assert that loading retains content alignment and opacity while disabling the button.
4. Run `npm test -- src/components/Button.test.ts` from `app/` and capture the expected failure caused by the current plain `span`.

### Task 2: Apply the minimal shared-button fix

**Files:**
- Modify: `app/src/components/Button.tsx`
- Verify: `app/src/components/Button.test.ts`

1. Add `inline-flex items-center justify-center gap-2` to the content wrapper while preserving its loading opacity.
2. Run the targeted test and require a clean pass.
3. Run `npm test`, `npm run lint`, and `npm run build` from `app/`.
4. Review the diff for scope and accidental user-data or secret inclusion.

### Task 3: Commit, push, and verify Railway production

**Files:**
- Commit only the design, plan, regression test, and `Button` implementation.

1. Confirm `main`, primary checkout, clean ownership of the changed files, and synchronization with `origin/main`.
2. Commit the exact files, pull/rebase if necessary, and push `main` without bypassing hooks.
3. Track the exact commit through Railway until its deployment is terminal.
4. Probe the public PWA and confirm it serves the deployed application.

### Task 4: Complete anamnesis and verify Angela intake

**Systems:**
- PWA production
- Angela PWA Supabase
- Dashboard CAOS Supabase

1. Resolve the incident student internally from its safe reference and inject the default password through DPAPI.
2. Log in, confirm the incomplete-anamnesis gate, preserve the 11 saved answers, and fill only unanswered steps through the UI with valid synthetic inputs.
3. Submit once and wait on observable state rather than fixed sleeps.
4. Read back a completed PWA submission and an Angela-scoped Dashboard lead/outbox/job using exact auth-user and account identifiers.
5. Emit only sanitized references, counts, and statuses.

### Task 5: Verify worker generation and publish via Dashboard

**Systems:**
- Angela consultation worker
- Angela account in Dashboard CAOS

1. Poll the exact Angela-scoped job/protocol to a terminal generation state.
2. If generation fails, capture sanitized boundary evidence, identify the root cause, add a regression test before any code fix, and deploy only the Angela-owned component.
3. Authenticate as the Angela operator and validate/publish the generated protocol through the dedicated Dashboard route.
4. Read back `validado`/published state and the PWA active-plan projection for the same exact student.

### Task 6: Verify all student-facing PWA functions

**Routes:**
- `/`
- `/dieta`
- `/treino`
- `/perfil`
- `/login`

1. Confirm Home, Diet, Training, and Profile are reachable after publication.
2. Confirm diet and training contain the published protocol.
3. Find a mapped exercise and verify its iframe uses the approved YouTube privacy-enhanced embed; verify there is no arbitrary fallback for unmapped exercises.
4. Capture only a tightly cropped, PII-free visual of the Profile logout control and check icon/label alignment and bottom spacing.
5. Sign out, confirm login routing/session removal, sign in again, and confirm authenticated navigation resumes.

### Task 7: Final verification, cleanup, and durable writeback

1. Re-run repository tests, lint, build, production health, and exact-state readbacks needed for every completion claim.
2. Confirm Git is clean and remove only this task's temporary scripts, browser sessions, screenshots, and logs.
3. Update the existing same-day Angela Vault context (or the canonical deduplicated note), monthly index, and current project state with safe evidence, commit/deployment identifiers, residual risks, and next gate.
4. Read the Vault note back before reporting completion.

