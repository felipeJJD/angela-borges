# Angela Profile Without Team Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Team badge and current-level row from the Angela profile while preserving every internal Team rule.

**Architecture:** Keep `current_team` in the authentication/domain profile and every workout/admin consumer. Narrow only the presentational `ProfileView` contract so the profile route no longer accepts or renders Team data.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Vite 8.

## Global Constraints

- Do not change Supabase, the `profiles.current_team` field, workout locks, progression, Dashboard, worker, or administrator controls.
- Preserve name, email, progress cards, and logout behavior.
- Push only a clean, synchronized `main` after focused and full verification.

---

### Task 1: Remove Team from the public profile presentation

**Files:**

- Modify: `app/src/components/profile/ProfileView.test.ts`
- Modify: `app/src/components/profile/ProfileView.tsx`
- Modify: `app/src/pages/Perfil.tsx`

**Interfaces:**

- Consumes: `ProfileView(props)` with identity, progress, and logout fields; `useAuth()` continues to return the complete profile including `current_team`.
- Produces: `ProfileView` props without `team`; rendered profile markup without `Team 1` or `Nível atual`.

- [ ] **Step 1: Write the failing public-render test**

Add this case to `ProfileView.test.ts` before changing implementation:

```tsx
it('does not expose the internal Team level on the account screen', () => {
  const html = renderToStaticMarkup(createElement(ProfileView, baseProps))

  expect(html).not.toContain('Team 1')
  expect(html).not.toContain('Nível atual')
})
```

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```powershell
Set-Location app
npm test -- --run src/components/profile/ProfileView.test.ts
```

Expected: FAIL because the current badge and account row render `Team 1` and `Nível atual`.

- [ ] **Step 3: Apply the minimal presentation cut**

In `ProfileView.tsx`:

- remove the `TEAM_LABELS` and `TeamBadge` imports;
- remove `team` from `Props`;
- remove the badge wrapper below the email;
- remove the entire `Nível atual` `ProfileRow`.

In `Perfil.tsx`, remove:

```tsx
const team = profile?.current_team ?? 1
```

and stop passing:

```tsx
team={team}
```

In `ProfileView.test.ts`:

- remove `team: 1` from `baseProps`;
- remove the obsolete `TEAM_LABELS` module mock;
- remove `'team'` from the expected public prop keys in the logout harness.

- [ ] **Step 4: Run focused GREEN**

Run:

```powershell
Set-Location app
npm test -- --run src/components/profile/ProfileView.test.ts
```

Expected: all profile tests pass, including the new negative rendering contract.

- [ ] **Step 5: Run complete verification**

Run from `app`:

```powershell
npm test -- --run
npm run lint
npm run build
```

Then run from the repository root:

```powershell
git diff --check
git status --short
```

Expected: zero test failures, zero lint errors, successful production build, no whitespace errors, and only the three approved implementation files plus this plan changed since the design commit.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- app/src/components/profile/ProfileView.test.ts app/src/components/profile/ProfileView.tsx app/src/pages/Perfil.tsx docs/superpowers/plans/2026-08-18-angela-profile-hide-team.md
git commit -m "fix: hide Team level from Angela profile"
```

- [ ] **Step 7: Synchronize, push, and verify the exact SHA**

With a clean normal checkout on `main`, run `git pull --rebase origin main`,
rerun affected checks if the rebase changes the tree, and push without bypassing
hooks. Track the exact SHA through GitHub CI and the linked production provider;
probe the public PWA after a successful deployment.
