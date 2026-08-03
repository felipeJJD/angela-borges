import { describe, expect, it, vi } from 'vitest'

import {
  deliverDashboardOutboxItem,
  deliveryHttpStatus,
  drainDashboardOutbox,
  type DashboardDeliveryPorts,
} from '../../../../supabase/functions/angela-anamnesis-submit/delivery'
import { verifyDashboardDeliveryJwt } from '../../../../supabase/functions/angela-anamnesis-submit/delivery-jwt'

const userId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'
const nowSeconds = 1785574400
const answers = {
  birth_date: '1993-06-15',
  height_cm: 165,
  weight_kg: 62.5,
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
  disliked_foods: ['none'],
  food_budget: '200_to_400',
  training_experience_level: 'intermediate',
  training_days_per_week: '3_4_days',
  training_location: 'gym',
  injuries_or_limitations: 'Nenhuma',
  preferred_exercises: ['strength', 'aerobic'],
  conditioning_level: 'medium',
  training_background: 'gym_months',
  training_barrier: 'time',
  training_focus_areas: ['glutes', 'legs'],
} as const
const item = {
  id: correlationId,
  submissionId: correlationId,
  userId,
  idempotencyKey: correlationId,
  correlationId,
  schemaVersion: 'angela-anamnesis.v1',
  payloadHash: '9da7260ae4694038cfb6ca0071c3a00f977a2de52c486175761855f1dde79b3f',
  attempts: 1,
  payload: {
    user_id: userId,
    schema_version: 'angela-anamnesis.v1',
    answers,
    submitted_at: '2026-08-01T12:00:00.000Z',
    idempotency_key: correlationId,
    correlation_id: correlationId,
    payload_hash:
      '9da7260ae4694038cfb6ca0071c3a00f977a2de52c486175761855f1dde79b3f',
  },
} as const
const config = {
  dashboardWebhookUrl:
    'https://dashboard.example.test/api/anamnese/from-app',
  hmacSecret: 'synthetic-webhook-hmac-secret',
  deliveryJwtSecret: 'synthetic-delivery-jwt-secret',
  timeoutMs: 8000,
} as const

function ports(
  body: string,
  status = 200,
): DashboardDeliveryPorts & { post: ReturnType<typeof vi.fn> } {
  return {
    resolveProfile: vi.fn().mockResolvedValue({
      fullName: 'Synthetic Student',
      email: 'synthetic@example.test',
    }),
    post: vi.fn().mockResolvedValue({ status, body }),
    markDelivered: vi.fn().mockResolvedValue(true),
    markRetry: vi.fn().mockResolvedValue('retry_wait'),
  }
}

describe('Dashboard outbox delivery', () => {
  it('accepts only a matching JSON acknowledgment and sends a fresh delivery JWT', async () => {
    const deliveryPorts = ports(
      JSON.stringify({ success: true, correlation_id: correlationId }),
    )
    await expect(
      deliverDashboardOutboxItem(item, config, deliveryPorts, nowSeconds),
    ).resolves.toEqual({ status: 'delivered', retryable: false, attempts: 1 })

    const request = deliveryPorts.post.mock.calls[0][0]
    expect(request.url).toBe(config.dashboardWebhookUrl)
    expect(request.headers['x-webhook-timestamp']).toBe(String(nowSeconds))
    expect(request.headers['x-correlation-id']).toBe(correlationId)
    const token = request.headers.authorization.replace(/^Bearer /, '')
    await expect(
      verifyDashboardDeliveryJwt({
        token,
        secret: config.deliveryJwtSecret,
        nowSeconds,
        expectedUserId: userId,
        expectedCorrelationId: correlationId,
      }),
    ).resolves.toMatchObject({ sub: userId, jti: correlationId })
    expect(deliveryPorts.markDelivered).toHaveBeenCalledWith(correlationId, 1)
  })

  it.each([
    ['legacy arbitrary 200', JSON.stringify({ ok: true })],
    [
      'mismatched correlation',
      JSON.stringify({ success: true, correlation_id: crypto.randomUUID() }),
    ],
    ['malformed acknowledgment', '{not-json'],
    ['oversized acknowledgment', 'x'.repeat(4097)],
  ])('keeps %s retryable', async (_label, body) => {
    const deliveryPorts = ports(body)
    await expect(
      deliverDashboardOutboxItem(item, config, deliveryPorts, nowSeconds),
    ).resolves.toEqual({
      status: 'accepted_pending',
      retryable: true,
      attempts: 1,
    })
    expect(deliveryPorts.markDelivered).not.toHaveBeenCalled()
    expect(deliveryPorts.markRetry).toHaveBeenCalled()
  })

  it('uses the same delivery seam for a bounded server-side drain', async () => {
    const deliveryPorts = ports(
      JSON.stringify({ success: true, correlation_id: correlationId }),
    )
    const results = await drainDashboardOutbox(
      [item, item],
      config,
      deliveryPorts,
      nowSeconds,
      1,
    )
    expect(results).toHaveLength(1)
    expect(deliveryPorts.post).toHaveBeenCalledTimes(1)
  })

  it('keeps accepted submissions readable even when delivery is pending or failed', () => {
    expect(
      deliveryHttpStatus({ status: 'accepted_pending', retryable: true, attempts: 1 }),
    ).toBe(202)
    expect(
      deliveryHttpStatus({ status: 'failed', retryable: false, attempts: 5 }),
    ).toBe(200)
    expect(
      deliveryHttpStatus({ status: 'delivered', retryable: false, attempts: 1 }),
    ).toBe(200)
  })
})
