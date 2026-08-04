import { describe, expect, it } from 'vitest'

import {
  EXPECTED_ANGELA_SUPABASE_URL,
  resolveAngelaEdgeConfig,
  resolveAngelaPlanStatusConfig,
} from '../../../../supabase/functions/angela-anamnesis-submit/config'

const validEnvironment = {
  ANGELA_ENVIRONMENT: 'production',
  ANGELA_SUPABASE_URL: 'https://roovdrcksjfinxhbuxxo.supabase.co',
  ANGELA_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
  ANGELA_DASHBOARD_WEBHOOK_URL:
    'https://dashboard.example.test/api/anamnese/from-app',
  ANGELA_DASHBOARD_EXPECTED_ORIGIN: 'https://dashboard.example.test',
  ANGELA_WEBHOOK_HMAC_SECRET: 'synthetic-hmac-secret',
  ANGELA_DASHBOARD_DELIVERY_JWT_SECRET: 'synthetic-delivery-jwt-secret',
  ANGELA_FRONTEND_ALLOWED_ORIGINS: 'https://app.example.test',
  ANGELA_OUTBOX_DRAIN_TOKEN: 'synthetic-drain-token',
} as const

const validStatusEnvironment = {
  ANGELA_DASHBOARD_STATUS_URL:
    'https://dashboard.example.test/api/angela-plan/v1/status',
  ANGELA_DASHBOARD_STATUS_JWT_SECRET: 'synthetic-status-jwt-secret',
  SUPABASE_ANON_KEY: 'synthetic-public-anon-key',
} as const

