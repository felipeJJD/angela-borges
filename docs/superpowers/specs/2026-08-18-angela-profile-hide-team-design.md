# Angela profile without Team display

## Goal

Remove every user-visible Team indicator from the Angela PWA profile/account
screen without changing the internal Team value or any access rule.

## Approved behavior

The profile must no longer render either of these elements:

- the Team badge below the student's email;
- the `Nível atual` row inside `Informações da conta`.

The account information group continues to show the student's name and email.
Progress cards and logout behavior remain unchanged.

## Boundary

This is a presentation-only change scoped to the profile route. The
`profiles.current_team` field, authentication profile shape, workout filtering,
Team locks, progression, database policies, and administrator controls remain
unchanged.

`ProfileView` no longer accepts a `team` prop because the profile presentation
does not consume that value. `Perfil` stops forwarding `current_team` to the
view, while the authentication profile continues to load it for other PWA
consumers.

## Public test seam

The stable seam is the rendered `ProfileView` markup plus the public props
returned by the `Perfil` page component in its existing test harness.

The regression contract must prove that:

- the profile contains neither `Team 1` nor `Nível atual`;
- name, email, progress, and logout remain visible;
- `Perfil` no longer exposes a `team` view prop;
- existing logout behavior remains green.

## Implementation scope

- Modify `app/src/components/profile/ProfileView.tsx`.
- Modify `app/src/components/profile/ProfileView.test.ts`.
- Modify `app/src/pages/Perfil.tsx`.

No database, Supabase, Dashboard, worker, navigation, workout, or admin file is
part of this change.

## Verification

Use a red-green cycle at the `ProfileView` render seam, then run the focused
profile test, the complete Vitest suite, ESLint, TypeScript production build,
and formatting/diff checks. Push the clean result directly to synchronized
`main`, then track the exact commit through the repository CI and production
provider when an automatic deployment exists.

## Acceptance criteria

- The profile/account screen has no Team badge and no current-level row.
- Name, email, check-in count, completed-plan count, and logout still render.
- Internal Team-based authorization and workout behavior are untouched.
- Tests, lint, and production build pass on the exact pushed commit.
