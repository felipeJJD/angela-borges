import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createAngelaPersonalizedPlan,
  type AngelaPlanDeliverySource,
} from './AngelaPersonalizedPlan'

const USER_ID = '22222222-2222-4222-8222-222222222222'

type HashFixture = {
  snapshot: {
    user_id: string
    protocol_id: string
    protocol_version: number
    schema_version: string
    diet: Record<string, unknown>
    training: Record<string, unknown>
    generation_metadata: Record<string, unknown>
  }
  sha256: string
}

function fixture(): HashFixture {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'src/features/personalized-plan/fixtures/angela-plan-hash.contract.json',
      ),
      'utf8',
    ),
  ) as HashFixture
}

function source(
  overrides: Partial<AngelaPlanDeliverySource> = {},
): AngelaPlanDeliverySource {
  return {
    readActivePlan: async () => null,
    readLatestAnamnesisSubmission: async () => null,
    readAnamnesisDeliveryStatus: async () => null,
    ...overrides,
  }
}

function activeRow() {
  const contract = fixture()
  return {
    id: '33333333-3333-4333-8333-333333333333',
    ...contract.snapshot,
    snapshot_hash: contract.sha256,
    state: 'active',
    staged_at: '2026-08-03T18:00:00.000Z',
    activated_at: '2026-08-03T18:05:00.000Z',
    superseded_at: null,
    created_at: '2026-08-03T18:00:00.000Z',
    updated_at: '2026-08-03T18:05:00.000Z',
  }
}

describe('Angela personalized plan module', () => {
  it('returns the honest empty state when no plan or submitted anamnesis exists', async () => {
    await expect(createAngelaPersonalizedPlan(USER_ID, source()).load()).resolves.toEqual({
      kind: 'empty',
    })
  })

  it.each(['accepted_pending', 'delivered'] as const)(
    'keeps the plan building while anamnesis delivery is %s and no active plan exists',
    async (status) => {
      const module = createAngelaPersonalizedPlan(
        USER_ID,
        source({
          readLatestAnamnesisSubmission: async () => ({
            idempotencyKey: '44444444-4444-4444-8444-444444444444',
            submittedAt: '2026-08-03T17:00:00.000Z',
          }),
          readAnamnesisDeliveryStatus: async () => ({
            status,
            retryable: status === 'accepted_pending',
            attempts: 1,
          }),
        }),
      )

      await expect(module.load()).resolves.toEqual({
        kind: 'building',
        submittedAt: '2026-08-03T17:00:00.000Z',
        deliveryStatus: status,
      })
    },
  )

  it('surfaces a failed delivery without inventing a plan', async () => {
    const module = createAngelaPersonalizedPlan(
      USER_ID,
      source({
        readLatestAnamnesisSubmission: async () => ({
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
          submittedAt: '2026-08-03T17:00:00.000Z',
        }),
        readAnamnesisDeliveryStatus: async () => ({
          status: 'failed',
          retryable: false,
          attempts: 5,
        }),
      }),
    )

    await expect(module.load()).resolves.toMatchObject({
      kind: 'failed',
      reason: 'delivery-failed',
      retryable: false,
    })
  })

  it('publishes diet and training from one atomic active row with structural counts', async () => {
    const module = createAngelaPersonalizedPlan(
      USER_ID,
      source({ readActivePlan: async () => activeRow() }),
    )

    await expect(module.load()).resolves.toMatchObject({
      kind: 'published',
      plan: {
        planVersionId: '33333333-3333-4333-8333-333333333333',
        userId: USER_ID,
        protocolId: '11111111-1111-4111-8111-111111111111',
        protocolVersion: 3,
        schemaVersion: 'angela-plan.v1',
        snapshotHash:
          'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
        counts: { dietMeals: 1, trainingDays: 1, trainingExercises: 1 },
        diet: { meals: expect.any(Array) },
        training: { days: expect.any(Array) },
      },
    })
  })

  it.each([
    ['foreign owner', () => ({ ...activeRow(), user_id: crypto.randomUUID() })],
    ['partial diet', () => ({ ...activeRow(), diet: { meals: [{}] } })],
    [
      'partial training',
      () => ({
        ...activeRow(),
        training: { days: [{ name: 'Treino A', exercises: [] }] },
      }),
    ],
    [
      'foreign generation metadata',
      () => ({
        ...activeRow(),
        generation_metadata: {
          ...activeRow().generation_metadata,
          provider: 'foreign-provider',
        },
      }),
    ],
    [
      'payload changed without its canonical hash',
      () => ({
        ...activeRow(),
        diet: {
          ...activeRow().diet,
          daily_calories: 1900,
        },
      }),
    ],
  ])('fails closed instead of rendering a mixed/invalid active row: %s', async (_name, row) => {
    const module = createAngelaPersonalizedPlan(
      USER_ID,
      source({ readActivePlan: async () => row() }),
    )

    await expect(module.load()).resolves.toMatchObject({
      kind: 'failed',
      reason: 'invalid-published-plan',
    })
  })

  it('turns transport failures into an honest retryable state', async () => {
    const module = createAngelaPersonalizedPlan(
      USER_ID,
      source({
        readActivePlan: async () => {
          throw new Error('synthetic network failure')
        },
      }),
    )

    await expect(module.load()).resolves.toMatchObject({
      kind: 'failed',
      reason: 'unavailable',
      retryable: true,
    })
  })
})
