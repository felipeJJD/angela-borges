import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { canonicalizeAngelaPlanSnapshot } from './AngelaPersonalizedPlan'

type HashFixture = {
  snapshot: Record<string, unknown>
  canonical_json: string
  sha256: string
}

function fixture(): HashFixture {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'src/features/personalized-plan/fixtures/angela-plan-hash.contract.json',
      ),
      'utf8',
    ),
  ) as HashFixture
}

describe('Angela cross-runtime plan hash contract', () => {
  it('uses the production browser canonicalizer against the exact Dashboard fixture', async () => {
    const contract = fixture()
    const canonical = await canonicalizeAngelaPlanSnapshot(contract.snapshot)

    expect(JSON.parse(contract.canonical_json)).toEqual(contract.snapshot)
    expect(canonical.canonicalJson).toBe(contract.canonical_json)
    expect(canonical.snapshotHash).toBe(contract.sha256)
    expect(contract.sha256).toBe(
      'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
    )
  })
})
