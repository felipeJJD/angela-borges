# Angela PWA Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Angela's anamnesis, four-item student navigation, and profile with Paizao-inspired mobile hierarchy while preserving Angela's black-and-orange identity and all existing functional contracts.

**Architecture:** Keep journey, authentication, Supabase repositories, and route ownership in their current containers. Extract only testable presentational seams for anamnesis controls and profile content, then let the existing pages feed those components state and callbacks. CSS owns the shared canvas, floating-glass treatment, safe-area clearance, and reduced-motion fallback without adding a runtime dependency.

**Tech Stack:** React 19.2, TypeScript 6, React Router 7.18, Tailwind CSS 4.3, Vitest 4.1 SSR tests, Vite 8.

## Global Constraints

- Keep the exact 25-step catalog, answer values, validation, hydration, saving, retry, review, submission, and Dashboard delivery behavior unchanged.
- Never add clinical answers to `localStorage`, `sessionStorage`, or IndexedDB.
- Do not change Supabase, Dashboard, worker, tenant, route-gate, or authentication contracts.
- Use only Angela's existing black, graphite, white, and orange tokens; retain Oswald headings and Inter body text.
- Add no animation library or other production dependency.
- The navigation must contain only `Início`, `Dieta`, `Treino`, and `Perfil`, in that order, at `/`, `/dieta`, `/treino`, and `/perfil`.
- Every navigation target and main action must remain keyboard reachable and at least 44 pixels tall.
- Honor `prefers-reduced-motion: reduce` and bottom safe-area insets.
- Do not invent profile fields, actions, or option descriptions that are absent from Angela's current data.
- Preserve unrelated user changes and push only after synchronizing with `origin/main` and passing every verification gate.

---

### Task 1: Shared mobile canvas, safe-area clearance, and reduced motion

**Files:**
- Modify: `app/src/components/StudentLayout.tsx`
- Modify: `app/src/index.css`
- Create: `app/src/components/StudentLayout.test.ts`

**Interfaces:**
- Consumes: React Router's `Outlet` and the existing `BottomNav`.
- Produces: a `student-shell` canvas, the existing `pb-nav` clearance utility, and a global reduced-motion fallback used by later tasks.

- [ ] **Step 1: Write the failing layout contract test**

Create `app/src/components/StudentLayout.test.ts`:

```tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { StudentLayout } from './StudentLayout'

describe('StudentLayout visual contract', () => {
  it('provides the shared canvas and clearance for the floating navigation', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(StudentLayout) },
            createElement(Route, {
              index: true,
              element: createElement('p', null, 'Conteúdo do aluno'),
            }),
          ),
        ),
      ),
    )

    expect(html).toContain('student-shell')
    expect(html).toContain('pb-nav')
    expect(html).toContain('Conteúdo do aluno')
  })

  it('defines floating-nav clearance and a reduced-motion fallback', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/\.pb-nav\s*\{[^}]*7\.25rem/s)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
  })
})
```

- [ ] **Step 2: Run the focused test and capture RED**

Run from `app`:

```powershell
npm test -- src/components/StudentLayout.test.ts
```

Expected: FAIL because `student-shell`, the 7.25rem clearance, and the reduced-motion media rule do not exist yet.

- [ ] **Step 3: Implement the canvas and motion fallback**

Change `StudentLayout` to keep its ownership unchanged while exposing the canvas class:

```tsx
export function StudentLayout() {
  return (
    <div className="student-shell relative isolate mx-auto min-h-[100dvh] max-w-md overflow-x-hidden bg-ink">
      <main className="relative z-10 pb-nav">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
```

Update the relevant CSS blocks:

