import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ANGELA_ANAMNESIS_CATALOG } from './catalog'

const migrationPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'migrations',
  '0005_anamnesis_persistence.sql',
)
const conflictRecoveryMigrationPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'migrations',
  '0007_anamnesis_conflict_sqlstate.sql',
)

const stableKeys = [
  'birth_date',
  'height_cm',
  'weight_kg',
  'nutrition_goal',
  'meal_routine',
  'dietary_restrictions',
  'nutrition_challenge',
  'health_history',
  'sleep_quality',
  'water_intake',
  'emotional_eating',
  'meal_preparation',
  'planned_supplements',
  'sweet_craving_times',
  'disliked_foods',
  'food_budget',
  'training_experience_level',
  'training_days_per_week',
  'training_location',
  'injuries_or_limitations',
  'preferred_exercises',
  'conditioning_level',
  'training_background',
  'training_barrier',
  'training_focus_areas',
] as const

function functionSql(sql: string, name: string): string {
  const match = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?(?=create or replace function|create trigger|alter table|$)`,
    'i',
  ).exec(sql)
  if (!match) throw new Error(`Missing SQL function ${name}`)
  return match[0].toLowerCase()
}

describe('0005 anamnesis persistence migration', () => {
  it('is additive, user-scoped, CAS-locked, immutable, and keeps outbox payloads server-only', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalized = sql.toLowerCase()

    expect(normalized).toContain('create table public.anamnesis_drafts')
    expect(normalized).toContain('create table public.anamnesis_submissions')
    expect(normalized).toContain('create table public.dashboard_outbox')
    expect(normalized).toContain("'angela-anamnesis.v1'")
    stableKeys.forEach((key) => expect(sql).toContain(`'${key}'`))

    expect(normalized).toMatch(/save_anamnesis_draft[\s\S]*auth\.uid\(\)/)
    expect(normalized).toMatch(/save_anamnesis_draft[\s\S]*for update/)
    expect(normalized).toMatch(/submit_anamnesis_draft[\s\S]*for update/)
    expect(normalized).toContain('p_expected_revision')
    expect(normalized.match(/p_schema_version is distinct from 'angela-anamnesis\.v1'/g))
      .toHaveLength(2)
    expect(normalized.match(/p_expected_revision is null/g)).toHaveLength(2)
    expect(normalized).toContain('anamnesis_revision_conflict')
    expect(normalized).toContain('prevent_anamnesis_submission_mutation')

    expect(normalized).toContain('alter table public.anamnesis_drafts enable row level security')
    expect(normalized).toContain('alter table public.anamnesis_submissions enable row level security')
    expect(normalized).toContain('alter table public.dashboard_outbox enable row level security')
    expect(normalized).toMatch(
      /revoke all on public\.anamnesis_drafts\s+from public, anon, authenticated, service_role/,
    )
    expect(normalized).toMatch(
      /revoke all on public\.anamnesis_submissions\s+from public, anon, authenticated, service_role/,
    )
    expect(normalized).toMatch(
      /revoke all on public\.dashboard_outbox\s+from public, anon, authenticated, service_role/,
    )
    expect(normalized).not.toMatch(/create policy[^;]+on public\.dashboard_outbox/)
    expect(normalized).toContain('grant execute on function public.save_anamnesis_draft')
    expect(normalized).toContain('grant execute on function public.submit_anamnesis_draft')
    expect(normalized).toContain('to authenticated')

    expect(normalized).not.toMatch(/\b(delete from|truncate|drop table)\b/)
  })

  it('submits only through a service-role atomic snapshot equality RPC', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalized = sql.toLowerCase()
    const submit = functionSql(sql, 'submit_anamnesis_draft')

    expect(submit).toContain('p_user_id uuid')
    expect(submit).toContain('p_expected_answers jsonb')
    expect(submit).toContain('p_payload_hash text')
    expect(submit).toContain('for update')
    expect(submit).toMatch(/v_draft\.revision\s*<>\s*p_expected_revision/)
    expect(submit).toMatch(
      /v_draft\.answers\s+is\s+distinct\s+from\s+p_expected_answers/,
    )
    expect(submit).not.toMatch(/jsonb_build_object\([\s\S]*\)::text/)

    expect(normalized).toMatch(
      /grant execute on function public\.submit_anamnesis_draft\([^)]+\)\s+to service_role/,
    )
    expect(normalized).not.toMatch(
      /grant execute on function public\.submit_anamnesis_draft\([^)]+\)\s+to authenticated/,
    )
  })

  it('rejects semantically invalid complete answers before creating an outbox row', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const validation = functionSql(sql, 'is_valid_angela_anamnesis_answers')
    const multi = functionSql(sql, 'is_valid_angela_anamnesis_multi_answer')

    expect(validation).toContain('current_date')
    expect(validation).toContain("'general_health'")
    expect(validation).toContain("'1_75_to_2l'")
    expect(validation).toContain("'diverse_experience'")
    expect(validation).toContain('trim(')
    expect(validation).toContain('is_valid_angela_anamnesis_multi_answer')
    expect(validation).toContain("'none'")
    expect(validation).toContain('p_max_selections')
    expect(multi).toContain('jsonb_array_length')
    expect(multi).toContain('p_exclusive_option')
    expect(multi).toContain('count(distinct')
    for (const step of ANGELA_ANAMNESIS_CATALOG.steps) {
      for (const option of step.options ?? []) {
        expect(sql).toContain(`'${option.value}'`)
      }
    }
  })

  it('exposes own-user delivery status and a service-only leased due-row drainer', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalized = sql.toLowerCase()
    const status = functionSql(sql, 'get_anamnesis_delivery_status')
    const claimDue = functionSql(sql, 'claim_due_dashboard_outbox')

    expect(status).toContain('auth.uid()')
    expect(status).toContain('accepted_pending')
    expect(status).toContain('delivered')
    expect(status).toContain('failed')
    expect(status).toContain(
      "outbox.status in ('pending', 'retry_wait', 'processing')",
    )
    expect(status).not.toContain('payload jsonb')
    expect(claimDue).toContain('for update skip locked')
    expect(claimDue).toContain('least(greatest(p_limit, 1), 25)')
    expect(claimDue).toContain('p_limit is null')
    expect(claimDue).toContain('p_lease_seconds is null')
    expect(claimDue).toContain("status in ('pending', 'retry_wait', 'processing')")
    expect(normalized).toMatch(
      /grant execute on function public\.claim_due_dashboard_outbox\([^)]+\)\s+to service_role/,
    )
    expect(normalized).not.toMatch(
      /grant execute on function public\.claim_due_dashboard_outbox\([^)]+\)\s+to authenticated/,
    )
    expect(normalized).not.toMatch(
      /\b(access_token|refresh_token|authorization|delivery_jwt_secret)\b/,
    )
  })
})

describe('0007 anamnesis conflict recovery migration', () => {
  it('returns revision conflicts as HTTP 409 without a retry-class SQLSTATE', () => {
    const exists = existsSync(conflictRecoveryMigrationPath)
    expect(exists).toBe(true)
    if (!exists) return

    const sql = readFileSync(conflictRecoveryMigrationPath, 'utf8').toLowerCase()
    const save = functionSql(sql, 'save_anamnesis_draft')
    const submit = functionSql(sql, 'submit_anamnesis_draft')

    expect(save).toContain("errcode = 'pt409'")
    expect(submit).toContain("errcode = 'pt409'")
    expect(save).not.toContain("errcode = '40001'")
    expect(submit).not.toContain("errcode = '40001'")
    expect(sql).toContain('grant execute on function public.save_anamnesis_draft')
    expect(sql).toContain('grant execute on function public.submit_anamnesis_draft')
  })
})
