import { describe, expect, it, vi } from 'vitest'

import {
  parseAngelaPlanStatusBrowserRequest,
  queryAngelaPlanStatus,
  type AngelaPlanStatusPorts,
} from '../../../../supabase/functions/angela-anamnesis-submit/plan-status'
import { verifyDashboardPlanStatusJwt } from '../../../../supabase/functions/angela-anamnesis-submit/delivery-jwt'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222'
const NOW_SECONDS = 1785574400
const STATUS_SECRET = 'synthetic-status-jwt-secret'

const config = {
  dashboardStatusUrl:
    'https://dashboard.example.test/api/angela-plan/v1/status',
  statusJwtSecret: STATUS_SECRET,
  timeoutMs: 8_000,
} as const

function ownedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDEMPOTENCY_KEY,
    user_id: USER_ID,
    idempotency_key: IDEMPOTENCY_KEY,
    correlation_id: IDEMPOTENCY_KEY,
    ...overrides,
  }
}

function ports(
  overrides: Partial<AngelaPlanStatusPorts> = {},
): AngelaPlanStatusPorts {
  return {
    resolveOwnedSubmission: async () => ({ data: ownedRow(), error: false }),
    post: async () => ({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        schema_version: 'angela-plan-status.v1',
        pipeline: { state: 'building' },
      }),
    }),
    ...overrides,
  }
}

describe('Angela plan status Edge bridge', () => {
  it('accepts only the exact browser action and idempotency key', () => {
    expect(
      parseAngelaPlanStatusBrowserRequest({
        action: 'plan_status',
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    ).toEqual({ idempotencyKey: IDEMPOTENCY_KEY })

    for (const malformed of [
      { action: 'plan_status', idempotency_key: IDEMPOTENCY_KEY, user_id: USER_ID },
      { action: 'plan_status', idempotency_key: IDEMPOTENCY_KEY, account_id: 'x' },
      { action: 'plan_status', idempotency_key: 'not-a-uuid' },
      { action: 'status', idempotency_key: IDEMPOTENCY_KEY },
    ]) {
      expect(parseAngelaPlanStatusBrowserRequest(malformed)).toBeNull()
    }
  })

  it('proves authenticated ownership before sending the minimal signed request', async () => {
    const order: string[] = []
    const resolveOwnedSubmission = vi.fn(async () => {
      order.push('ownership')
      return { data: ownedRow(), error: false }
    })
    const post = vi.fn(async (request) => {
      order.push('post')
      expect(JSON.parse(request.body)).toEqual({
        idempotency_key: IDEMPOTENCY_KEY,
      })
      expect(Object.keys(JSON.parse(request.body))).toEqual(['idempotency_key'])
      expect(request).toMatchObject({
        url: config.dashboardStatusUrl,
        method: 'POST',
        redirect: 'error',
        timeoutMs: 8_000,
        headers: {
          accept: 'application/json',
          authorization: expect.stringMatching(/^Bearer [^.]+\.[^.]+\.[^.]+$/),
          'content-type': 'application/json',
        },
      })
      expect(Object.keys(request.headers).sort()).toEqual([
        'accept',
        'authorization',
        'content-type',
      ])
      const token = request.headers.authorization.slice('Bearer '.length)
      await expect(
        verifyDashboardPlanStatusJwt({
          token,
          secret: STATUS_SECRET,
          nowSeconds: NOW_SECONDS,
          expectedUserId: USER_ID,
          expectedIdempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).resolves.toMatchObject({
        aud: 'nexus-dashboard-angela-plan-status',
        sub: USER_ID,
        jti: IDEMPOTENCY_KEY,
      })
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: 'angela-plan-status.v1',
          pipeline: { state: 'building' },
        }),
      }
    })

    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({
          resolveOwnedSubmission,
          post,
        }),
      ),
    ).resolves.toEqual({
      httpStatus: 200,
      body: {
        schema_version: 'angela-plan-status.v1',
        pipeline: { state: 'building' },
      },
    })
    expect(order).toEqual(['ownership', 'post'])
    expect(resolveOwnedSubmission).toHaveBeenCalledWith(USER_ID, IDEMPOTENCY_KEY)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([
    [null, false],
    [ownedRow({ user_id: '33333333-3333-4333-8333-333333333333' }), false],
    [ownedRow({ correlation_id: '33333333-3333-4333-8333-333333333333' }), false],
  ])('returns the same not-found result for missing or foreign ownership %#', async (data, error) => {
    const post = vi.fn()
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({
          resolveOwnedSubmission: async () => ({ data, error }),
          post,
        }),
      ),
    ).resolves.toEqual({
      httpStatus: 404,
      body: { error: 'status_not_found' },
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('fails closed without posting when the ownership lookup is unavailable', async () => {
    const post = vi.fn()
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({
          resolveOwnedSubmission: async () => ({ data: null, error: true }),
          post,
        }),
      ),
    ).resolves.toEqual({
      httpStatus: 503,
      body: { error: 'status_unavailable' },
    })
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    { state: 'building' },
    { state: 'published' },
    {
      state: 'failed',
      code: 'plan_generation_failed',
      retryable: false,
    },
    {
      state: 'failed',
      code: 'plan_publication_failed',
      retryable: false,
    },
  ])('returns the exact allowlisted Dashboard pipeline variant %#', async (pipeline) => {
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({
          post: async () => ({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schema_version: 'angela-plan-status.v1',
              pipeline,
            }),
          }),
        }),
      ),
    ).resolves.toEqual({
      httpStatus: 200,
      body: { schema_version: 'angela-plan-status.v1', pipeline },
    })
  })

  it.each([
    {
      status: 307,
      contentType: 'application/json',
      body: '{"schema_version":"angela-plan-status.v1","pipeline":{"state":"building"}}',
    },
    {
      status: 500,
      contentType: 'application/json',
      body: '{"raw":"worker exploded"}',
    },
    {
      status: 200,
      contentType: 'text/plain',
      body: '{"schema_version":"angela-plan-status.v1","pipeline":{"state":"building"}}',
    },
    {
      status: 200,
      contentType: 'application/json',
      body: '{"schema_version":"angela-plan-status.v1","pipeline":{"state":"failed","code":"internal_stack","retryable":false}}',
    },
    {
      status: 200,
      contentType: 'application/json',
      body: '{"schema_version":"angela-plan-status.v1","pipeline":{"state":"published","student_email":"synthetic@example.test"}}',
    },
    {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 'angela-plan-status.v1',
        pipeline: { state: 'building' },
        padding: 'x'.repeat(4_096),
      }),
    },
  ])('collapses malformed, PII-bearing, and oversized responses to one safe error %#', async (response) => {
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({ post: async () => response }),
      ),
    ).resolves.toEqual({
      httpStatus: 503,
      body: { error: 'status_unavailable' },
    })
  })

  it('does not leak thrown transport details and rejects an unsafe target', async () => {
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        config,
        ports({ post: async () => Promise.reject(new Error('secret upstream detail')) }),
      ),
    ).resolves.toEqual({
      httpStatus: 503,
      body: { error: 'status_unavailable' },
    })

    const post = vi.fn()
    await expect(
      queryAngelaPlanStatus(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, nowSeconds: NOW_SECONDS },
        { ...config, dashboardStatusUrl: 'http://dashboard.example.test/api/angela-plan/v1/status' },
        ports({ post }),
      ),
    ).resolves.toEqual({
      httpStatus: 503,
      body: { error: 'status_unavailable' },
    })
    expect(post).not.toHaveBeenCalled()
  })
})
