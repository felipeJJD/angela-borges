import {
  ANGELA_ANAMNESIS_SCHEMA_VERSION,
  type AnamnesisStepKey,
} from './catalog'

export type AnamnesisAnswer = string | number | readonly string[]
export type AnamnesisAnswers = Partial<
  Record<AnamnesisStepKey, AnamnesisAnswer | undefined>
>
export type AnamnesisDraftStatus = 'draft' | 'submitting' | 'submitted'

export type AnamnesisDraft = Readonly<{
  id: string
  userId: string
  schemaVersion: typeof ANGELA_ANAMNESIS_SCHEMA_VERSION
  revision: number
  status: AnamnesisDraftStatus
  answers: Readonly<AnamnesisAnswers>
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  idempotencyKey: string
}>

export type CreateAnamnesisDraftInput = Readonly<{
  userId: string
  id?: string
  now?: string
}>

export function createAnamnesisDraft({
  userId,
  id = globalThis.crypto.randomUUID(),
  now = new Date().toISOString(),
}: CreateAnamnesisDraftInput): AnamnesisDraft {
  if (!userId.trim()) throw new Error('userId is required to create an anamnesis draft')
  if (!id.trim()) throw new Error('id is required to create an anamnesis draft')

  return {
    id,
    userId,
    schemaVersion: ANGELA_ANAMNESIS_SCHEMA_VERSION,
    revision: 0,
    status: 'draft',
    answers: {},
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    idempotencyKey: `anamnesis:${ANGELA_ANAMNESIS_SCHEMA_VERSION}:${userId}:${id}`,
  }
}
