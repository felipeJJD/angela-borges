import {
  ANGELA_ANAMNESIS_CATALOG,
  ANGELA_ANAMNESIS_SCHEMA_VERSION,
  type AnamnesisStep,
  type AnamnesisStepKey,
} from './catalog'
import type { AnamnesisAnswers, AnamnesisDraft } from './draft'

export type AnamnesisValidationCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_option'
  | 'out_of_range'
  | 'invalid_date'
  | 'future_date'
  | 'exclusive_option'
  | 'max_selections'
  | 'duplicate_option'
  | 'too_short'
  | 'too_long'
  | 'schema_mismatch'

export type AnamnesisValidationIssue = Readonly<{
  key: AnamnesisStepKey | 'schemaVersion'
  code: AnamnesisValidationCode
  message: string
}>

export type AnamnesisValidationResult = Readonly<{
  valid: boolean
  issues: readonly AnamnesisValidationIssue[]
}>

type DraftValidationInput = Pick<AnamnesisDraft, 'answers'> &
  Readonly<{ schemaVersion: string }>

const stepByKey = new Map(
  ANGELA_ANAMNESIS_CATALOG.steps.map((step) => [step.key, step]),
)

function result(issues: readonly AnamnesisValidationIssue[]): AnamnesisValidationResult {
  return { valid: issues.length === 0, issues }
}

function issue(
  key: AnamnesisStepKey | 'schemaVersion',
  code: AnamnesisValidationCode,
  message: string,
): AnamnesisValidationIssue {
  return { key, code, message }
}

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  )
}

function validateChoice(
  step: AnamnesisStep,
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  if (typeof value !== 'string') {
    return result([issue(key, 'invalid_type', 'Escolha uma opção válida.')])
  }
  if (!step.options?.some((option) => option.value === value)) {
    return result([issue(key, 'invalid_option', 'A opção escolhida não pertence a esta versão.')])
  }
  return result([])
}

function validateMultiChoice(
  step: AnamnesisStep,
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return result([issue(key, 'invalid_type', 'Selecione uma ou mais opções válidas.')])
  }

  const selected = value as string[]
  const knownOptions = new Set(step.options?.map((option) => option.value))
  if (selected.some((entry) => !knownOptions.has(entry))) {
    return result([issue(key, 'invalid_option', 'Uma opção escolhida não pertence a esta versão.')])
  }

  const exclusiveOption = step.rules?.exclusiveOption
  if (exclusiveOption && selected.includes(exclusiveOption) && selected.length > 1) {
    return result([
      issue(key, 'exclusive_option', 'A opção “nenhuma” deve ser selecionada sozinha.'),
    ])
  }

  const maxSelections = step.rules?.maxSelections
  if (maxSelections !== undefined && selected.length > maxSelections) {
    return result([
      issue(key, 'max_selections', `Escolha no máximo ${maxSelections} opções.`),
    ])
  }

  if (new Set(selected).size !== selected.length) {
    return result([issue(key, 'duplicate_option', 'A mesma opção não pode ser repetida.')])
  }
  return result([])
}

function validateNumber(
  step: AnamnesisStep,
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return result([issue(key, 'invalid_type', 'Informe um número válido.')])
  }
  const min = step.rules?.min
  const max = step.rules?.max
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    return result([
      issue(key, 'out_of_range', `Informe um valor entre ${min ?? 'o mínimo'} e ${max ?? 'o máximo'}.`),
    ])
  }
  return result([])
}

function validateDate(
  step: AnamnesisStep,
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return result([issue(key, 'invalid_date', 'Informe uma data válida.')])
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return result([issue(key, 'invalid_date', 'Informe uma data válida.')])
  }
  if (step.rules?.notFuture && value > new Date().toISOString().slice(0, 10)) {
    return result([issue(key, 'future_date', 'A data não pode estar no futuro.')])
  }
  return result([])
}

function validateText(
  step: AnamnesisStep,
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  if (typeof value !== 'string') {
    return result([issue(key, 'invalid_type', 'Escreva uma resposta válida.')])
  }
  const length = value.trim().length
  if (step.rules?.minLength !== undefined && length < step.rules.minLength) {
    return result([issue(key, 'too_short', 'Conte um pouco mais para eu entender.')])
  }
  if (step.rules?.maxLength !== undefined && length > step.rules.maxLength) {
    return result([
      issue(key, 'too_long', `Use no máximo ${step.rules.maxLength} caracteres.`),
    ])
  }
  return result([])
}

export function validateAnamnesisAnswer(
  key: AnamnesisStepKey,
  value: unknown,
): AnamnesisValidationResult {
  const step = stepByKey.get(key)
  if (!step) {
    return result([issue(key, 'invalid_option', 'A etapa não pertence a esta versão.')])
  }
  if (isMissing(value)) {
    return step.required
      ? result([issue(key, 'required', 'Responda esta etapa para continuar.')])
      : result([])
  }

  switch (step.type) {
    case 'single':
      return validateChoice(step, key, value)
    case 'multi':
      return validateMultiChoice(step, key, value)
    case 'number':
      return validateNumber(step, key, value)
    case 'date':
      return validateDate(step, key, value)
    case 'text':
      return validateText(step, key, value)
  }
}

export function validateAnamnesisDraft(
  draft: DraftValidationInput,
): AnamnesisValidationResult {
  if (draft.schemaVersion !== ANGELA_ANAMNESIS_SCHEMA_VERSION) {
    return result([
      issue(
        'schemaVersion',
        'schema_mismatch',
        'Este rascunho pertence a outra versão da anamnese.',
      ),
    ])
  }

  return result(
    ANGELA_ANAMNESIS_CATALOG.steps.flatMap((step) =>
      validateAnamnesisAnswer(
        step.key as AnamnesisStepKey,
        draft.answers[step.key as AnamnesisStepKey],
      ).issues,
    ),
  )
}

export function toggleAnamnesisMultiAnswer(
  key: AnamnesisStepKey,
  current: readonly string[],
  option: string,
): readonly string[] {
  const step = stepByKey.get(key)
  if (!step || step.type !== 'multi') throw new Error(`${key} is not a multi-choice step`)
  if (!step.options?.some(({ value }) => value === option)) {
    throw new Error(`${option} is not a valid option for ${key}`)
  }
  if (current.includes(option)) return current.filter((value) => value !== option)

  const exclusiveOption = step.rules?.exclusiveOption
  if (option === exclusiveOption) return [option]

  const withoutExclusive = exclusiveOption
    ? current.filter((value) => value !== exclusiveOption)
    : [...current]
  if (
    step.rules?.maxSelections !== undefined &&
    withoutExclusive.length >= step.rules.maxSelections
  ) {
    return current
  }
  return [...withoutExclusive, option]
}

export type AnamnesisProgress = Readonly<{
  completed: number
  total: number
  percentage: number
}>

export function getAnamnesisProgress(answers: AnamnesisAnswers): AnamnesisProgress {
  const total = ANGELA_ANAMNESIS_CATALOG.steps.length
  const completed = ANGELA_ANAMNESIS_CATALOG.steps.filter(
    (step) =>
      validateAnamnesisAnswer(
        step.key as AnamnesisStepKey,
        answers[step.key as AnamnesisStepKey],
      ).valid,
  ).length
  return { completed, total, percentage: Math.round((completed / total) * 100) }
}
