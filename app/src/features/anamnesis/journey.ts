import {
  ANGELA_ANAMNESIS_CATALOG,
  ANGELA_ANAMNESIS_SCHEMA_VERSION,
  type AnamnesisStepKey,
} from './catalog'
import type {
  AnamnesisAnswer,
  AnamnesisAnswers,
  AnamnesisDraft,
  AnamnesisDraftStatus,
} from './draft'
import {
  validateAnamnesisAnswer,
  validateAnamnesisDraft,
  type AnamnesisValidationIssue,
} from './validation'

export type AnamnesisJourneyPhase =
  | 'answering'
  | 'review'
  | 'submitting'
  | 'submitted'
  | 'error'

export type AnamnesisJourneyError = Readonly<{
  kind: 'hydration' | 'submit'
  message: string
}>

export type AnamnesisJourneyState = Readonly<{
  draft: AnamnesisDraft
  stepIndex: number
  phase: AnamnesisJourneyPhase
  issues: readonly AnamnesisValidationIssue[]
  error: AnamnesisJourneyError | null
}>

export type AnamnesisJourneyAction =
  | Readonly<{
      type: 'answer_changed'
      key: AnamnesisStepKey
      value: AnamnesisAnswer | undefined
      now: string
    }>
  | Readonly<{ type: 'next' }>
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'review' }>
  | Readonly<{ type: 'hydrate'; draft: unknown }>
  | Readonly<{ type: 'save_succeeded'; draft: AnamnesisDraft }>
  | Readonly<{ type: 'submit_requested'; now: string }>
  | Readonly<{ type: 'submit_succeeded'; draft: AnamnesisDraft }>
  | Readonly<{ type: 'submit_failed'; message: string; now: string }>
  | Readonly<{ type: 'retry' }>

type HydratedDraft = Readonly<{
  id: string
  userId: string
  schemaVersion: string
  revision: number
  status: AnamnesisDraftStatus
  answers: Readonly<AnamnesisAnswers>
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  idempotencyKey: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHydratedDraft(value: unknown): value is HydratedDraft {
  if (!isRecord(value) || !isRecord(value.answers)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.schemaVersion === 'string' &&
    typeof value.revision === 'number' &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    (value.status === 'draft' ||
      value.status === 'submitting' ||
      value.status === 'submitted') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.submittedAt === null || typeof value.submittedAt === 'string') &&
    typeof value.idempotencyKey === 'string'
  )
}

function firstInvalidStep(answers: AnamnesisAnswers): number {
  const index = ANGELA_ANAMNESIS_CATALOG.steps.findIndex(
    (step) =>
      !validateAnamnesisAnswer(
        step.key as AnamnesisStepKey,
        answers[step.key as AnamnesisStepKey],
      ).valid,
  )
  return index === -1 ? ANGELA_ANAMNESIS_CATALOG.steps.length - 1 : index
}

function withHydrationError(
  state: AnamnesisJourneyState,
  message: string,
): AnamnesisJourneyState {
  return {
    ...state,
    phase: 'error',
    issues: [],
    error: { kind: 'hydration', message },
  }
}

export function createAnamnesisJourneyState(
  draft: AnamnesisDraft,
): AnamnesisJourneyState {
  const resumableDraft: AnamnesisDraft =
    draft.status === 'submitting' ? { ...draft, status: 'draft' } : draft
  return {
    draft: resumableDraft,
    stepIndex: firstInvalidStep(resumableDraft.answers),
    phase: resumableDraft.status === 'submitted' ? 'submitted' : 'answering',
    issues: [],
    error: null,
  }
}

function moveToReview(state: AnamnesisJourneyState): AnamnesisJourneyState {
  const validation = validateAnamnesisDraft(state.draft)
  if (validation.valid) {
    return { ...state, phase: 'review', issues: [], error: null }
  }
  const firstIssue = validation.issues[0]
  const issueIndex = ANGELA_ANAMNESIS_CATALOG.steps.findIndex(
    (step) => step.key === firstIssue?.key,
  )
  return {
    ...state,
    phase: 'answering',
    stepIndex: issueIndex >= 0 ? issueIndex : state.stepIndex,
    issues: firstIssue ? [firstIssue] : validation.issues,
    error: null,
  }
}

