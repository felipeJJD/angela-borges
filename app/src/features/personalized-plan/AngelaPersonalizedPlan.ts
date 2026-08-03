export const ANGELA_PLAN_SCHEMA_VERSION = 'angela-plan.v1' as const

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const GENERATION_METADATA_KEYS = [
  'catalogVersion',
  'engineVersion',
  'promptVersion',
  'ragVersion',
  'schemaVersion',
] as const

type JsonObject = Record<string, unknown>

export type AngelaPlanGenerationMetadata = Readonly<{
  catalogVersion: string
  engineVersion: string
  promptVersion: string
  ragVersion: string
  schemaVersion: string
}>

export type AngelaDiet = Readonly<
  JsonObject & {
    meals: readonly Readonly<JsonObject & { foods: readonly JsonObject[] }>[]
  }
>

export type AngelaTraining = Readonly<
  JsonObject & {
    days: readonly Readonly<JsonObject & { exercises: readonly JsonObject[] }>[]
  }
>

export type AngelaPublishedPlan = Readonly<{
  planVersionId: string
  userId: string
  protocolId: string
  protocolVersion: number
  schemaVersion: typeof ANGELA_PLAN_SCHEMA_VERSION
  snapshotHash: string
  state: 'active'
  diet: AngelaDiet
  training: AngelaTraining
  generationMetadata: AngelaPlanGenerationMetadata
  counts: Readonly<{
    dietMeals: number
    trainingDays: number
    trainingExercises: number
  }>
  stagedAt: string
  activatedAt: string
  createdAt: string
  updatedAt: string
}>

export type AngelaPersonalizedPlanState =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{
      kind: 'building'
      submittedAt: string
      deliveryStatus: 'accepted_pending' | 'delivered'
    }>
  | Readonly<{
      kind: 'failed'
      reason: 'delivery-failed' | 'invalid-published-plan' | 'unavailable'
      retryable: boolean
    }>
  | Readonly<{ kind: 'published'; plan: AngelaPublishedPlan }>

export type AngelaAnamnesisSubmissionPointer = Readonly<{
  idempotencyKey: string
  submittedAt: string
}>

export type AngelaAnamnesisDeliveryStatus = Readonly<{
  status: 'accepted_pending' | 'delivered' | 'failed'
  retryable: boolean
  attempts: number
}>

/**
 * Authenticated read seam. The browser adapter is deliberately read-only and
 * binds every request to the current session user.
 */
export interface AngelaPlanDeliverySource {
  readActivePlan(userId: string): Promise<unknown | null>
  readLatestAnamnesisSubmission(
    userId: string,
  ): Promise<AngelaAnamnesisSubmissionPointer | null>
  readAnamnesisDeliveryStatus(
    idempotencyKey: string,
  ): Promise<AngelaAnamnesisDeliveryStatus | null>
}

export interface AngelaPersonalizedPlan {
  load(): Promise<AngelaPersonalizedPlanState>
}

