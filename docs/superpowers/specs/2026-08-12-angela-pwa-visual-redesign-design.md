# Angela PWA visual redesign

## Goal

Bring the visual language of the local Paizao PWA into Angela's anamnesis, student navigation, and profile while preserving Angela's black-and-orange identity and every existing functional contract. The result must feel like one coherent mobile product, not a copy of Paizao branding.

## Chosen approach

Use a controlled visual transplant. Recreate the hierarchy, spacing, progress treatment, rounded selection cards, floating glass navigation, and grouped profile presentation from Paizao with Angela-owned tokens and components. Do not copy Paizao-specific branding, mascot assets, routes, business rules, or data fields. Avoid a new animation dependency; reuse Angela's existing CSS motion utilities and add one global reduced-motion media rule for the redesigned surfaces.

Literal component copying was rejected because it would import Paizao-specific assumptions and unnecessary dependencies. A CSS-only reskin was rejected because it would not deliver the requested structural improvement to the questionnaire, navigation, and profile.

## Architecture and boundaries

The redesign is presentation-only. The current anamnesis journey/controller remains the source of truth for step state, validation, draft hydration, saving, retry, review, and submission. The existing 25-step catalog and Supabase repositories remain unchanged.

Large visual blocks should be isolated behind small presentational components where that makes the page easier to understand, such as segmented progress, question option cards, section status, and profile groups. They receive data and callbacks; they do not know about Supabase, account identity, clinical persistence, or Dashboard delivery.

The existing route order and destination contracts remain:

1. Início
2. Dieta
3. Treino
4. Perfil

No Biblioteca, community route, fabricated profile action, or new backend behavior is part of this work.

## Anamnesis experience

The anamnesis uses a near-black full-height canvas with subtle graphite and orange radial gradients. The compact top region contains a circular back control, the Angela anamnesis title, the current question count, segmented progress, and completion percentage. Angela's existing `public/brand/logo-round.jpeg` occupies the visual accent position; no Paizao mascot is imported.

Each step presents one centered question with optional supporting copy and a short interaction hint. Choice answers render as full-width rounded cards with a compact numbered tile, the exact catalog label, and a circular selection indicator. No secondary option copy is invented when the catalog supplies only a label. Selected cards use an orange border and restrained orange glow or gradient while keeping sufficient text contrast. Text, number, and date controls use the same surface, focus ring, spacing, and error language.

The current single-choice and multi-choice behavior remains represented through `aria-pressed`. Errors stay adjacent to the affected question. Saving state remains visible without dominating the screen. The action region is safe-area aware: Previous is secondary and Continue, Review, or Submit is the primary orange pill. The review, loading, accepted-pending, delivered, delivery-failed, and hydration-error states receive the same visual system without changing their meaning or available recovery actions.

## Student navigation

Replace the edge-to-edge bottom bar with a floating liquid-glass pill inspired by Paizao. It is centered within the mobile viewport, inset from the side and bottom safe areas, and uses a translucent near-black surface, blur, fine border, and soft shadow.

All four destinations keep an icon and visible label. The active destination uses one orange-tinted capsule contained within its tab, with orange icon/text treatment; inactive destinations remain legible graphite/white. Keyboard focus, touch targets of at least 44 pixels, route order, labels, and active-route semantics are preserved. Content receives enough bottom padding that the floating bar never covers the final control or profile logout row.

## Profile

The profile starts with a centered identity block containing the existing avatar treatment, student name, email, and team/account badge. The current check-in and completed-plan statistics are displayed in balanced compact cards.

Supported account information is reorganized into Paizao-style grouped surfaces: small uppercase section labels, rounded graphite cards, internal dividers, and aligned label/value rows. Only data already available in Angela is shown. No edit-profile, password, support, notification, or destructive account action is invented.

Logout becomes a full-width row inside a dedicated account group, with an aligned icon and label and no navigation chevron. It remains visually distinct and easy to reach without looking detached from the rest of the profile. The existing sign-out command and redirect semantics remain unchanged; the row adds a local submitting state that disables repeated activation and shows `Saindo...` until authentication transitions to login.

## Visual system and motion

- Retain Angela's existing black, graphite, white, and orange design tokens.
- Retain Oswald for display headings and Inter for body text, using only size, weight, and spacing changes for hierarchy.
- Use consistent radii, borders, spacing, focus rings, and shadows across all three surfaces.
- Use short fade, rise, and selection transitions only; avoid motion that delays answering.
- Honor `prefers-reduced-motion` and maintain readable contrast in selected, disabled, error, and loading states.
- Design for the current mobile-first maximum width while remaining usable on narrow phones and desktop preview widths.

## Functional invariants and error handling

- The 25-step sequence, answer values, validation rules, progress calculation, and review ordering do not change.
- Clinical answers are not moved into browser local or session storage.
- Draft hydration, debounced save, forced save on advance, retry, immutable submission, and Dashboard outbox behavior remain untouched.
- Loading and terminal states remain explicit; a visual transition must never hide a failed save or failed delivery.
- Navigation order and paths remain exactly as tested today.
- Logout continues to clear authentication state before returning to login.

## Verification

Implementation follows test-first changes around stable public seams. Focused component tests must cover segmented progress, option selected/unselected semantics, the four navigation destinations and active state, grouped profile/logout rendering, and preserved loading/disabled behavior. Existing anamnesis journey, validation, persistence, navigation, and authentication tests must continue to pass.

The complete local gate is targeted tests, the full test suite, lint, and production build. Visual QA must inspect narrow-mobile and standard-mobile widths for the first question, a selected option, validation feedback, review/terminal state, all four navigation states, profile grouping, safe-area padding, and logout alignment. If the repository has a reachable TestSprite project after deployment, run its relevant public-URL verification and inspect failure artifacts before declaring production complete.

## Acceptance criteria

- Anamnesis visibly follows Paizao's interaction hierarchy while remaining unmistakably Angela in black and orange.
- All question types, save feedback, review, submit, and delivery states remain usable and semantically correct.
- The floating navigation contains only Início, Dieta, Treino, and Perfil in that order and never obscures content.
- Profile is visually grouped and polished, shows no fabricated action, and presents a correctly aligned working logout row.
- Existing functional tests remain green; new visual-contract tests capture the intended public behavior.
- Lint and production build pass, visual QA shows no mobile overflow or safe-area collision, and the final clean commit is pushed to the repository's synchronized `main` branch.