function acceptHydratedDraft(
  state: AnamnesisJourneyState,
  candidate: unknown,
): AnamnesisJourneyState {
  if (!isHydratedDraft(candidate)) {
    return withHydrationError(state, 'O rascunho recebido é inválido e não foi carregado.')
  }
  if (candidate.userId !== state.draft.userId) {
    return withHydrationError(
      state,
      'O rascunho pertence a outra conta e não foi carregado.',
    )
  }
  if (candidate.schemaVersion !== ANGELA_ANAMNESIS_SCHEMA_VERSION) {
    return withHydrationError(
      state,
      'O rascunho pertence a outra versão e não foi carregado.',
    )
  }

  const hydrated: AnamnesisDraft = {
    ...candidate,
    schemaVersion: ANGELA_ANAMNESIS_SCHEMA_VERSION,
    status: candidate.status === 'submitting' ? 'draft' : candidate.status,
    answers: { ...candidate.answers },
  }
  return {
    draft: hydrated,
    stepIndex: firstInvalidStep(hydrated.answers),
    phase: hydrated.status === 'submitted' ? 'submitted' : 'answering',
    issues: [],
    error: null,
  }
}

export function reduceAnamnesisJourney(
  state: AnamnesisJourneyState,
  action: AnamnesisJourneyAction,
): AnamnesisJourneyState {
  switch (action.type) {
    case 'answer_changed': {
      if (state.phase === 'submitting' || state.phase === 'submitted') return state
      return {
        ...state,
        draft: {
          ...state.draft,
          status: 'draft',
          answers: { ...state.draft.answers, [action.key]: action.value },
          updatedAt: action.now,
          submittedAt: null,
        },
        phase: 'answering',
        issues: state.issues.filter((entry) => entry.key !== action.key),
        error: null,
      }
    }
    case 'next': {
      if (state.phase !== 'answering') return state
      const step = ANGELA_ANAMNESIS_CATALOG.steps[state.stepIndex]
      if (!step) return state
      const validation = validateAnamnesisAnswer(
        step.key as AnamnesisStepKey,
        state.draft.answers[step.key as AnamnesisStepKey],
      )
      if (!validation.valid) return { ...state, issues: validation.issues }
      if (state.stepIndex === ANGELA_ANAMNESIS_CATALOG.steps.length - 1) {
        return moveToReview(state)
      }
      return { ...state, stepIndex: state.stepIndex + 1, issues: [], error: null }
    }
    case 'back': {
      if (state.phase === 'submitting' || state.phase === 'submitted') return state
      if (state.phase === 'review' || state.error?.kind === 'submit') {
        return {
          ...state,
          phase: 'answering',
          stepIndex: ANGELA_ANAMNESIS_CATALOG.steps.length - 1,
          issues: [],
          error: null,
        }
      }
      return {
        ...state,
        phase: 'answering',
        stepIndex: Math.max(0, state.stepIndex - 1),
        issues: [],
        error: null,
      }
    }
    case 'review':
      return state.phase === 'submitting' || state.phase === 'submitted'
        ? state
        : moveToReview(state)
    case 'hydrate':
      return acceptHydratedDraft(state, action.draft)
    case 'save_succeeded': {
      const saved = action.draft
      if (
        saved.id !== state.draft.id ||
        saved.userId !== state.draft.userId ||
        saved.schemaVersion !== state.draft.schemaVersion ||
        saved.idempotencyKey !== state.draft.idempotencyKey ||
        saved.status !== 'draft' ||
        saved.revision < state.draft.revision
      ) {
        return state
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          revision: saved.revision,
          createdAt: saved.createdAt,
        },
      }
    }
    case 'submit_requested': {
      if (state.phase === 'submitting' || state.phase === 'submitted') return state
      if (state.phase !== 'review') return moveToReview(state)
      const validation = validateAnamnesisDraft(state.draft)
      if (!validation.valid) return moveToReview(state)
      return {
        ...state,
        phase: 'submitting',
        issues: [],
        error: null,
        draft: {
          ...state.draft,
          status: 'submitting',
          updatedAt: action.now,
        },
      }
    }
    case 'submit_failed':
      if (state.phase !== 'submitting') return state
      return {
        ...state,
        phase: 'error',
        error: { kind: 'submit', message: action.message },
        draft: {
          ...state.draft,
          status: 'draft',
          updatedAt: action.now,
          submittedAt: null,
        },
      }
    case 'submit_succeeded':
      if (state.phase !== 'submitting') return state
      if (
        action.draft.id !== state.draft.id ||
        action.draft.userId !== state.draft.userId ||
        action.draft.schemaVersion !== state.draft.schemaVersion ||
        action.draft.idempotencyKey !== state.draft.idempotencyKey ||
        action.draft.status !== 'submitted'
      ) {
        return {
          ...state,
          phase: 'error',
          error: {
            kind: 'submit',
            message: 'O retorno do envio não corresponde a este rascunho.',
          },
          draft: { ...state.draft, status: 'draft' },
        }
      }
      return { ...state, phase: 'submitted', draft: action.draft, issues: [], error: null }
    case 'retry':
      if (state.phase !== 'error') return state
      return {
        ...state,
        phase: state.error?.kind === 'submit' ? 'review' : 'answering',
        issues: [],
        error: null,
      }
  }
}
