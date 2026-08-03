type SupabaseRuntimeEnv = Readonly<Record<string, unknown>>

const TARGET_SUPABASE_PROJECT_REF = 'roovdrcksjfinxhbuxxo'
const TARGET_SUPABASE_URL =
  `https://${TARGET_SUPABASE_PROJECT_REF}.supabase.co`

export function resolveSupabaseConfig(env: SupabaseRuntimeEnv) {
  const rawUrl = env.VITE_SUPABASE_URL
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''

  if (!url) {
    throw new Error(
      'Missing Supabase runtime configuration: VITE_SUPABASE_URL.',
    )
  }

  const rawAnonKey = env.VITE_SUPABASE_ANON_KEY
  const anonKey = typeof rawAnonKey === 'string' ? rawAnonKey.trim() : ''

  if (!anonKey) {
    throw new Error(
      'Missing Supabase runtime configuration: VITE_SUPABASE_ANON_KEY.',
    )
  }

  if (url !== TARGET_SUPABASE_URL) {
    throw new Error(
      `Supabase runtime configuration rejected: expected project ${TARGET_SUPABASE_PROJECT_REF}.`,
    )
  }

  return {
    url,
    anonKey,
  }
}
