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
const planStatusPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'functions',
  'angela-anamnesis-submit',
  'plan-status.ts',
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
    const combined = `${source}\n${readFileSync(configPath, 'utf8')}\n${readFileSync(deliveryPath, 'utf8')}\n${readFileSync(planStatusPath, 'utf8')}`

    expect(source).toContain('Deno.serve')
    expect(combined).toContain('ANGELA_SUPABASE_URL')
    expect(combined).toContain('ANGELA_SUPABASE_SERVICE_ROLE_KEY')
    expect(combined).toContain('ANGELA_DASHBOARD_WEBHOOK_URL')
    expect(combined).toContain('ANGELA_WEBHOOK_HMAC_SECRET')
    expect(combined).toContain('ANGELA_DASHBOARD_DELIVERY_JWT_SECRET')
    expect(combined).toContain('ANGELA_DASHBOARD_STATUS_URL')
    expect(combined).toContain('ANGELA_DASHBOARD_STATUS_JWT_SECRET')
    expect(source).toContain('auth.getUser')
    expect(source).toMatch(/["']submit_anamnesis_draft["']/)
    expect(source).toMatch(/["']claim_dashboard_outbox["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_delivered["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_retry["']/)
    expect(source).toContain('AbortSignal.timeout')
    const deliveryPostStart = source.indexOf('async post(deliveryRequest)')
    const deliveryPostEnd = source.indexOf('async markDelivered', deliveryPostStart)
    const deliveryPost = source.slice(deliveryPostStart, deliveryPostEnd)
    expect(deliveryPostStart).toBeGreaterThan(-1)
    expect(deliveryPost).toContain('redirect: deliveryRequest.redirect')
    expect(source).toContain('accepted_pending')
    expect(combined).not.toMatch(/console\.(log|info|warn|error)/)
    expect(combined).not.toContain('VITE_')
  })

  it('routes authenticated plan status through caller RLS before any submit-path admin client', () => {
    const source = readFileSync(edgePath, 'utf8')
    const statusIndex = source.indexOf('if (parsed.action === "plan_status")')
    const authenticatedIndex = source.indexOf(
      'const authenticated = await authenticateUser',
      statusIndex,
    )
    const submitAdminIndex = source.lastIndexOf('const adminClient = createClient')
    const statusBranch = source.slice(statusIndex, authenticatedIndex)
    const loadConfigStart = source.indexOf('function loadConfig()')
    const loadConfigEnd = source.indexOf('function loadPlanStatusConfig', loadConfigStart)
    const baseConfigLoader = source.slice(loadConfigStart, loadConfigEnd)

    expect(source).toContain('parseAngelaPlanStatusBrowserRequest')
    expect(source).toContain('queryAngelaPlanStatus')
    expect(source).toContain('.from("anamnesis_submissions")')
    expect(source).toContain('.eq("user_id", userId)')
    expect(source).toContain('.eq("idempotency_key", idempotencyKey)')
    expect(statusIndex).toBeGreaterThan(-1)
    expect(statusBranch).toContain('loadPlanStatusConfig(config)')
    expect(statusBranch).toContain('statusConfig.supabaseAnonKey')
    expect(statusBranch).toContain('const statusUser = await authenticateUser')
    expect(statusBranch).not.toContain('serviceRoleKey')
    expect(statusBranch).not.toContain('adminClient')
    expect(authenticatedIndex).toBeGreaterThan(statusIndex)
    expect(submitAdminIndex).toBeGreaterThan(statusIndex)
    expect(baseConfigLoader).not.toContain('ANGELA_DASHBOARD_STATUS_URL')
    expect(baseConfigLoader).not.toContain('ANGELA_DASHBOARD_STATUS_JWT_SECRET')
    expect(source).toContain('"cache-control": "no-store"')
    expect(statusBranch).toContain('redirect: statusRequest.redirect')
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
