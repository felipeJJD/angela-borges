import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis do Supabase ausentes. Copie app/.env.example para app/.env ' +
      '(ou use o .env já versionado) e reinicie o dev server (npm run dev).',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
