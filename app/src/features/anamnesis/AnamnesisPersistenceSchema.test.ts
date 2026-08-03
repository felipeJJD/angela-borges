import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'migrations',
  '0005_anamnesis_persistence.sql',
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
})
