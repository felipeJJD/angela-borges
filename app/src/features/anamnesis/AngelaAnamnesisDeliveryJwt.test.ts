import { describe, expect, it } from 'vitest'

import {
  createDashboardDeliveryJwt,
  verifyDashboardDeliveryJwt,
} from '../../../../supabase/functions/angela-anamnesis-submit/delivery-jwt'

const fixture = {
  secret: 'synthetic-delivery-jwt-secret',
  userId: '11111111-1111-4111-8111-111111111111',
  correlationId: '22222222-2222-4222-8222-222222222222',
  nowSeconds: 1785574400,
  ttlSeconds: 60,
} as const

const expectedSegments = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJpc3MiOiJhbmdlbGEtYW5hbW5lc2lzLWVkZ2UiLCJhdWQiOiJuZXh1cy1kYXNoYm9hcmQtYW5nZWxhLWludGFrZSIsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImp0aSI6IjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsImFjY291bnRfaWQiOiI2NjM3ZjNiMC0yZTUyLTRiMmQtODZlNy02YTM1ZjNkZDE2MTMiLCJzb3VyY2UiOiJhbmdlbGFfYXBwIiwiaWF0IjoxNzg1NTc0NDAwLCJleHAiOjE3ODU1NzQ0NjB9',
  'FLMGd1a6JEoxmqnPKBDxRu-u4rVazuPCvzAesT6zuX0',
] as const

function encodeSegment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function signSynthetic(header: unknown, claims: unknown): Promise<string> {
  const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(fixture.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput)),
  )
  let binary = ''
  for (const byte of signature) binary += String.fromCharCode(byte)
  const signatureSegment = btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return [signingInput, signatureSegment].join('.')
}

describe('Dashboard delivery JWT', () => {
  it('has a deterministic HS256 fixture and the exact short-lived claims', async () => {
    const token = await createDashboardDeliveryJwt(fixture)
    expect(token.split('.')).toEqual(expectedSegments)

    await expect(
      verifyDashboardDeliveryJwt({
        token,
        secret: fixture.secret,
        nowSeconds: fixture.nowSeconds,
        expectedUserId: fixture.userId,
        expectedCorrelationId: fixture.correlationId,
      }),
    ).resolves.toMatchObject({
      iss: 'angela-anamnesis-edge',
      aud: 'nexus-dashboard-angela-intake',
      sub: fixture.userId,
      jti: fixture.correlationId,
      account_id: '6637f3b0-2e52-4b2d-86e7-6a35f3dd1613',
      source: 'angela_app',
      iat: fixture.nowSeconds,
      exp: fixture.nowSeconds + 60,
    })
  })

  it('rejects signature tamper, expiry, and any identity claim mismatch', async () => {
    const token = await createDashboardDeliveryJwt(fixture)
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    await expect(
      verifyDashboardDeliveryJwt({
        token: tampered,
        secret: fixture.secret,
        nowSeconds: fixture.nowSeconds,
        expectedUserId: fixture.userId,
        expectedCorrelationId: fixture.correlationId,
      }),
    ).rejects.toThrow('ANGELA_DELIVERY_JWT_INVALID')
    await expect(
      verifyDashboardDeliveryJwt({
        token,
        secret: fixture.secret,
        nowSeconds: fixture.nowSeconds + 61,
        expectedUserId: fixture.userId,
        expectedCorrelationId: fixture.correlationId,
      }),
    ).rejects.toThrow('ANGELA_DELIVERY_JWT_INVALID')
    await expect(
      verifyDashboardDeliveryJwt({
        token,
        secret: fixture.secret,
        nowSeconds: fixture.nowSeconds,
        expectedUserId: '33333333-3333-4333-8333-333333333333',
        expectedCorrelationId: fixture.correlationId,
      }),
    ).rejects.toThrow('ANGELA_DELIVERY_JWT_INVALID')
  })

  it('rejects cryptographically valid headers or claims with extra keys', async () => {
    const exactClaims = {
      iss: 'angela-anamnesis-edge',
      aud: 'nexus-dashboard-angela-intake',
      sub: fixture.userId,
      jti: fixture.correlationId,
      account_id: '6637f3b0-2e52-4b2d-86e7-6a35f3dd1613',
      source: 'angela_app',
      iat: fixture.nowSeconds,
      exp: fixture.nowSeconds + 60,
    }
    const variants = [
      await signSynthetic({ alg: 'HS256', typ: 'JWT', kid: 'ambiguous' }, exactClaims),
      await signSynthetic(
        { alg: 'HS256', typ: 'JWT' },
        { ...exactClaims, role: 'unexpected' },
      ),
    ]

    for (const token of variants) {
      await expect(
        verifyDashboardDeliveryJwt({
          token,
          secret: fixture.secret,
          nowSeconds: fixture.nowSeconds,
          expectedUserId: fixture.userId,
          expectedCorrelationId: fixture.correlationId,
        }),
      ).rejects.toThrow('ANGELA_DELIVERY_JWT_INVALID')
    }
  })
})
