import { describe, expect, it, vi } from 'vitest'

import { SupabaseAnamnesisDraftRepository } from './SupabaseAnamnesisDraftRepository'
import type { AnamnesisDraft } from './draft'
import { AnamnesisDraftRevisionConflictError } from './repository'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DRAFT_ID = '22222222-2222-4222-8222-222222222222'

const completeAnswers: AnamnesisDraft['answers'] = {
  birth_date: '1990-06-15',
  height_cm: 165,
  weight_kg: 68.4,
  nutrition_goal: 'general_health',
  meal_routine: ['breakfast', 'lunch', 'dinner'],
  dietary_restrictions: ['none'],
  nutrition_challenge: 'meal_planning',
  health_history: ['none'],
  sleep_quality: 'good',
  water_intake: '1_75_to_2l',
  emotional_eating: 'rarely',
  meal_preparation: 'self',
  planned_supplements: ['none'],
  sweet_craving_times: ['none'],
  disliked_foods: ['eggplant'],
  food_budget: '200_to_400',
  training_experience_level: 'basic',
  training_days_per_week: '3_4_days',
  training_location: 'gym',
  injuries_or_limitations: 'Nenhuma',
  preferred_exercises: ['strength', 'functional'],
  conditioning_level: 'medium',
  training_background: 'gym_months',
  training_barrier: 'time',
  training_focus_areas: ['glutes', 'legs'],
}

function draft(revision = 0): AnamnesisDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    schemaVersion: 'angela-anamnesis.v1',
    revision,
    status: 'draft',
    answers: { birth_date: '1990-06-15' },
    createdAt: '2026-08-03T15:00:00.000Z',
    updatedAt: '2026-08-03T15:01:00.000Z',
    submittedAt: null,
    idempotencyKey: DRAFT_ID,
  }
}

function row(revision: number, status: 'draft' | 'submitted' = 'draft') {
  return {
    id: DRAFT_ID,
    user_id: USER_ID,
    schema_version: 'angela-anamnesis.v1',
    revision,
    status,
    answers: { birth_date: '1990-06-15' },
    created_at: '2026-08-03T15:00:00.000Z',
    updated_at: '2026-08-03T15:02:00.000Z',
    submitted_at: status === 'submitted' ? '2026-08-03T15:02:00.000Z' : null,
    idempotency_key: DRAFT_ID,
  }
}

function loadClient(row: unknown) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  query.eq.mockReturnValue(query)

  return {
    client: {
      from: vi.fn(() => ({ select: vi.fn(() => query) })),
      rpc: vi.fn(),
      functions: { invoke: vi.fn() },
    },
    query,
  }
}

