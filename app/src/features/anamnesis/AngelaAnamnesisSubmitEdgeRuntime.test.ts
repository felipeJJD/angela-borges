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

describe('angela-anamnesis-submit Edge runtime', () => {
  it('keeps privileged configuration server-only and stages bounded idempotent outbox delivery', () => {
    const source = readFileSync(edgePath, 'utf8')

    expect(source).toContain('Deno.serve')
    expect(source).toContain('ANGELA_SUPABASE_URL')
    expect(source).toContain('ANGELA_SUPABASE_SERVICE_ROLE_KEY')
    expect(source).toContain('ANGELA_DASHBOARD_WEBHOOK_URL')
    expect(source).toContain('ANGELA_WEBHOOK_HMAC_SECRET')
    expect(source).toContain('auth.getUser')
    expect(source).toMatch(/["']submit_anamnesis_draft["']/)
    expect(source).toMatch(/["']claim_dashboard_outbox["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_delivered["']/)
    expect(source).toMatch(/["']mark_dashboard_outbox_retry["']/)
    expect(source).toContain('AbortSignal.timeout')
    expect(source).toContain('accepted_pending')
    expect(source).not.toMatch(/console\.(log|info|warn|error)/)
    expect(source).not.toContain('VITE_')
  })
})