```css
.pb-nav {
  padding-bottom: calc(7.25rem + env(safe-area-inset-bottom));
}

.student-shell {
  background:
    radial-gradient(circle at 88% 8%, rgba(232, 120, 78, 0.12), transparent 27rem),
    radial-gradient(circle at 8% 52%, rgba(255, 138, 92, 0.05), transparent 22rem),
    var(--color-ink);
}

@media (prefers-reduced-motion: reduce) {
  html:focus-within {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/StudentLayout.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the independently testable foundation**

```powershell
git add app/src/components/StudentLayout.tsx app/src/components/StudentLayout.test.ts app/src/index.css
git commit -m "feat: add Angela mobile visual foundation"
```

---

### Task 2: Floating liquid-glass student navigation

**Files:**
- Modify: `app/src/components/BottomNav.tsx`
- Modify: `app/src/components/BottomNav.test.ts`

**Interfaces:**
- Consumes: the unchanged four route records and React Router `NavLink` active state.
- Produces: `<nav aria-label="Navegação principal" data-visual="floating-glass">` with one active orange capsule and four visible icon/label targets.

- [ ] **Step 1: Extend the existing test with the new public visual and accessibility contract**

Add assertions without weakening the existing order, route, no-Biblioteca, and active-route checks:

```tsx
it('renders a floating glass navigation with one active capsule', () => {
  const html = render('/treino')
  const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0]

  expect(html).toContain('aria-label="Navegação principal"')
  expect(html).toContain('data-visual="floating-glass"')
  expect(activeLink).toContain('href="/treino"')
  expect(activeLink).toContain('bg-coral/15')
  expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
})
```

Normalize the expected accented label in the existing test to the literal UTF-8 string `Início` if the file displays mojibake in the terminal; do not change the rendered copy.

- [ ] **Step 2: Run the focused test and capture RED**

Run: `npm test -- src/components/BottomNav.test.ts`

Expected: the new test FAILS because the current edge-to-edge bar has no accessible navigation label, floating-glass marker, or active capsule background.

- [ ] **Step 3: Implement the floating four-item pill**

Keep `items` unchanged and replace only the JSX/class treatment:

```tsx
export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      data-visual="floating-glass"
      className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 px-4"
    >
      <div className="pointer-events-auto mx-auto grid h-[4.5rem] max-w-[380px] grid-cols-4 gap-1 rounded-[2rem] border border-white/10 bg-black/75 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.55rem] px-1 text-center transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-bright/80 ${
                isActive
                  ? 'bg-coral/15 text-coral-bright shadow-[inset_0_0_0_1px_rgba(255,138,92,0.18)]'
                  : 'text-muted hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-5 w-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="truncate text-[10px] font-semibold tracking-wide">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Run focused navigation and layout tests**

Run:

```powershell
npm test -- src/components/BottomNav.test.ts src/components/StudentLayout.test.ts
```

Expected: PASS; four destinations remain in exact order and only `/treino` is active in the active-state fixture.

- [ ] **Step 5: Commit the navigation**

```powershell
git add app/src/components/BottomNav.tsx app/src/components/BottomNav.test.ts
git commit -m "feat: float Angela student navigation"
```

---

### Task 3: Testable anamnesis progress and question controls

**Files:**
- Create: `app/src/components/anamnesis/AnamnesisProgress.tsx`
- Create: `app/src/components/anamnesis/AnamnesisProgress.test.ts`
- Create: `app/src/components/anamnesis/AnamnesisQuestionInput.tsx`
- Create: `app/src/components/anamnesis/AnamnesisQuestionInput.test.ts`

**Interfaces:**
- Consumes: `AnamnesisStep`, `AnamnesisAnswer`, `AnamnesisStepKey`, and `AngelaAnamnesisJourney.toggleMultiAnswer` from `features/anamnesis`.
- Produces: `AnamnesisProgress(props)`, `AnamnesisQuestionInput(props)`, and `interactionHintForStep(step): string` for use by `Anamnese.tsx`.

- [ ] **Step 1: Write failing SSR tests for progress and answer semantics**

Create `AnamnesisProgress.test.ts`:

```tsx
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnamnesisProgress } from './AnamnesisProgress'

it('renders one segment per question and announces progress', () => {
  const html = renderToStaticMarkup(
    createElement(AnamnesisProgress, {
      currentStep: 3,
      totalSteps: 5,
      completed: 2,
      percentage: 40,
    }),
  )

  expect((html.match(/data-progress-segment/g) ?? [])).toHaveLength(5)
  expect(html).toContain('data-state="current"')
  expect(html).toContain('Questão 3 de 5')
  expect(html).toContain('40% concluído')
  expect(html).toContain('2 de 5 respostas válidas')
})
```

Create `AnamnesisQuestionInput.test.ts`:

