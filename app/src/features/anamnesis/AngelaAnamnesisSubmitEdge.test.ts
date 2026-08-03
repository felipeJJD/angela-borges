import { describe, expect, it } from 'vitest'

import {
  buildCanonicalWebhookBody,
  createWebhookHeaders,
} from '../../../../supabase/functions/angela-anamnesis-submit/core'

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

  it('signs the exact raw body and returns the timestamp, correlation, and user auth contract', async () => {
    const headers = await createWebhookHeaders({
      rawBody: 'The quick brown fox jumps over the lazy dog',
      hmacSecret: 'key',
      timestamp: '2026-08-03T15:10:01.000Z',
      correlationId: CORRELATION_ID,
      authorization: 'Bearer synthetic-user-jwt',
    })

    expect(headers).toEqual({
      'content-type': 'application/json',
      'x-webhook-signature':
        'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
      'x-webhook-timestamp': '2026-08-03T15:10:01.000Z',
      'x-correlation-id': CORRELATION_ID,
      authorization: 'Bearer synthetic-user-jwt',
    })
  })
})
