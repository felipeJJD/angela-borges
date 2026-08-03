import { ANGELA_ANAMNESIS_CATALOG } from './catalog'
import { createAnamnesisDraft } from './draft'
import { createAnamnesisJourneyState, reduceAnamnesisJourney } from './journey'
import {
  getAnamnesisProgress,
  toggleAnamnesisMultiAnswer,
  validateAnamnesisAnswer,
  validateAnamnesisDraft,
} from './validation'

export const AngelaAnamnesisJourney = Object.freeze({
  catalog: ANGELA_ANAMNESIS_CATALOG,
  createDraft: createAnamnesisDraft,
  validateAnswer: validateAnamnesisAnswer,
  validateDraft: validateAnamnesisDraft,
  toggleMultiAnswer: toggleAnamnesisMultiAnswer,
  getProgress: getAnamnesisProgress,
  createState: createAnamnesisJourneyState,
  reducer: reduceAnamnesisJourney,
})

export {
  ANGELA_ANAMNESIS_CATALOG,
  ANGELA_ANAMNESIS_SCHEMA_VERSION,
} from './catalog'
export { createAnamnesisDraft } from './draft'
export type {
  AnamnesisAnswer,
  AnamnesisAnswers,
  AnamnesisDraft,
  AnamnesisDraftStatus,
  CreateAnamnesisDraftInput,
} from './draft'
export { createAnamnesisJourneyState, reduceAnamnesisJourney } from './journey'
export type {
  AnamnesisJourneyAction,
  AnamnesisJourneyError,
  AnamnesisJourneyPhase,
  AnamnesisJourneyState,
} from './journey'
export {
  AnamnesisDraftRevisionConflictError,
  AnamnesisDraftScopeError,
  AnamnesisDraftValidationError,
} from './repository'
export type { AnamnesisDraftRepository } from './repository'
export {
  getAnamnesisProgress,
  toggleAnamnesisMultiAnswer,
  validateAnamnesisAnswer,
  validateAnamnesisDraft,
} from './validation'
export type {
  AnamnesisProgress,
  AnamnesisValidationCode,
  AnamnesisValidationIssue,
  AnamnesisValidationResult,
} from './validation'
export type {
  AnamnesisCatalog,
  AnamnesisOption,
  AnamnesisSection,
  AnamnesisStep,
  AnamnesisStepKey,
  AnamnesisStepRules,
  AnamnesisStepType,
} from './catalog'