```tsx
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AngelaAnamnesisJourney } from '../../features/anamnesis'
import {
  AnamnesisQuestionInput,
  interactionHintForStep,
} from './AnamnesisQuestionInput'

describe('AnamnesisQuestionInput', () => {
  it('keeps catalog values behind accessible selected cards', () => {
    const step = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'nutrition_goal',
    )!
    const selected = step.options![0]
    const html = renderToStaticMarkup(
      createElement(AnamnesisQuestionInput, {
        step,
        answer: selected.value,
        onChange: () => undefined,
      }),
    )

    expect(html).toContain(`aria-pressed="true"`)
    expect(html).toContain(selected.label)
    expect(html).toContain('data-option-index="01"')
    expect(html).not.toContain('localStorage')
  })

  it('provides exact interaction hints without inventing option copy', () => {
    const single = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'nutrition_goal',
    )!
    const multi = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'dietary_restrictions',
    )!

    expect(interactionHintForStep(single)).toBe('Escolha uma opção')
    expect(interactionHintForStep(multi)).toBe('Selecione todas que se aplicam')
  })
})
```

- [ ] **Step 2: Run the new tests and capture RED**

Run:

```powershell
npm test -- src/components/anamnesis/AnamnesisProgress.test.ts src/components/anamnesis/AnamnesisQuestionInput.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement segmented progress**

Create `AnamnesisProgress.tsx` with this public signature and state mapping:

```tsx
type Props = Readonly<{
  currentStep: number
  totalSteps: number
  completed: number
  percentage: number
}>

export function AnamnesisProgress({ currentStep, totalSteps, completed, percentage }: Props) {
  return (
    <div aria-label={`Progresso da anamnese: ${percentage}% concluído`}>
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <span className="text-white">Questão {currentStep} de {totalSteps}</span>
        <span className="text-coral-bright">{percentage}% concluído</span>
      </div>
      <ol
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const state = index + 1 === currentStep ? 'current' : index + 1 < currentStep ? 'complete' : 'pending'
          return (
            <li
              key={index}
              data-progress-segment
              data-state={state}
              className={`h-1 rounded-full ${
                state === 'current'
                  ? 'bg-coral-bright shadow-[0_0_10px_rgba(255,138,92,0.65)]'
                  : state === 'complete'
                    ? 'bg-coral/70'
                    : 'bg-white/10'
              }`}
            />
          )
        })}
      </ol>
      <p className="mt-2 text-right text-[11px] text-muted-2">
        {completed} de {totalSteps} respostas válidas
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Implement the isolated question renderer**

Move the type-specific rendering from `Anamnese.tsx` into `AnamnesisQuestionInput.tsx` without changing value or toggle behavior. Use this exact public seam and choice-card structure:

