import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ANGELA_ANAMNESIS_CATALOG,
  ANGELA_ANAMNESIS_SCHEMA_VERSION,
  type AnamnesisStepKey,
} from './catalog'
import type { AnamnesisAnswers, AnamnesisDraft } from './draft'
import {
  AnamnesisDraftRevisionConflictError,
  AnamnesisDraftScopeError,
  AnamnesisDraftValidationError,
  type AnamnesisDraftRepository,
} from './repository'
import { validateAnamnesisAnswer, validateAnamnesisDraft } from './validation'

const DRAFT_COLUMNS = [
  'id',
  'user_id',
  'schema_version',
  'revision',
  'status',
  'answers',
  'created_at',
  'updated_at',
  'submitted_at',
  'idempotency_key',
].join(', ')

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const stepKeys = new Set(ANGELA_ANAMNESIS_CATALOG.steps.map(({ key }) => key))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function invalidRow(message: string): never {
  throw new Error(`Invalid anamnesis draft row: ${message}`)
}

function mapAnswers(value: unknown): AnamnesisAnswers {
  if (!isRecord(value)) invalidRow('answers must be a JSON object')

  const answers: Record<string, string | number | readonly string[]> = {}
  for (const [key, answer] of Object.entries(value)) {
    if (!stepKeys.has(key)) invalidRow(`unknown answer key ${key}`)
    const validation = validateAnamnesisAnswer(key as AnamnesisStepKey, answer)
    if (!validation.valid) invalidRow(`invalid answer for ${key}`)
    answers[key] = Array.isArray(answer) ? [...answer] : (answer as string | number)
  }
  return answers as AnamnesisAnswers
}

function mapDraftRow(row: unknown, boundUserId: string): AnamnesisDraft {
  if (!isRecord(row)) invalidRow('expected an object')
  if (row.user_id !== boundUserId) throw new AnamnesisDraftScopeError()
  if (row.schema_version !== ANGELA_ANAMNESIS_SCHEMA_VERSION) {
    throw new AnamnesisDraftValidationError([
      {
        key: 'schemaVersion',
        code: 'schema_mismatch',
        message: 'Este rascunho pertence a outra versão da anamnese.',
      },
    ])
  }
  if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)) {
    invalidRow('id must be a UUID')
  }
  if (row.idempotency_key !== row.id) {
    invalidRow('idempotency identity must match the draft UUID')
  }
  if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 0) {
    invalidRow('revision must be a non-negative integer')
  }
  if (row.status !== 'draft' && row.status !== 'submitted') {
    invalidRow('status must be draft or submitted')
  }
  if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
    invalidRow('created_at and updated_at must be server timestamps')
  }
  if (row.submitted_at !== null && !isTimestamp(row.submitted_at)) {
    invalidRow('submitted_at must be null or a server timestamp')
  }
  if (row.status === 'submitted' && row.submitted_at === null) {
    invalidRow('submitted rows require submitted_at')
  }
  if (row.status === 'draft' && row.submitted_at !== null) {
    invalidRow('draft rows cannot have submitted_at')
  }

  const draft: AnamnesisDraft = {
    id: row.id,
    userId: boundUserId,
    schemaVersion: ANGELA_ANAMNESIS_SCHEMA_VERSION,
    revision: row.revision as number,
    status: row.status,
    answers: mapAnswers(row.answers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    idempotencyKey: row.id,
  }
  if (draft.status === 'submitted' && !validateAnamnesisDraft(draft).valid) {
    invalidRow('submitted rows require the complete v1 answer set')
  }
  return draft
}

function singleRpcRow(data: unknown): unknown {
  if (Array.isArray(data)) {
    if (data.length !== 1) invalidRow('RPC must return exactly one row')
    return data[0]
  }
  return data
}

function mutationError(error: { code?: string; details?: string }, expectedRevision: number): Error {
  if (error.code === '40001') {
    const actual = /actual_revision=(\d+)/.exec(error.details ?? '')?.[1]
    return new AnamnesisDraftRevisionConflictError(
      expectedRevision,
      actual === undefined ? expectedRevision : Number(actual),
    )
  }
  if (error.code === '42501') return new AnamnesisDraftScopeError()
  return new Error('Não foi possível salvar o rascunho seguro.')
}

export class SupabaseAnamnesisDraftRepository
  implements AnamnesisDraftRepository
{
  private readonly boundUserId: string
  private readonly client: SupabaseClient

  constructor(boundUserId: string, client: SupabaseClient) {
    if (!UUID_PATTERN.test(boundUserId)) throw new Error('A valid bound user UUID is required')
    this.boundUserId = boundUserId
    this.client = client
  }

  async load(): Promise<AnamnesisDraft | null> {
    const { data, error } = await this.client
      .from('anamnesis_drafts')
      .select(DRAFT_COLUMNS)
      .eq('user_id', this.boundUserId)
      .eq('schema_version', ANGELA_ANAMNESIS_SCHEMA_VERSION)
      .maybeSingle()

    if (error) throw new Error('Não foi possível carregar o rascunho seguro.')
    return data === null ? null : mapDraftRow(data, this.boundUserId)
  }

  async save(
    draft: AnamnesisDraft,
    expectedRevision: number,
  ): Promise<AnamnesisDraft> {
    this.assertMutation(draft, expectedRevision)

    const { data, error } = await this.client.rpc('save_anamnesis_draft', {
      p_draft_id: draft.id,
      p_schema_version: draft.schemaVersion,
      p_expected_revision: expectedRevision,
      p_answers: draft.answers,
      p_idempotency_key: draft.idempotencyKey,
    })

    if (error) throw mutationError(error, expectedRevision)
    return mapDraftRow(singleRpcRow(data), this.boundUserId)
  }

  async submit(
    draft: AnamnesisDraft,
    expectedRevision: number,
  ): Promise<AnamnesisDraft> {
    this.assertMutation(draft, expectedRevision)
    const validation = validateAnamnesisDraft(draft)
    if (!validation.valid) throw new AnamnesisDraftValidationError(validation.issues)

    const { data, error } = await this.client.functions.invoke(
      'angela-anamnesis-submit',
      {
        body: {
          draft_id: draft.id,
          schema_version: draft.schemaVersion,
          expected_revision: expectedRevision,
          idempotency_key: draft.idempotencyKey,
        },
      },
    )

    if (error) {
      throw new Error('O envio não foi confirmado. Tente novamente com a mesma anamnese.')
    }
    if (!isRecord(data) || !('draft' in data)) {
      invalidRow('Edge Function response must contain a draft')
    }
    return mapDraftRow(data.draft, this.boundUserId)
  }

  private assertMutation(draft: AnamnesisDraft, expectedRevision: number): void {
    if (draft.userId !== this.boundUserId) throw new AnamnesisDraftScopeError()
    if (draft.schemaVersion !== ANGELA_ANAMNESIS_SCHEMA_VERSION) {
      throw new AnamnesisDraftValidationError([
        {
          key: 'schemaVersion',
          code: 'schema_mismatch',
          message: 'Este rascunho pertence a outra versão da anamnese.',
        },
      ])
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      invalidRow('expected revision must be a non-negative integer')
    }
    if (draft.revision !== expectedRevision) {
      throw new AnamnesisDraftRevisionConflictError(expectedRevision, draft.revision)
    }
    if (!UUID_PATTERN.test(draft.id) || draft.idempotencyKey !== draft.id) {
      invalidRow('draft identity drifted')
    }
    mapAnswers(draft.answers)
  }
}
