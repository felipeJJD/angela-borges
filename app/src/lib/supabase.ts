import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export type Profile = {
  id: string
  full_name: string
  role: 'admin' | 'aluna'
  current_team: 1 | 2 | 3
  created_at: string
}

export type Workout = {
  id: string
  team: 1 | 2 | 3
  title: string
  pdf_path: string
  sort_order: number
}

export type DailyCheckin = {
  id: string
  user_id: string
  workout_id: string
  done_on: string // date YYYY-MM-DD
  created_at: string
}

export type WorkoutCompletion = {
  user_id: string
  workout_id: string
  completed_at: string
}

export const TEAM_LABELS: Record<number, string> = {
  1: 'Iniciante',
  2: 'Intermediário',
  3: 'Avançado',
}