describe('Angela Edge configuration', () => {
  it('accepts only the pinned Supabase project and exact Dashboard intake target', () => {
    expect(EXPECTED_ANGELA_SUPABASE_URL).toBe(
      'https://roovdrcksjfinxhbuxxo.supabase.co',
    )
    expect(resolveAngelaEdgeConfig(validEnvironment)).toMatchObject({
      supabaseUrl: EXPECTED_ANGELA_SUPABASE_URL,
      dashboardWebhookUrl:
        'https://dashboard.example.test/api/anamnese/from-app',
      dashboardExpectedOrigin: 'https://dashboard.example.test',
    })

    const invalidVariants = [
      { ANGELA_SUPABASE_URL: 'https://other.supabase.co' },
      {
        ANGELA_SUPABASE_URL:
          'https://roovdrcksjfinxhbuxxo.supabase.co/',
      },
      {
        ANGELA_DASHBOARD_WEBHOOK_URL:
          'https://dashboard.example.test/api/anamnese/from-app?mode=legacy',
      },
      {
        ANGELA_DASHBOARD_WEBHOOK_URL:
          'https://dashboard.example.test/api/anamnese/from-app#fragment',
      },
      {
        ANGELA_DASHBOARD_WEBHOOK_URL:
          'https://user:password@dashboard.example.test/api/anamnese/from-app',
      },
      {
        ANGELA_DASHBOARD_WEBHOOK_URL:
          'https://dashboard.example.test/api/anamnese/legacy',
      },
      {
        ANGELA_DASHBOARD_EXPECTED_ORIGIN: 'https://other.example.test',
      },
      {
        ANGELA_DASHBOARD_WEBHOOK_URL:
          'https://dashboard.example.test:8443/api/anamnese/from-app',
      },
      {
        ANGELA_DASHBOARD_EXPECTED_ORIGIN:
          'https://dashboard.example.test:8443',
      },
    ]

    for (const invalid of invalidVariants) {
      expect(() =>
        resolveAngelaEdgeConfig({ ...validEnvironment, ...invalid }),
      ).toThrow('ANGELA_EDGE_CONFIG_INVALID')
    }
  })

  it('pins the status endpoint and requires a secret distinct from intake', () => {
    const edgeConfig = resolveAngelaEdgeConfig(validEnvironment)
    expect(
      resolveAngelaPlanStatusConfig(validStatusEnvironment, edgeConfig),
    ).toEqual({
      dashboardStatusUrl:
        'https://dashboard.example.test/api/angela-plan/v1/status',
      statusJwtSecret: 'synthetic-status-jwt-secret',
      supabaseAnonKey: 'synthetic-public-anon-key',
    })

    const invalidVariants = [
      {
        ANGELA_DASHBOARD_STATUS_URL:
          'https://dashboard.example.test/api/angela-plan/v1/status?student=1',
      },
      {
        ANGELA_DASHBOARD_STATUS_URL:
          'https://other.example.test/api/angela-plan/v1/status',
      },
      {
        ANGELA_DASHBOARD_STATUS_URL:
          'http://dashboard.example.test/api/angela-plan/v1/status',
      },
      {
        ANGELA_DASHBOARD_STATUS_URL:
          'https://dashboard.example.test/api/angela-plan/v1/legacy',
      },
      {
        ANGELA_DASHBOARD_STATUS_JWT_SECRET:
          validEnvironment.ANGELA_DASHBOARD_DELIVERY_JWT_SECRET,
      },
      {
        SUPABASE_ANON_KEY: validEnvironment.ANGELA_SUPABASE_SERVICE_ROLE_KEY,
      },
    ]

    for (const invalid of invalidVariants) {
      expect(() =>
        resolveAngelaPlanStatusConfig(
          { ...validStatusEnvironment, ...invalid },
          edgeConfig,
        ),
      ).toThrow('ANGELA_EDGE_CONFIG_INVALID')
    }

    const missing = { ...validStatusEnvironment } as Record<
      string,
      string | undefined
    >
    delete missing.ANGELA_DASHBOARD_STATUS_JWT_SECRET
    expect(() => resolveAngelaPlanStatusConfig(missing, edgeConfig)).toThrow(
      'ANGELA_EDGE_CONFIG_INVALID',
    )

    const missingUrl = { ...validStatusEnvironment } as Record<
      string,
      string | undefined
    >
    delete missingUrl.ANGELA_DASHBOARD_STATUS_URL
    expect(() => resolveAngelaPlanStatusConfig(missingUrl, edgeConfig)).toThrow(
      'ANGELA_EDGE_CONFIG_INVALID',
    )

    const missingAnon = { ...validStatusEnvironment } as Record<
      string,
      string | undefined
    >
    delete missingAnon.SUPABASE_ANON_KEY
    expect(() => resolveAngelaPlanStatusConfig(missingAnon, edgeConfig)).toThrow(
      'ANGELA_EDGE_CONFIG_INVALID',
    )
  })

  it('requires an explicit frontend allowlist and permits local HTTP only in development', () => {
    expect(() =>
      resolveAngelaEdgeConfig({
        ...validEnvironment,
        ANGELA_FRONTEND_ALLOWED_ORIGINS: 'http://localhost:5173',
      }),
    ).toThrow('ANGELA_EDGE_CONFIG_INVALID')

    expect(
      resolveAngelaEdgeConfig({
        ...validEnvironment,
        ANGELA_ENVIRONMENT: 'development',
        ANGELA_FRONTEND_ALLOWED_ORIGINS:
          'http://localhost:5173,http://127.0.0.1:4173',
      }).frontendAllowedOrigins,
    ).toEqual(['http://localhost:5173', 'http://127.0.0.1:4173'])

    expect(() =>
      resolveAngelaEdgeConfig({
        ...validEnvironment,
        ANGELA_ENVIRONMENT: 'development',
        ANGELA_FRONTEND_ALLOWED_ORIGINS: 'http://app.example.test',
      }),
    ).toThrow('ANGELA_EDGE_CONFIG_INVALID')

    const missingAllowlist = { ...validEnvironment } as Record<
      string,
      string | undefined
    >
    delete missingAllowlist.ANGELA_FRONTEND_ALLOWED_ORIGINS
    expect(() => resolveAngelaEdgeConfig(missingAllowlist)).toThrow(
      'ANGELA_EDGE_CONFIG_INVALID',
    )

    const missingDeliverySecret = { ...validEnvironment } as Record<
      string,
      string | undefined
    >
    delete missingDeliverySecret.ANGELA_DASHBOARD_DELIVERY_JWT_SECRET
    expect(() => resolveAngelaEdgeConfig(missingDeliverySecret)).toThrow(
      'ANGELA_EDGE_CONFIG_INVALID',
    )
  })
})
