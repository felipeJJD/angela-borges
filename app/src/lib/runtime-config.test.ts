import { describe, expect, it } from 'vitest'

import { resolveSupabaseConfig } from './runtime-config'

const TARGET_URL = 'https://roovdrcksjfinxhbuxxo.supabase.co'

describe('resolveSupabaseConfig', () => {
  it('fails clearly when the Supabase URL is missing', () => {
    expect(() =>
      resolveSupabaseConfig({
        VITE_SUPABASE_ANON_KEY: 'synthetic-public-test-key',
      }),
    ).toThrowError(
      'Missing Supabase runtime configuration: VITE_SUPABASE_URL.',
    )
  })

  it('fails clearly when the Supabase public key is missing', () => {
    expect(() =>
      resolveSupabaseConfig({
        VITE_SUPABASE_URL: TARGET_URL,
      }),
    ).toThrowError(
      'Missing Supabase runtime configuration: VITE_SUPABASE_ANON_KEY.',
    )
  })

  it('fails closed when the URL uses another Supabase project ref', () => {
    expect(() =>
      resolveSupabaseConfig({
        VITE_SUPABASE_URL: 'https://syntheticforeignref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'synthetic-public-test-key',
      }),
    ).toThrowError(
      'Supabase runtime configuration rejected: expected project roovdrcksjfinxhbuxxo.',
    )
  })

  it('returns the target URL with a synthetic public test key', () => {
    expect(
      resolveSupabaseConfig({
        VITE_SUPABASE_URL: TARGET_URL,
        VITE_SUPABASE_ANON_KEY: 'synthetic-public-test-key',
      }),
    ).toEqual({
      url: TARGET_URL,
      anonKey: 'synthetic-public-test-key',
    })
  })
})
