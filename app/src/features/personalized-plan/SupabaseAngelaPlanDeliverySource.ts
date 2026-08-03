import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  AngelaAnamnesisDeliveryStatus,
  AngelaAnamnesisSubmissionPointer,
  AngelaPlanDeliverySource,
  AngelaPlanPipelineStatus,
} from './AngelaPersonalizedPlan'

const PLAN_COLUMNS = [
  'id',
  'user_id',
  'protocol_id',
  'protocol_version',
  'schema_version',
  'snapshot_hash',
  'diet',
  'training',
  'generation_metadata',
  'state',
  'staged_at',
  'activated_at',
  'superseded_at',
  'created_at',
  'updated_at',
].join(', ')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rows(value: unknown): unknown[] {
  if (value === null) return []
  if (!Array.isArray(value)) throw new Error('Invalid plan delivery response')
  return value
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  )
}

function planPipelineStatus(value: unknown): AngelaPlanPipelineStatus {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['schema_version', 'pipeline']) ||
    value.schema_version !== 'angela-plan-status.v1' ||
    !isObject(value.pipeline)
  ) {
    throw new Error('Invalid plan pipeline status response')
  }
  const pipeline = value.pipeline
  if (
    (pipeline.state === 'building' || pipeline.state === 'published') &&
    hasExactKeys(pipeline, ['state'])
  ) {
    return { state: pipeline.state }
  }
  if (
    pipeline.state === 'failed' &&
    hasExactKeys(pipeline, ['state', 'code', 'retryable']) &&
    (pipeline.code === 'plan_generation_failed' ||
      pipeline.code === 'plan_publication_failed') &&
    pipeline.retryable === false
  ) {
    return {
      state: 'failed',
      code: pipeline.code,
      retryable: false,
    }
  }
  throw new Error('Invalid plan pipeline status response')
}

function deliveryStatus(value: unknown): AngelaAnamnesisDeliveryStatus | null {
  const result = rows(value)
  if (result.length === 0) return null
  if (result.length !== 1 || !isObject(result[0])) {
    throw new Error('Invalid anamnesis delivery response')
  }
  const row = result[0]
  if (
    (row.status !== 'accepted_pending' &&
      row.status !== 'delivered' &&
      row.status !== 'failed') ||
    typeof row.retryable !== 'boolean' ||
    !Number.isSafeInteger(row.attempts) ||
    Number(row.attempts) < 0 ||
    (row.status === 'accepted_pending' && row.retryable !== true) ||
    (row.status !== 'accepted_pending' && row.retryable !== false)
  ) {
    throw new Error('Invalid anamnesis delivery response')
  }
  return {
    status: row.status,
    retryable: row.retryable,
    attempts: row.attempts as number,
  }
}

/** Browser-only, authenticated reader. All write/publication RPCs stay absent. */
export class SupabaseAngelaPlanDeliverySource
  implements AngelaPlanDeliverySource
{
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async readActivePlan(userId: string): Promise<unknown | null> {
    const { data, error } = await this.client
      .from('angela_personalized_plans')
      .select(PLAN_COLUMNS)
      .eq('user_id', userId)
      .eq('state', 'active')
      .limit(2)

    if (error) throw new Error('Não foi possível consultar o plano publicado.')
    const result = rows(data)
    if (result.length > 1) throw new Error('Mais de um plano ativo foi retornado.')
    return result[0] ?? null
  }

  async readLatestAnamnesisSubmission(
    userId: string,
  ): Promise<AngelaAnamnesisSubmissionPointer | null> {
    const { data, error } = await this.client
      .from('anamnesis_submissions')
      .select('idempotency_key, submitted_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)

    if (error) throw new Error('Não foi possível consultar a anamnese enviada.')
    const result = rows(data)
    if (result.length === 0) return null
    if (result.length !== 1 || !isObject(result[0])) {
      throw new Error('Invalid anamnesis submission response')
    }
    return {
      idempotencyKey: String(result[0].idempotency_key ?? ''),
      submittedAt: String(result[0].submitted_at ?? ''),
    }
  }

  async readAnamnesisDeliveryStatus(
    idempotencyKey: string,
  ): Promise<AngelaAnamnesisDeliveryStatus | null> {
    const { data, error } = await this.client.rpc(
      'get_anamnesis_delivery_status',
      { p_idempotency_key: idempotencyKey },
    )
    if (error) throw new Error('Não foi possível confirmar a entrega da anamnese.')
    return deliveryStatus(data)
  }

  async readPlanPipelineStatus(
    idempotencyKey: string,
  ): Promise<AngelaPlanPipelineStatus> {
    const { data, error } = await this.client.functions.invoke(
      'angela-anamnesis-submit',
      {
        body: {
          action: 'plan_status',
          idempotency_key: idempotencyKey,
        },
      },
    )
    if (error) throw new Error('Não foi possível consultar o andamento do plano.')
    return planPipelineStatus(data)
  }
}