class InvalidPublishedPlanError extends Error {}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function lexicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(lexicalJson).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => `${JSON.stringify(key)}:${lexicalJson(value[key])}`)
      .join(',')}}`
  }
  throw new Error('angela_plan_non_json_value')
}

export async function canonicalizeAngelaPlanSnapshot(
  snapshot: Record<string, unknown>,
): Promise<Readonly<{ canonicalJson: string; snapshotHash: string }>> {
  if (!globalThis.crypto?.subtle) throw new Error('angela_plan_hash_unavailable')
  const canonicalJson = lexicalJson(snapshot)
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson),
  )
  const snapshotHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return { canonicalJson, snapshotHash }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isNonEmptyString(value: unknown, max = 500): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max
  )
}

function isFiniteNumber(value: unknown, min?: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (min === undefined || value >= min)
  )
}

function isStringArray(value: unknown, max = 50): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => typeof item === 'string' && item.length <= 500)
  )
}

function validFood(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    isNonEmptyString(value.name) &&
    isFiniteNumber(value.quantity) &&
    isNonEmptyString(value.unit, 50) &&
    isFiniteNumber(value.calories) &&
    isFiniteNumber(value.protein_g) &&
    isFiniteNumber(value.carbs_g) &&
    isFiniteNumber(value.fat_g) &&
    isStringArray(value.substitutions)
  )
}

function validDiet(value: unknown): value is AngelaDiet {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.goal) ||
    !isFiniteNumber(value.daily_calories, 1) ||
    !isObject(value.macros) ||
    !isFiniteNumber(value.macros.protein_g) ||
    !isFiniteNumber(value.macros.carbs_g) ||
    !isFiniteNumber(value.macros.fat_g) ||
    !isFiniteNumber(value.macros.fiber_g) ||
    !isFiniteNumber(value.water_liters) ||
    typeof value.notes !== 'string' ||
    !Array.isArray(value.meals) ||
    value.meals.length < 1 ||
    value.meals.length > 8
  ) {
    return false
  }

  return value.meals.every(
    (meal) =>
      isObject(meal) &&
      Number.isSafeInteger(meal.order) &&
      Number(meal.order) >= 1 &&
      isNonEmptyString(meal.name) &&
      isNonEmptyString(meal.time, 20) &&
      isFiniteNumber(meal.calories) &&
      Array.isArray(meal.foods) &&
      meal.foods.length >= 1 &&
      meal.foods.length <= 50 &&
      meal.foods.every(validFood),
  )
}

function validExercise(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    Number.isSafeInteger(value.order) &&
    Number(value.order) >= 1 &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.muscle_group) &&
    Number.isSafeInteger(value.sets) &&
    Number(value.sets) >= 1 &&
    isNonEmptyString(value.reps, 100) &&
    Number.isSafeInteger(value.rest_seconds) &&
    Number(value.rest_seconds) >= 0 &&
    (value.technique === null || typeof value.technique === 'string') &&
    (value.notes === null || typeof value.notes === 'string') &&
    isStringArray(value.substitutions)
  )
}

function validTraining(value: unknown): value is AngelaTraining {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.goal) ||
    !isNonEmptyString(value.split) ||
    !Number.isSafeInteger(value.frequency) ||
    Number(value.frequency) < 1 ||
    !Number.isSafeInteger(value.duration_minutes) ||
    Number(value.duration_minutes) < 1 ||
    typeof value.notes !== 'string' ||
    !Array.isArray(value.days) ||
    value.days.length < 1 ||
    value.days.length > 7
  ) {
    return false
  }

  let workoutDays = 0
  for (const day of value.days) {
    if (
      !isObject(day) ||
      (day.type !== undefined && day.type !== 'workout' && day.type !== 'rest') ||
      !isNonEmptyString(day.day_label) ||
      !isNonEmptyString(day.name) ||
      !isStringArray(day.muscle_groups) ||
      typeof day.warmup !== 'string' ||
      typeof day.cooldown !== 'string' ||
      !Array.isArray(day.exercises) ||
      day.exercises.length > 50 ||
      !day.exercises.every(validExercise)
    ) {
      return false
    }
    if (day.type !== 'rest') {
      if (day.exercises.length === 0) return false
      workoutDays += 1
    }
  }
  return workoutDays > 0
}

function validGenerationMetadata(
  value: unknown,
): value is AngelaPlanGenerationMetadata {
  if (!isObject(value)) return false
  const keys = Object.keys(value).sort()
  const expected = [...GENERATION_METADATA_KEYS].sort()
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    GENERATION_METADATA_KEYS.every(
      (key) => typeof value[key] === 'string' && VERSION_PATTERN.test(value[key]),
    )
  )
}

async function mapActivePlan(
  row: unknown,
  expectedUserId: string,
): Promise<AngelaPublishedPlan> {
  if (
    !isObject(row) ||
    row.state !== 'active' ||
    row.user_id !== expectedUserId ||
    typeof row.id !== 'string' ||
    !UUID_PATTERN.test(row.id) ||
    typeof row.protocol_id !== 'string' ||
    !UUID_PATTERN.test(row.protocol_id) ||
    !Number.isSafeInteger(row.protocol_version) ||
    Number(row.protocol_version) < 1 ||
    row.schema_version !== ANGELA_PLAN_SCHEMA_VERSION ||
    typeof row.snapshot_hash !== 'string' ||
    !SHA256_PATTERN.test(row.snapshot_hash) ||
    !validDiet(row.diet) ||
    !validTraining(row.training) ||
    !validGenerationMetadata(row.generation_metadata) ||
    !isTimestamp(row.staged_at) ||
    !isTimestamp(row.activated_at) ||
    !isTimestamp(row.created_at) ||
    !isTimestamp(row.updated_at) ||
    row.superseded_at !== null
  ) {
    throw new InvalidPublishedPlanError()
  }

  const trainingExercises = row.training.days.reduce(
    (total, day) => total + day.exercises.length,
    0,
  )
  const canonical = await canonicalizeAngelaPlanSnapshot({
    user_id: expectedUserId,
    protocol_id: row.protocol_id,
    protocol_version: row.protocol_version,
    schema_version: ANGELA_PLAN_SCHEMA_VERSION,
    diet: row.diet,
    training: row.training,
    generation_metadata: row.generation_metadata,
  })
  if (canonical.snapshotHash !== row.snapshot_hash) {
    throw new InvalidPublishedPlanError()
  }
  return {
    planVersionId: row.id,
    userId: expectedUserId,
    protocolId: row.protocol_id,
    protocolVersion: row.protocol_version as number,
    schemaVersion: ANGELA_PLAN_SCHEMA_VERSION,
    snapshotHash: row.snapshot_hash,
    state: 'active',
    diet: row.diet,
    training: row.training,
    generationMetadata: row.generation_metadata,
    counts: {
      dietMeals: row.diet.meals.length,
      trainingDays: row.training.days.length,
      trainingExercises,
    },
    stagedAt: row.staged_at,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createAngelaPersonalizedPlan(
  userId: string,
  source: AngelaPlanDeliverySource,
): AngelaPersonalizedPlan {
  if (!UUID_PATTERN.test(userId)) throw new Error('A valid user UUID is required')

  return Object.freeze({
    async load(): Promise<AngelaPersonalizedPlanState> {
      try {
        const activePlan = await source.readActivePlan(userId)
        if (activePlan !== null) {
          try {
            return {
              kind: 'published',
              plan: await mapActivePlan(activePlan, userId),
            }
          } catch (error) {
            if (error instanceof InvalidPublishedPlanError) {
              return {
                kind: 'failed',
                reason: 'invalid-published-plan',
                retryable: false,
              }
            }
            throw error
          }
        }

        const submission = await source.readLatestAnamnesisSubmission(userId)
        if (submission === null) return { kind: 'empty' }
        if (
          !UUID_PATTERN.test(submission.idempotencyKey) ||
          !isTimestamp(submission.submittedAt)
        ) {
          return { kind: 'failed', reason: 'unavailable', retryable: true }
        }

        const delivery = await source.readAnamnesisDeliveryStatus(
          submission.idempotencyKey,
        )
        if (delivery === null) {
          return { kind: 'failed', reason: 'unavailable', retryable: true }
        }
        if (delivery.status === 'failed') {
          return {
            kind: 'failed',
            reason: 'delivery-failed',
            retryable: delivery.retryable,
          }
        }
        return {
          kind: 'building',
          submittedAt: submission.submittedAt,
          deliveryStatus: delivery.status,
        }
      } catch {
        return { kind: 'failed', reason: 'unavailable', retryable: true }
      }
    },
  })
}