```tsx
import { IconCheck } from '../icons'
import {
  AngelaAnamnesisJourney,
  type AnamnesisAnswer,
  type AnamnesisStep,
  type AnamnesisStepKey,
} from '../../features/anamnesis'

type Props = Readonly<{
  step: AnamnesisStep
  answer: AnamnesisAnswer | undefined
  issue?: string
  onChange: (answer: AnamnesisAnswer | undefined) => void
}>

export function interactionHintForStep(step: AnamnesisStep): string {
  if (step.type === 'single') return 'Escolha uma opção'
  if (step.type === 'multi') return 'Selecione todas que se aplicam'
  return 'Preencha o campo abaixo'
}

export function AnamnesisQuestionInput({ step, answer, issue, onChange }: Props) {
  if (step.type === 'single' || step.type === 'multi') {
    const selected = Array.isArray(answer) ? answer : []
    return (
      <div className="space-y-3">
        {step.options?.map((option, index) => {
          const checked = step.type === 'single'
            ? answer === option.value
            : selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                if (step.type === 'single') return onChange(option.value)
                const toggled = AngelaAnamnesisJourney.toggleMultiAnswer(
                  step.key as AnamnesisStepKey,
                  selected,
                  option.value,
                )
                onChange(toggled.length === 0 ? undefined : toggled)
              }}
              className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-bright/80 ${
                checked
                  ? 'border-coral-bright/80 bg-gradient-to-r from-coral/20 to-coral-deep/10 text-white shadow-[0_10px_30px_-18px_rgba(255,138,92,0.9)]'
                  : 'border-white/8 bg-surface/90 text-neutral-200 hover:border-white/20'
              }`}
            >
              <span
                data-option-index={String(index + 1).padStart(2, '0')}
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${checked ? 'bg-coral-bright text-ink' : 'bg-white/6 text-muted'}`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{option.label}</span>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${step.type === 'single' ? 'rounded-full' : 'rounded-lg'} border ${checked ? 'border-coral-bright bg-coral-bright text-ink' : 'border-muted-2 text-transparent'}`}>
                <IconCheck className="h-3.5 w-3.5" />
              </span>
            </button>
          )
        })}
        {issue && <p className="pt-1 text-sm text-red-300" role="alert">{issue}</p>}
      </div>
    )
  }

  const fieldClass = 'w-full rounded-2xl border-2 border-white/10 bg-surface/90 text-white outline-none transition focus:border-coral-bright/70 focus:ring-4 focus:ring-coral/10'

  if (step.type === 'text') {
    const text = typeof answer === 'string' ? answer : ''
    return (
      <div>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          maxLength={step.rules?.maxLength}
          rows={6}
          className={`${fieldClass} resize-none px-4 py-3 text-[15px] leading-relaxed placeholder:text-muted-2`}
          placeholder="Escreva aqui…"
          aria-invalid={Boolean(issue)}
        />
        <div className="mt-2 flex justify-between gap-3 text-xs">
          <span className="text-red-300" role={issue ? 'alert' : undefined}>{issue}</span>
          <span className="shrink-0 text-muted-2">{text.length}/{step.rules?.maxLength ?? 500}</span>
        </div>
      </div>
    )
  }

  const value = typeof answer === 'number' || typeof answer === 'string' ? answer : ''
  return (
    <label className="block">
      <span className="sr-only">{step.prompt}</span>
      <div className="relative">
        <input
          type={step.type}
          value={value}
          min={step.rules?.min}
          max={step.rules?.max}
          step={step.inputStep}
          onChange={(event) => {
            if (event.target.value === '') onChange(undefined)
            else if (step.type === 'number') onChange(event.target.valueAsNumber)
            else onChange(event.target.value)
          }}
          aria-invalid={Boolean(issue)}
          className={`${fieldClass} h-16 px-4 pr-14 text-lg`}
        />
        {step.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">
            {step.unit}
          </span>
        )}
      </div>
      {issue && <span className="mt-2 block text-sm text-red-300" role="alert">{issue}</span>}
    </label>
  )
}
```

The conversion branches above preserve the current empty-value, numeric `valueAsNumber`, date string, min/max, `inputStep`, max length, unit, counter, and validation behavior.

- [ ] **Step 5: Run the focused component tests and verify GREEN**

Run the Task 3 command again.

Expected: PASS, 3 tests, with no browser storage or generated option descriptions.

- [ ] **Step 6: Commit the anamnesis visual primitives**

```powershell
git add app/src/components/anamnesis
git commit -m "feat: add Angela anamnesis visual controls"
```

---

### Task 4: Integrate the Paizao-inspired anamnesis screen without changing the journey

**Files:**
- Modify: `app/src/pages/Anamnese.tsx`
- Modify: `app/src/index.css`
- Modify: `app/src/features/anamnesis/AnamneseRepositoryWiring.test.ts`

**Interfaces:**
- Consumes: `AnamnesisProgress`, `AnamnesisQuestionInput`, and `interactionHintForStep` from Task 3; all existing journey/repository state remains local to `Anamnese.tsx`.
- Produces: the redesigned step, review, submitting, delivery, and error surfaces on the existing `/anamnese` route.

- [ ] **Step 1: Add a failing integration contract around the extracted seams and clinical-storage boundary**

In `AnamneseRepositoryWiring.test.ts`, read the two new component sources into `browserSource`, then add:

```tsx
it('composes the visual controls without replacing the journey or repository', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src', 'pages', 'Anamnese.tsx'),
    'utf8',
  )

  expect(source).toContain('AnamnesisProgress')
  expect(source).toContain('AnamnesisQuestionInput')
  expect(source).toContain('interactionHintForStep')
  expect(source).toContain('AngelaAnamnesisJourney.createState')
  expect(source).toContain('AngelaAnamnesisJourney.createDraft')
  expect(source).toContain('SerializedAnamnesisDraftSaver')
  expect(source).toContain('aria-labelledby="anamnesis-question"')
})
```

Extend the existing browser-source concatenation:

```tsx
const progressSource = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'anamnesis', 'AnamnesisProgress.tsx'),
  'utf8',
)
const inputSource = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'anamnesis', 'AnamnesisQuestionInput.tsx'),
  'utf8',
)
const browserSource = `${appSource}\n${repositorySource}\n${progressSource}\n${inputSource}`
```

- [ ] **Step 2: Run the integration test and capture RED**

Run: `npm test -- src/features/anamnesis/AnamneseRepositoryWiring.test.ts`

Expected: the composition assertion FAILS because the page still owns the old `QuestionInput` and continuous progress bar.

- [ ] **Step 3: Replace only the page's presentational wiring**

Delete the local `QuestionProps`, `QuestionInput`, and old continuous progress markup. Import and render:

```tsx
import {
  AnamnesisQuestionInput,
  interactionHintForStep,
} from '../components/anamnesis/AnamnesisQuestionInput'
import { AnamnesisProgress } from '../components/anamnesis/AnamnesisProgress'
```

Use this top hierarchy in the question phase:

```tsx
<div className="anamnesis-canvas min-h-[100dvh] px-4 pb-6 safe-top">
  <header className="mx-auto flex max-w-md items-center justify-between gap-3 pt-1">
    <button
      type="button"
      aria-label={state.stepIndex === 0 ? 'Sair da conta' : 'Voltar uma etapa'}
      onClick={() => (state.stepIndex === 0 ? leave() : move('back'))}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-bright/80"
    >
      <IconArrowLeft className="h-5 w-5" />
    </button>
    <div className="min-w-0 flex-1 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-coral-bright">Anamnese Angela</p>
      <p className="mt-0.5 text-[11px] text-muted">Seu plano começa aqui</p>
    </div>
    <img
      src="/brand/logo-round.jpeg"
      alt="Angela Borges"
      className="h-11 w-11 rounded-full border border-coral/35 object-cover shadow-[0_0_20px_rgba(232,120,78,0.16)]"
    />
  </header>

  <div className="mx-auto mt-6 max-w-md">
    <AnamnesisProgress
      currentStep={state.stepIndex + 1}
      totalSteps={progress.total}
      completed={progress.completed}
      percentage={progress.percentage}
    />
  </div>
  <div className="mx-auto mt-5 max-w-md">
    <SectionRail activeSection={currentStep.section} />
  </div>
  <div className="mx-auto mt-4 max-w-md">
    <PersistenceNotice connected={Boolean(repository)} saveState={saveState} />
    {loadError && <p className="mt-2 text-xs text-red-300">{loadError}</p>}
  </div>
  <section className="mx-auto mt-7 max-w-md animate-fade-up text-center" aria-labelledby="anamnesis-question">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral-bright">{sectionLabels[currentStep.section]}</p>
    <h1 id="anamnesis-question" className="mx-auto mt-2 max-w-sm text-display text-[2rem] leading-[1.08] text-white">{currentStep.prompt}</h1>
    {currentStep.helper && <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{currentStep.helper}</p>}
    <p className="mt-4 text-xs font-medium text-neutral-400">{interactionHintForStep(currentStep)}</p>
    <div className="mt-5 text-left">
      <AnamnesisQuestionInput
        step={currentStep}
        answer={currentAnswer}
        issue={currentIssue?.message}
        onChange={(value) => changeAnswer(currentStep.key as AnamnesisStepKey, value)}
      />
    </div>
  </section>

  <div className="sticky bottom-0 mx-auto mt-8 grid max-w-md grid-cols-[auto_1fr] gap-3 bg-gradient-to-t from-ink via-ink/95 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
    <Button variant="ghost" onClick={() => move('back')} disabled={state.stepIndex === 0}>
      Anterior
    </Button>
    <Button full onClick={() => move('next')}>
      {state.stepIndex === progress.total - 1 ? 'Revisar respostas' : 'Continuar'}
    </Button>
  </div>
