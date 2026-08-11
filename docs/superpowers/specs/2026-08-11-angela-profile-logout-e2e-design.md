# Angela profile logout and production E2E design

## Goal

Correct the Profile logout button alignment without changing the student navigation layout, then verify the existing incident student through the complete production workflow: authentication, anamnesis, Angela-scoped Dashboard intake, worker generation, operator validation/publication, plan readback, embedded exercise video, logout, and login again.

## UI design

The shared `Button` already centers its direct children, but the icon and label supplied by `Perfil` are grouped inside one plain inline `span`. The button-level `gap-2` therefore does not create space between those two descendants and the SVG follows text-baseline alignment.

The content wrapper inside `Button` will become `inline-flex items-center justify-center gap-2`. Loading remains a separate spinner next to the content wrapper, and the wrapper keeps its existing loading opacity. No changes are needed in `Perfil`, `StudentLayout`, `BottomNav`, or global safe-area CSS.

## Production workflow

The test will reuse the existing incident student, identified in evidence only by a non-reversible reference. The browser will retain the 11 saved anamnesis answers and supply valid synthetic values only for unanswered steps. Raw identity, clinical values, passwords, provider tokens, and session material must remain in process memory and must not be printed, committed, or written to the Vault.

After submission, readback must establish each boundary independently:

1. The PWA reports a completed anamnesis submission.
2. Dashboard identity resolves through the fixed Angela account and exact authentication-user mapping.
3. The Angela consultation worker creates the student's diet and training protocol without selecting another tenant.
4. The protocol is validated and published through the Angela-specific Dashboard path.
5. The PWA reads the published diet and training, renders an approved YouTube embed when a mapped exercise has a video, and leaves unmapped exercises without an arbitrary video.
6. Profile renders the corrected logout control, logout returns to login, and the same student can authenticate again.

## Isolation and secrets

- Dashboard account scope is the fixed Angela account; approximate name or email lookup is forbidden.
- Other tenant records and generic publication paths are out of scope.
- Reusable credentials are injected from the DPAPI coffer into child-process environment variables.
- Temporary QA scripts are ignored, contain no literal credentials or user identity, emit only sanitized state/counts, and are deleted after verification.
- Clinical answers are never included in Git, terminal output, screenshots, or Vault notes.

## Acceptance criteria

- A regression test fails against the old `Button` markup and passes with the new content wrapper.
- PWA unit tests, lint, and production build pass.
- The exact Git commit is pushed to `main`, Railway reports a successful deployment for that commit, and the public app serves successfully.
- The incident student completes the full Angela-only workflow through published diet and training.
- At least one training exercise with an approved mapping renders a `youtube-nocookie.com` iframe; no random fallback video is used.
- Profile logout is visually aligned, signs out, and a subsequent login succeeds.
- Temporary QA artifacts are removed and the repository finishes clean.