describe('SupabaseAnamnesisDraftRepository', () => {
  it('loads and strictly maps the repository-bound user draft', async () => {
    const { client, query } = loadClient({
      id: DRAFT_ID,
      user_id: USER_ID,
      schema_version: 'angela-anamnesis.v1',
      revision: 3,
      status: 'draft',
      answers: { birth_date: '1990-06-15' },
      created_at: '2026-08-03T15:00:00.000Z',
      updated_at: '2026-08-03T15:01:00.000Z',
      submitted_at: null,
      idempotency_key: DRAFT_ID,
    })
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      client as never,
    )

    await expect(repository.load()).resolves.toEqual({
      id: DRAFT_ID,
      userId: USER_ID,
      schemaVersion: 'angela-anamnesis.v1',
      revision: 3,
      status: 'draft',
      answers: { birth_date: '1990-06-15' },
      createdAt: '2026-08-03T15:00:00.000Z',
      updatedAt: '2026-08-03T15:01:00.000Z',
      submittedAt: null,
      idempotencyKey: DRAFT_ID,
    })
    expect(client.from).toHaveBeenCalledWith('anamnesis_drafts')
    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(query.eq).toHaveBeenCalledWith(
      'schema_version',
      'angela-anamnesis.v1',
    )
  })

  it('fails closed on a row with schema or answer-key drift', async () => {
    const schemaClient = loadClient({
      ...row(1),
      schema_version: 'angela-anamnesis.v0',
    }).client
    await expect(
      new SupabaseAnamnesisDraftRepository(USER_ID, schemaClient as never).load(),
    ).rejects.toMatchObject({ name: 'AnamnesisDraftValidationError' })

    const answerClient = loadClient({
      ...row(1),
      answers: { unknown_clinical_key: 'value' },
    }).client
    await expect(
      new SupabaseAnamnesisDraftRepository(USER_ID, answerClient as never).load(),
    ).rejects.toThrow('unknown answer key')
  })

  it('saves through the narrow CAS RPC and returns the server revision', async () => {
    const rpc = vi.fn(async () => ({ data: row(1), error: null }))
    const client = {
      from: vi.fn(),
      rpc,
      functions: { invoke: vi.fn() },
    }
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      client as never,
    )

    await expect(repository.save(draft(), 0)).resolves.toMatchObject({
      revision: 1,
      updatedAt: '2026-08-03T15:02:00.000Z',
      idempotencyKey: DRAFT_ID,
    })
    expect(rpc).toHaveBeenCalledWith('save_anamnesis_draft', {
      p_draft_id: DRAFT_ID,
      p_schema_version: 'angela-anamnesis.v1',
      p_expected_revision: 0,
      p_answers: { birth_date: '1990-06-15' },
      p_idempotency_key: DRAFT_ID,
    })
  })

  it('maps a database CAS rejection to the repository conflict contract', async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: 'PT409',
          message: 'ANAMNESIS_REVISION_CONFLICT',
          details: 'actual_revision=4',
        },
      })),
      functions: { invoke: vi.fn() },
    }
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      client as never,
    )

    await expect(repository.save(draft(3), 3)).rejects.toEqual(
      new AnamnesisDraftRevisionConflictError(3, 4),
    )
  })

  it('rejects local user and revision drift before any transport call', async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn(),
      functions: { invoke: vi.fn() },
    }
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      client as never,
    )

    await expect(repository.save({ ...draft(), userId: crypto.randomUUID() }, 0))
      .rejects.toMatchObject({ name: 'AnamnesisDraftScopeError' })
    await expect(repository.save(draft(2), 1)).rejects.toEqual(
      new AnamnesisDraftRevisionConflictError(1, 2),
    )
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('submits through the authenticated Edge Function without sending clinical answers', async () => {
    const submittedRow = {
      ...row(2, 'submitted'),
      answers: completeAnswers,
    }
    const invoke = vi.fn(async () => ({
      data: {
        draft: submittedRow,
        delivery: { status: 'delivered', retryable: false, attempts: 1 },
      },
      error: null,
    }))
    const client = {
      from: vi.fn(),
      rpc: vi.fn(),
      functions: { invoke },
    }
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      client as never,
    )
    const complete = { ...draft(1), answers: completeAnswers }

    await expect(repository.submit(complete, 1)).resolves.toMatchObject({
      draft: {
        status: 'submitted',
        revision: 2,
        idempotencyKey: DRAFT_ID,
      },
      delivery: { status: 'delivered', retryable: false, attempts: 1 },
    })
    expect(invoke).toHaveBeenCalledWith('angela-anamnesis-submit', {
      body: {
        action: 'submit',
        draft_id: DRAFT_ID,
        schema_version: 'angela-anamnesis.v1',
        expected_revision: 1,
        idempotency_key: DRAFT_ID,
      },
    })
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('birth_date')
  })

  it('checks delivery status on reload without sending answers or trusting malformed state', async () => {
    const invoke = vi.fn(async () => ({
      data: {
        delivery: {
          status: 'accepted_pending',
          retryable: true,
          attempts: 2,
        },
      },
      error: null,
    }))
    const repository = new SupabaseAnamnesisDraftRepository(
      USER_ID,
      {
        from: vi.fn(),
        rpc: vi.fn(),
        functions: { invoke },
      } as never,
    )

    await expect(repository.getDeliveryStatus(DRAFT_ID)).resolves.toEqual({
      status: 'accepted_pending',
      retryable: true,
      attempts: 2,
    })
    expect(invoke).toHaveBeenCalledWith('angela-anamnesis-submit', {
      body: { action: 'status', idempotency_key: DRAFT_ID },
    })
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('birth_date')

    invoke.mockResolvedValueOnce({
      data: {
        delivery: { status: 'legacy_success', retryable: false, attempts: 0 },
      },
      error: null,
    })
    await expect(repository.getDeliveryStatus(DRAFT_ID)).rejects.toThrow(
      'Invalid anamnesis delivery status',
    )
  })
})