</div>
```

Add this named canvas to `index.css`:

```css
.anamnesis-canvas {
  background:
    radial-gradient(circle at 92% 4%, rgba(232, 120, 78, 0.15), transparent 23rem),
    radial-gradient(circle at 5% 60%, rgba(255, 138, 92, 0.06), transparent 20rem),
    var(--color-ink);
}
```

Apply these exact surface rules to the helpers already in `Anamnese.tsx`:

- `PersistenceNotice`: `rounded-2xl border px-3 py-2.5 text-xs leading-relaxed backdrop-blur-sm`; connected uses `border-coral/25 bg-coral/10`, disconnected uses `border-amber-400/25 bg-amber-400/10`.
- `SectionRail`: the list remains a three-column ordered list; each item becomes a `rounded-full` 44-pixel-tall phase pill. Active uses `border-coral/60 bg-coral/15 text-coral-bright`, completed uses the existing emerald state, and pending uses `border-white/10 bg-white/5 text-muted`.
- `ReviewCard`: section groups use `rounded-3xl border border-white/10 bg-surface/85`; rows keep their current prompt/value ordering and use `divide-white/10`.
- Submitting and terminal states use the `.anamnesis-canvas` root plus one centered `max-w-sm rounded-[2rem] border border-white/10 bg-surface/80 p-6 backdrop-blur-xl` status card.
- Hydration and submit errors use the same status card with `border-red-400/25 bg-red-400/10`; preserve the current error title, message, and retry label.

Preserve every current text string, status branch, retry button, `getDeliveryStatus`, `refreshDelivery`, `submit`, `move`, and `leave` callback.

- [ ] **Step 4: Run the focused integration and domain tests**

Run:

```powershell
npm test -- src/features/anamnesis/AnamneseRepositoryWiring.test.ts src/features/anamnesis/AngelaAnamnesisJourney.test.ts src/features/anamnesis/AnamnesisRouteGate.test.ts
```

Expected: PASS; repository construction, 25-step state transitions, storage prohibition, delivery statuses, and route gating remain unchanged.

- [ ] **Step 5: Commit the integrated anamnesis redesign**

```powershell
git add app/src/pages/Anamnese.tsx app/src/index.css app/src/features/anamnesis/AnamneseRepositoryWiring.test.ts
git commit -m "feat: redesign Angela anamnesis journey"
```

---

### Task 5: Grouped profile surface and guarded logout row

**Files:**
- Create: `app/src/components/profile/ProfileView.tsx`
- Create: `app/src/components/profile/ProfileView.test.ts`
- Modify: `app/src/pages/Perfil.tsx`

**Interfaces:**
- Consumes: existing `TeamBadge`, `TEAM_LABELS`, profile/session data, student statistics, and `signOut(): Promise<void>`.
- Produces: `ProfileView(props)` plus a container-owned signing-out/error state that prevents duplicate logout requests.

- [ ] **Step 1: Write failing SSR tests for supported data, groups, and logout states**

Create `ProfileView.test.ts`:

```tsx
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProfileView } from './ProfileView'

