import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'migrations',
  '0006_personalized_plans.sql',
)
const harnessPath = resolve(
  process.cwd(),
  '..',
  'supabase',
  'tests',
  '0006_personalized_plans_test.sql',
)

function migration(): string {
  return readFileSync(migrationPath, 'utf8').toLowerCase()
}

function harness(): string {
  return readFileSync(harnessPath, 'utf8').toLowerCase()
}

function functionSql(sql: string, name: string): string {
  const match = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?(?=create or replace function|alter table|revoke all on)`,
    'i',
  ).exec(sql)
  if (!match) throw new Error(`Missing SQL function ${name}`)
  return match[0].toLowerCase()
}

describe('0006 personalized plan migration', () => {
  it('stores one complete immutable diet+training version and no partial row', () => {
    const sql = migration()

    expect(sql).toContain('create table public.angela_personalized_plans')
    expect(sql).toMatch(/diet jsonb not null/)
    expect(sql).toMatch(/training jsonb not null/)
    expect(sql).toMatch(/generation_metadata jsonb not null/)
    expect(sql).toMatch(/source_protocol_updated_at timestamptz not null/)
    expect(sql).toMatch(/state text not null[^;]+staged[^;]+active[^;]+superseded/)
    expect(sql).toContain("schema_version = 'angela-plan.v1'")
    expect(sql).toContain('protocol_version <= 9007199254740991')
    expect(sql).toMatch(/delivery_sequence bigint generated always as identity/)
    expect(sql).toContain('unique (user_id, protocol_id, protocol_version)')
    expect(sql).toMatch(
      /create unique index[^;]+on public\.angela_personalized_plans \(user_id\)[^;]+where state = 'active'/,
    )
    expect(sql).toContain("jsonb_typeof(p_diet->'meals') = 'array'")
    expect(sql).toContain("jsonb_typeof(p_training->'days') = 'array'")
    expect(sql).toContain("jsonb_typeof(meal->'foods') = 'array'")
    expect(sql).toContain("jsonb_typeof(day_item->'exercises') = 'array'")
    expect(sql).not.toContain('jsonb_object_length')
  })

  it('keeps the exact service-only RPC signatures and hash envelope', () => {
    const sql = migration()
    const compact = sql.replace(/\s+/g, ' ')

    expect(compact).toContain(
      'stage_angela_plan( p_user_id uuid, p_protocol_id uuid, p_protocol_version bigint, p_source_protocol_updated_at timestamptz, p_schema_version text, p_snapshot_hash text, p_diet jsonb, p_training jsonb, p_generation_metadata jsonb )',
    )
    expect(compact).toContain(
      'read_angela_plan_delivery( p_user_id uuid, p_protocol_id uuid, p_protocol_version bigint )',
    )
    expect(compact).toContain(
      'activate_angela_plan( p_user_id uuid, p_protocol_id uuid, p_protocol_version bigint, p_snapshot_hash text )',
    )
    expect(sql).toContain(
      '{user_id,protocol_id,protocol_version,schema_version,diet,training,generation_metadata}',
    )
    expect(sql).not.toMatch(/digest\s*\(|encode\s*\(/)

    for (const signature of [
      'stage_angela_plan(uuid, uuid, bigint, timestamptz, text, text, jsonb, jsonb, jsonb)',
      'read_angela_plan_delivery(uuid, uuid, bigint)',
      'activate_angela_plan(uuid, uuid, bigint, text)',
    ]) {
      expect(compact).toContain(`revoke all on function public.${signature}`)
      expect(compact).toContain(`grant execute on function public.${signature} to service_role`)
      expect(compact).not.toContain(
        `grant execute on function public.${signature} to authenticated`,
      )
    }
  })

  it('returns exact readback fields and counts so Dashboard can recompute the hash', () => {
    const sql = migration()
    const readback = functionSql(sql, 'read_angela_plan_delivery')

    for (const field of [
      'found',
      'plan_version_id',
      'state',
      'user_id',
      'protocol_id',
      'protocol_version',
      'source_protocol_updated_at',
      'schema_version',
      'diet',
      'training',
      'generation_metadata',
      'snapshot_hash',
      'counts',
      'diet_meals',
      'training_days',
      'training_exercises',
    ]) {
      expect(readback).toContain(`'${field}'`)
    }
    expect(readback).toContain('jsonb_array_elements')
    expect(readback).not.toContain('auth.uid()')
  })

  it('stages idempotently, detects payload/hash conflicts, and activates atomically', () => {
    const sql = migration()
    const stage = functionSql(sql, 'stage_angela_plan')
    const activate = functionSql(sql, 'activate_angela_plan')

    for (const field of [
      'source_protocol_updated_at',
      'snapshot_hash',
      'schema_version',
      'diet',
      'training',
      'generation_metadata',
    ]) {
      expect(stage).toMatch(new RegExp(`v_existing\\.${field}\\s+is distinct from\\s+p_${field}`))
    }
    expect(stage).toContain('angela_plan_stage_conflict')
    expect(stage).toMatch(/exception\s+when unique_violation/)
    expect(stage).toContain("'replayed'")
    expect(stage).toContain("'delivery'")

    expect(activate).toContain('for update')
    expect(activate).toContain('angela_plan_hash_mismatch')
    expect(activate).toContain('source_protocol_updated_at')
    expect(activate).not.toContain('delivery_sequence')
    expect(activate).toContain("state in ('active', 'staged')")
    expect(activate).toMatch(
      /update public\.angela_personalized_plans[\s\S]+state = 'superseded'/,
    )
    expect(activate).toMatch(
      /update public\.angela_personalized_plans[\s\S]+state = 'active'/,
    )
    expect(activate).toContain("'replayed'")
    expect(activate).toContain("'delivery'")
  })

  it('fences first-arriving stale source versions after a newer activation', () => {
    const sql = migration()
    const readback = functionSql(sql, 'read_angela_plan_delivery')
    const testSql = harness()

    expect(sql).toMatch(
      /state = 'superseded'[^;]+activated_at is null[^;]+superseded_at is not null/,
    )
    expect(readback).not.toContain("'delivery_sequence'")
    expect(readback).toContain("'source_protocol_updated_at'")
    expect(testSql).toContain('staged-old -> activate-new -> delayed activate-old')
    expect(testSql).toContain('activate-new -> first-stage-old -> activate-old')
    expect(testSql).toContain('angela_plan_activation_stale')
    expect(testSql).toContain("delivery,state}' <> 'superseded'")
    expect(testSql).toContain('partial training unexpectedly staged')
  })

  it('hardens every definer RPC to pg_catalog-only resolution', () => {
    const sql = migration()
    for (const name of [
      'read_angela_plan_delivery',
      'stage_angela_plan',
      'activate_angela_plan',
    ]) {
      const rpc = functionSql(sql, name)
      expect(rpc).toContain('security definer')
      expect(rpc).toContain('set search_path = pg_catalog')
      expect(rpc).not.toContain('set search_path = pg_catalog, public')
    }
  })

  it('executes success paths as backend role and observes staged RLS denial', () => {
    const testSql = harness()
    expect(testSql).toContain('set local role service_role')
    expect(testSql).toContain('set local role authenticated')
    expect(testSql).toContain('staged plans must be invisible')
    expect(testSql).toContain('authenticated direct rpc unexpectedly succeeded')
  })

  it('lets an authenticated student read only her active row and never write', () => {
    const sql = migration()
    const authenticatedColumns = /grant select \(([^)]+)\) on public\.angela_personalized_plans to authenticated/.exec(
      sql.replace(/\s+/g, ' '),
    )?.[1]

    expect(sql).toContain(
      'alter table public.angela_personalized_plans enable row level security',
    )
    expect(sql).toMatch(
      /create policy "angela active plan read own"[\s\S]+for select[\s\S]+user_id = auth\.uid\(\)[\s\S]+state = 'active'/,
    )
    expect(sql).toMatch(
      /revoke all on public\.angela_personalized_plans\s+from public, anon, authenticated, service_role/,
    )
    expect(sql).toMatch(
      /grant select \([^)]+\) on public\.angela_personalized_plans to authenticated/,
    )
    expect(authenticatedColumns).not.toContain('source_protocol_updated_at')
    expect(sql).not.toMatch(
      /grant (insert|update|delete|all)[^;]+angela_personalized_plans[^;]+authenticated/,
    )
  })

  it('contains no foreign product/account contract', () => {
    expect(migration()).not.toMatch(/matila|paiz[aã]o|mys?hape|brand[aã]o|account_id/)
  })
})
