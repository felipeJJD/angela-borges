import { describe, expect, it } from 'vitest'

import {
  buildCanonicalWebhookBody,
  computeAnamnesisPayloadHash,
  createWebhookHeaders,
} from '../../../../supabase/functions/angela-anamnesis-submit/core'
import { ANGELA_ANAMNESIS_CATALOG } from './catalog'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222'

const answers = {
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

describe('Angela anamnesis submit Edge core', () => {
  it('matches the Dashboard recursive canonical JSON payload-hash fixture', async () => {
    await expect(
      computeAnamnesisPayloadHash('angela-anamnesis.v1', { b: 2, a: 1 }),
    ).resolves.toBe(
      'f9da3d345bbe3840e5a5791d69bbef1f146fe41ebb1cc2e360215e23eead3ca0',
    )
  })

  it('uses runtime-independent lexical ordering for nested objects and decimals', async () => {
    await expect(
      computeAnamnesisPayloadHash('angela-anamnesis.v1', {
        z: [3.5, { a: 1, Z: 2 }],
        a: 1.25,
      }),
    ).resolves.toBe(
      '68f92b48da178b4e077eb6378f28d91d0d359533fede619f55f47cffe4763b8a',
    )
  })

  it('builds the exact versioned Dashboard body from 3 personal, 13 nutrition, and 9 training answers', () => {
    const body = buildCanonicalWebhookBody({
      userId: USER_ID,
      idempotencyKey: CORRELATION_ID,
      correlationId: CORRELATION_ID,
      schemaVersion: 'angela-anamnesis.v1',
      submittedAt: '2026-08-03T15:10:00.000Z',
      payloadHash: 'a'.repeat(64),
      fullName: 'Pessoa Sintética',
      email: 'synthetic@example.invalid',
      answers,
    })

    expect(body.value).toEqual({
      source: 'angela_app',
      account_id: '6637f3b0-2e52-4b2d-86e7-6a35f3dd1613',
      quiz_type: 'completo',
      user_id: USER_ID,
      idempotency_key: CORRELATION_ID,
      correlation_id: CORRELATION_ID,
      schema_version: 'angela-anamnesis.v1',
      submitted_at: '2026-08-03T15:10:00.000Z',
      payload_hash: 'a'.repeat(64),
      user_profile: {
        full_name: 'Pessoa Sintética',
        email: 'synthetic@example.invalid',
        birth_date: '1990-06-15',
        height_cm: 165,
        weight_kg: 68.4,
      },
      anamnese_nutricional: Object.fromEntries(
        Object.entries(answers).slice(3, 16),
      ),
      anamnese_treino: Object.fromEntries(Object.entries(answers).slice(16)),
      quiz_responses: answers,
    })
    expect(Object.keys(body.value.anamnese_nutricional)).toHaveLength(13)
    expect(Object.keys(body.value.anamnese_treino)).toHaveLength(9)
    expect(body.raw).toBe(JSON.stringify(body.value))
  })

  it('rejects semantically invalid complete answers before canonical delivery', () => {
    const invalidAnswers = [
      { ...answers, nutrition_goal: 'unknown_goal' },
      { ...answers, birth_date: '2026-02-30' },
      { ...answers, birth_date: '2027-01-01' },
      { ...answers, height_cm: 165.5 },
      { ...answers, injuries_or_limitations: 'x' },
      {
        ...answers,
        dietary_restrictions: ['none', 'lactose_intolerance'],
      },
      {
        ...answers,
        preferred_exercises: ['strength', 'aerobic', 'functional'],
      },
      { ...answers, training_focus_areas: ['glutes', 'glutes'] },
    ]

    for (const candidate of invalidAnswers) {
      expect(() =>
        buildCanonicalWebhookBody({
          userId: USER_ID,
          idempotencyKey: CORRELATION_ID,
          correlationId: CORRELATION_ID,
          schemaVersion: 'angela-anamnesis.v1',
          submittedAt: '2026-08-03T15:10:00.000Z',
          payloadHash: 'a'.repeat(64),
          fullName: 'Pessoa Sintética',
          email: 'synthetic@example.invalid',
          answers: candidate,
        }),
      ).toThrow('Invalid anamnesis answers')
    }
  })

  it('accepts every catalog option at the Edge semantic boundary', () => {
    for (const step of ANGELA_ANAMNESIS_CATALOG.steps) {
      for (const option of step.options ?? []) {
        const candidate = {
          ...answers,
          [step.key]: step.type === 'multi' ? [option.value] : option.value,
        }
        expect(() =>
          buildCanonicalWebhookBody({
            userId: USER_ID,
            idempotencyKey: CORRELATION_ID,
            correlationId: CORRELATION_ID,
            schemaVersion: 'angela-anamnesis.v1',
            submittedAt: '2026-08-03T15:10:00.000Z',
            payloadHash: 'a'.repeat(64),
            fullName: 'Pessoa Sintética',
            email: 'synthetic@example.invalid',
            answers: candidate,
          }),
        ).not.toThrow()
      }
    }
  })

  it('signs the exact raw body and returns the timestamp, correlation, and delivery auth contract', async () => {
    const rawBody =
      '{"quiz_responses":{"a":1,"b":2},"schema_version":"angela-anamnesis.v1"}'
    const headers = await createWebhookHeaders({
      rawBody,
      hmacSecret: 'synthetic-angela-hmac-secret',
      timestamp: '1785574400',
      correlationId: CORRELATION_ID,
      authorization: 'Bearer synthetic-delivery-jwt',
    })

    expect(headers).toEqual({
      'content-type': 'application/json',
      'x-webhook-signature':
        'e96c2a2d03ef8cea7890450454a5736228d5013fa126b236fd4a96b18eaab439',
      'x-webhook-timestamp': '1785574400',
      'x-correlation-id': CORRELATION_ID,
      authorization: 'Bearer synthetic-delivery-jwt',
    })

    const tampered = await createWebhookHeaders({
      rawBody,
      hmacSecret: 'synthetic-angela-hmac-secret',
      timestamp: '1785574401',
      correlationId: CORRELATION_ID,
      authorization: 'Bearer synthetic-delivery-jwt',
    })
    expect(tampered['x-webhook-signature']).not.toBe(
      headers['x-webhook-signature'],
    )
  })
})