const baseProps = {
  fullName: 'Aluna Teste',
  email: 'aluna@example.test',
  team: 1,
  checkins: 7,
  completed: 3,
  signingOut: false,
  signOutError: null,
  onSignOut: () => undefined,
}

describe('ProfileView', () => {
  it('groups only Angela-supported identity, progress, and account fields', () => {
    const html = renderToStaticMarkup(createElement(ProfileView, baseProps))

    expect(html).toContain('Aluna Teste')
    expect(html).toContain('aluna@example.test')
    expect(html).toContain('Sua evolução')
    expect(html).toContain('Informações da conta')
    expect(html).toContain('Conta')
    expect(html).toContain('Sair da conta')
    expect(html).not.toMatch(/Alterar senha|Notificações|Excluir conta|Suporte/)
  })

  it('disables and relabels logout while the request is active', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileView, { ...baseProps, signingOut: true }),
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Saindo…')
  })

  it('announces a recoverable logout failure', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileView, {
        ...baseProps,
        signOutError: 'Não foi possível sair. Tente novamente.',
      }),
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Não foi possível sair. Tente novamente.')
  })
})
```

- [ ] **Step 2: Run the focused test and capture RED**

Run: `npm test -- src/components/profile/ProfileView.test.ts`

Expected: FAIL because `ProfileView` does not exist.

- [ ] **Step 3: Implement the pure grouped profile view**

Create the component with this contract:

```tsx
import type { ReactNode } from 'react'
import { TeamBadge } from '../TeamBadge'
import { IconCheck, IconFlame, IconLogout } from '../icons'
import { TEAM_LABELS } from '../../lib/supabase'

type Props = Readonly<{
  fullName: string
  email: string
  team: number
  checkins: number
  completed: number
  signingOut: boolean
  signOutError: string | null
  onSignOut: () => void
}>

