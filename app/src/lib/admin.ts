import { supabase } from './supabase'

export type Student = {
  id: string
  email: string | null
  full_name: string
  current_team: 1 | 2 | 3
  created_at: string
  last_checkin: string | null
  workouts_completed: number
}

type InvokeBody = Record<string, unknown>

async function invokeAdmin<T>(body: InvokeBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // Try to surface the function's JSON error message
    let msg = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string }
        if (j?.error) msg = j.error
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg)
  }
  return data as T
}

export function listStudents(): Promise<Student[]> {
  // Edge function returns the array directly
  return invokeAdmin<Student[]>({ action: 'list_students' })
}

export function createStudent(input: {
  email: string
  password: string
  full_name: string
}): Promise<{ id: string; email: string }> {
  return invokeAdmin({ action: 'create_student', ...input })
}

export function deleteStudent(user_id: string): Promise<{ deleted: boolean }> {
  return invokeAdmin({ action: 'delete_student', user_id })
}

export function resetPassword(
  user_id: string,
  new_password: string,
): Promise<{ reset: boolean }> {
  return invokeAdmin({ action: 'reset_password', user_id, new_password })
}

export function setTeam(
  user_id: string,
  team: 1 | 2 | 3,
): Promise<{ updated: boolean }> {
  return invokeAdmin({ action: 'set_team', user_id, team })
}

/** Friendly random password suggestion (8 chars, no ambiguous glyphs). */
export function suggestPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  for (let i = 0; i < 8; i++) out += chars[arr[i] % chars.length]
  return out
}
