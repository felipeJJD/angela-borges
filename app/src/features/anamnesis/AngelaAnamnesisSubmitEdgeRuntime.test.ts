import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const edgePath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'functions',
  'angela-anamnesis-submit',
  'index.ts',
)
const configPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'functions',
  'angela-anamnesis-submit',
  'config.ts',
)
const deliveryPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'functions',
  'angela-anamnesis-submit',
  'delivery.ts',
)
const supabaseConfigPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'config.toml',
)

describe('angela-anamnesis-submit Edge runtime', () => {
  it('keeps privileged configuration server-only and stages bounded idempotent outbox delivery', () => {
    const source = readFileSync(edgePath, 'utf8')
    const combined = `${source}\n${readFileSync(configPath, 'utf8')}\n${readFileSync(deliveryPath, 'utf8')}`

    expect(source).toContain('Deno.serve')
    expect(combined).toContain('ANGELA_SUPABASE_URL')
    expect(combined).toContain('ANGELA_SUPABASE_SERVICE_ROLE_KEY')
    expect(combined).toContain('ANGELA_DASHBOARD_WEBHOOK_URL')
    expect(combined).toContain('ANGELA_WEBHOOK_HMAC_SECRET')
    expect(combined).toContain('ANGELA_DASHBOARD_DELIVERY_JWT_SECRET')
    expect(source).toContain('auth.getUser')
    expect(source).toMatch(/["']submit_anamnesis_draft["']/)
    expect(source).toMatch(/["']claim_dashboard_outbox["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_delivered["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_retry["']/)
    expect(source).toContain('AbortSignal.timeout')
    expect(source).toContain('accepted_pending')
    expect(combined).not.toMatch(/console\.(log|info|warn|error)/)
    expect(combined).not.toContain('VITE_')
  })

  it('uses atomic TS-hashed submit plus status and a separately authenticated service drainer', () => {
    const source = readFileSync(edgePath, 'utf8')
    const config = readFileSync(configPath, 'utf8')

    expect(source).toContain('computeAnamnesisPayloadHash')
    expect(source).toContain('p_user_id')
    expect(source).toContain('p_expected_answers')
    expect(source).toContain('p_payload_hash')
    expect(source).toContain('replayFromLostResponse')
    expect(source).toContain('get_anamnesis_delivery_status')
    expect(source).toContain('claim_due_dashboard_outbox')
    expect(source).toContain('action === "drain"')
    expect(source).toContain('outboxDrainToken')
    expect(source).not.toContain('dashboardServiceToken')
    expect(config).not.toContain('ANGELA_DASHBOARD_SERVICE_TOKEN')
    expect(source).not.toContain('"access-control-allow-origin": "*"')

    const supabaseConfig = readFileSync(supabaseConfigPath, 'utf8')
    expect(supabaseConfig).toMatch(
      /\[functions\.angela-anamnesis-submit\][\s\S]*verify_jwt\s*=\s*false/,
    )
    expect(source).toContain('constantTimeEqual(token, config.outboxDrainToken)')
  })
})