export function ProfileView(props: Props) {
  return (
    <div className="space-y-7 px-4 pt-5 safe-top">
      <header className="animate-fade-up flex flex-col items-center text-center">
        <div className="rounded-full bg-gradient-to-br from-coral-bright via-coral to-coral-deep p-[2px] shadow-[0_16px_45px_-20px_rgba(255,138,92,0.9)]">
          <img src="/brand/logo-round.jpeg" alt="Angela Borges" className="h-24 w-24 rounded-full object-cover ring-4 ring-ink" />
        </div>
        <h1 className="mt-4 text-display text-3xl text-white">{props.fullName}</h1>
        <p className="mt-1 text-sm text-muted">{props.email}</p>
        <div className="mt-3"><TeamBadge team={props.team} /></div>
      </header>

      <section aria-labelledby="profile-progress">
        <h2 id="profile-progress" className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Sua evolução</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<IconFlame className="h-5 w-5" />} value={props.checkins} label="check-ins" />
          <StatCard icon={<IconCheck className="h-5 w-5" />} value={props.completed} label="fichas concluídas" />
        </div>
      </section>

      <ProfileGroup title="Informações da conta">
        <ProfileRow label="Nível atual" value={`Team ${props.team} · ${TEAM_LABELS[props.team]}`} />
        <ProfileRow label="Nome" value={props.fullName} />
        <ProfileRow label="E-mail" value={props.email} last />
      </ProfileGroup>

      <ProfileGroup title="Conta">
        <button
          type="button"
          disabled={props.signingOut}
          aria-busy={props.signingOut}
          onClick={props.onSignOut}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-red-300 transition hover:bg-red-400/5 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10"><IconLogout className="h-5 w-5" /></span>
          <span className="text-sm font-semibold">{props.signingOut ? 'Saindo…' : 'Sair da conta'}</span>
        </button>
      </ProfileGroup>
      {props.signOutError && <p className="text-sm text-red-300" role="alert">{props.signOutError}</p>}
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-surface/80 p-4 shadow-[0_16px_45px_-32px_rgba(0,0,0,0.95)] backdrop-blur-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral/15 text-coral-bright">{icon}</span>
      <p className="mt-3 text-display text-3xl text-white">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}

function ProfileGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = `profile-${title.toLowerCase().replaceAll(' ', '-')}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/80 shadow-[0_16px_45px_-32px_rgba(0,0,0,0.95)] backdrop-blur-sm">{children}</div>
    </section>
  )
}

function ProfileRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex min-h-14 items-center justify-between gap-4 px-4 py-3 ${last ? '' : 'border-b border-white/10'}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-white">{value}</span>
    </div>
  )
}
```

Keep all helpers private to `ProfileView.tsx`; `ProfileView` is the only exported presentation interface.

- [ ] **Step 4: Wire the data container and guarded asynchronous logout**

Reduce `Perfil.tsx` to data loading and this explicit state machine:

```tsx
const [signingOut, setSigningOut] = useState(false)
const [signOutError, setSignOutError] = useState<string | null>(null)

async function handleSignOut() {
  if (signingOut) return
  setSigningOut(true)
  setSignOutError(null)
  try {
    await signOut()
  } catch {
    setSigningOut(false)
    setSignOutError('Não foi possível sair. Tente novamente.')
  }
}

return (
  <ProfileView
    fullName={profile?.full_name ?? '—'}
    email={email}
    team={team}
    checkins={checkins}
    completed={completed}
    signingOut={signingOut}
    signOutError={signOutError}
    onSignOut={() => void handleSignOut()}
  />
)
```

Remove no data hook, team calculation, count calculation, or authentication call.

- [ ] **Step 5: Run profile, button, auth, and navigation tests**

Run:

```powershell
npm test -- src/components/profile/ProfileView.test.ts src/components/Button.test.ts src/lib/auth/auth-state.test.ts src/components/BottomNav.test.ts
```

Expected: PASS; profile state renders correctly and existing auth/button/navigation contracts remain green.

- [ ] **Step 6: Commit the profile redesign**

```powershell
git add app/src/components/profile app/src/pages/Perfil.tsx
git commit -m "feat: redesign Angela student profile"
```

---

### Task 6: Full verification, visual QA, synchronization, and GitHub push

**Files:**
- Modify only if a verification failure proves an in-scope defect in Tasks 1-5.
- Read: `.testsprite/config.json` when present.

**Interfaces:**
- Consumes: the completed local branch and the repository's configured origin.
- Produces: a clean, verified `main` commit pushed to `origin/main`, plus sanitized evidence of tests and visual QA.

- [ ] **Step 1: Run the complete local quality gate**

From `app`:

```powershell
npm test
npm run lint
npm run build
```

Expected: all commands exit 0. If any fails, diagnose the first causal failure, write or strengthen a regression test, apply the smallest in-scope fix, and rerun the affected focused test before repeating this gate.

