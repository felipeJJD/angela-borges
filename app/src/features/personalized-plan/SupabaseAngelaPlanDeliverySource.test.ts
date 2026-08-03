import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { SupabaseAngelaPlanDeliverySource } from './SupabaseAngelaPlanDeliverySource'

const USER_ID = '22222222-2222-4222-8222-222222222222'

type QueryTrace = {
  table?: string
  columns?: string
  filters: Array<readonly [string, unknown]>
  order?: readonly [string, unknown]
  limit?: number
}

function clientWithRows(data: unknown) {
  const trace: QueryTrace = { filters: [] }
  const builder = {
    select(columns: string) {
      trace.columns = columns
      return builder
    },
    eq(column: string, value: unknown) {
      trace.filters.push([column, value])
      return builder
    },
    order(column: string, options: unknown) {
      trace.order = [column, options]
      return builder
    },
    limit(value: number) {
      trace.limit = value
      return Promise.resolve({ data, error: null })
    },
  }
  const client = {
    from(table: string) {
      trace.table = table
      return builder
    },
    rpc: vi.fn(),
  } as unknown as SupabaseClient
  return { client, trace }
}

describe('Supabase Angela plan delivery reader', () => {
  it('reads one active row through an owner-bound, read-only table query', async () => {
    const row = { id: 'synthetic-row' }
    const { client, trace } = clientWithRows([row])

    await expect(
      new SupabaseAngelaPlanDeliverySource(client).readActivePlan(USER_ID),
    ).resolves.toBe(row)
    expect(trace).toMatchObject({
      table: 'angela_personalized_plans',
      filters: [
        ['user_id', USER_ID],
        ['state', 'active'],
      ],
      limit: 2,
    })
    expect(trace.columns).toContain('diet')
    expect(trace.columns).toContain('training')
  })

  it('fails closed if the backend ever returns more than one active row', async () => {
    const { client } = clientWithRows([{ id: 'one' }, { id: 'two' }])

    await expect(
      new SupabaseAngelaPlanDeliverySource(client).readActivePlan(USER_ID),
    ).rejects.toThrow('Mais de um plano ativo')
  })

  it('reads only the latest submitted anamnesis for the same user', async () => {
    const { client, trace } = clientWithRows([
      {
        idempotency_key: '44444444-4444-4444-8444-444444444444',
        submitted_at: '2026-08-03T17:00:00.000Z',
      },
    ])

    await expect(
      new SupabaseAngelaPlanDeliverySource(client).readLatestAnamnesisSubmission(
        USER_ID,
      ),
    ).resolves.toEqual({
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
      submittedAt: '2026-08-03T17:00:00.000Z',
    })
    expect(trace).toMatchObject({
      table: 'anamnesis_submissions',
      filters: [['user_id', USER_ID]],
      order: ['submitted_at', { ascending: false }],
      limit: 1,
    })
  })

  it('uses only the authenticated status RPC and validates its response', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'delivered', retryable: false, attempts: 1 }],
      error: null,
    })
    const client = { rpc } as unknown as SupabaseClient
    const reader = new SupabaseAngelaPlanDeliverySource(client)

    await expect(
      reader.readAnamnesisDeliveryStatus(
        '44444444-4444-4444-8444-444444444444',
      ),
    ).resolves.toEqual({ status: 'delivered', retryable: false, attempts: 1 })
    expect(rpc).toHaveBeenCalledWith('get_anamnesis_delivery_status', {
      p_idempotency_key: '44444444-4444-4444-8444-444444444444',
    })
  })
})