- [ ] **Step 2: Start the built preview and verify localhost before browser QA**

Confirm port 4173 is free, launch the production preview hidden, and probe it before opening a browser:

```powershell
$previewPort = 4173
if (Get-NetTCPConnection -LocalPort $previewPort -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $previewPort is already in use"
}
$previewOut = Join-Path $env:TEMP 'angela-visual-preview.out.log'
$previewErr = Join-Path $env:TEMP 'angela-visual-preview.err.log'
$preview = Start-Process -FilePath (Get-Command npm.cmd).Source `
  -ArgumentList @('run', 'preview', '--', '--host', '127.0.0.1', '--port', "$previewPort") `
  -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $previewOut -RedirectStandardError $previewErr
$response = Invoke-WebRequest -Uri "http://127.0.0.1:$previewPort" -UseBasicParsing
if ($response.StatusCode -ne 200) { throw "Preview returned $($response.StatusCode)" }
```

Readback requirement: `http://127.0.0.1:4173` returns HTTP 200 and contains the Vite application shell. Keep the process identifier so it can be stopped after QA.

- [ ] **Step 3: Inspect the redesigned surfaces at mobile widths**

Use a disposable named Playwright CLI session because this QA does not require Felipe's personal Opera profile:

```powershell
playwright-cli -s=angela-visual open http://127.0.0.1:4173
playwright-cli -s=angela-visual resize 320 700
playwright-cli -s=angela-visual snapshot
playwright-cli -s=angela-visual screenshot
playwright-cli -s=angela-visual resize 390 844
playwright-cli -s=angela-visual snapshot
```

Authenticate only through an existing DPAPI-backed synthetic QA account, injected with the operational-secrets workflow; never print or place its credential in a CLI argument. If no safe QA account can reach a required state, record that specific state as unverified instead of creating production data implicitly. Inspect:

- first anamnesis question;
- selected single option and multi-option states;
- validation alert;
- review and one terminal-state fixture or reachable state;
- each of the four bottom-nav active routes;
- profile groups, logout row, and bottom safe-area clearance.

For each surface, verify no horizontal overflow, no clipped label, no nav/content collision, visible focus treatment, correct black/orange identity, and no Biblioteca. Capture only synthetic/non-sensitive screenshots. Close and clean up after readback:

```powershell
playwright-cli -s=angela-visual close
Stop-Process -Id $preview.Id
Remove-Item -LiteralPath $previewOut, $previewErr -ErrorAction SilentlyContinue
```

- [ ] **Step 4: Run TestSprite only when its deployed-URL prerequisites are true**

Check, without setup or plaintext credentials:

```powershell
testsprite --version
testsprite auth status
```

Resolve the project from `$TESTSPRITE_PROJECT_ID`, `.testsprite/config.json`, or `testsprite project list --output json`. If no TestSprite project is linked or the new commit is not yet on a publicly reachable URL, report the gate as not applicable or unverified-before-deploy; do not claim PASS and do not run against localhost. If an existing public test targets the deployed new commit, run it with `--wait --timeout 600 --output json`; on failure download and inspect its artifact before changing code.

- [ ] **Step 5: Review the final diff and repository hygiene**

From the repository root:

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline --decorate -8
```

Expected: only the documented design/plan and Angela UI/test changes; no `.env`, credentials, clinical data, screenshots, `dist`, temporary QA scripts, or unrelated files.

- [ ] **Step 6: Synchronize with the latest remote main without overwriting remote work**

```powershell
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
```

If the remote count is nonzero, inspect the incoming commits and rebase the local commits onto `origin/main`; if conflicts occur, stop normal execution and use the resolving-merge-conflicts workflow. Rerun focused conflict-area tests and the full test/lint/build gate after synchronization.

- [ ] **Step 7: Push and read back the exact remote commit**

```powershell
git push origin main
git ls-remote origin refs/heads/main
git rev-parse HEAD
```

Expected: the two SHAs are identical. Do not force-push.

- [ ] **Step 8: Record completion in the Nexus Vault**

Run the canonical Vault boot, find or create today's Angela subject CTX, and append only the distilled outcome: files/behavior changed, final commit, local gates, remote readback, visual QA, TestSprite status, residual risk, and next production gate. Update the monthly context index and any Angela project state note whose current truth changed. Store no secret, raw user identity, or clinical answer. Read the saved note back before the final response.
