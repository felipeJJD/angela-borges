import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Workout } from '../lib/supabase'
import { todayISO } from '../lib/dates'

export type StudentData = {
  workouts: Workout[] // all workouts (all teams), sorted
  completedIds: Set<string>
  checkinDates: Set<string> // done_on dates
  todayCheckin: { id: string; workout_id: string } | null
  totalCheckins: number
}

type State = {
  data: StudentData | null
  loading: boolean
  error: string | null
}

export function useStudentData(userId: string | undefined) {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    if (!userId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [wRes, cRes, chRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, team, title, pdf_path, sort_order')
          .order('team', { ascending: true })
          .order('sort_order', { ascending: true }),
        supabase
          .from('workout_completions')
          .select('workout_id')
          .eq('user_id', userId),
        supabase
          .from('daily_checkins')
          .select('id, workout_id, done_on')
          .eq('user_id', userId),
      ])

      if (wRes.error) throw wRes.error
      if (cRes.error) throw cRes.error
      if (chRes.error) throw chRes.error

      const workouts = (wRes.data ?? []) as Workout[]
      const completedIds = new Set(
        (cRes.data ?? []).map((r) => r.workout_id as string),
      )
      const checkins = (chRes.data ?? []) as {
        id: string
        workout_id: string
        done_on: string
      }[]
      const checkinDates = new Set(checkins.map((c) => c.done_on))
      const today = todayISO()
      const todayRow = checkins.find((c) => c.done_on === today) ?? null

      setState({
        data: {
          workouts,
          completedIds,
          checkinDates,
          todayCheckin: todayRow
            ? { id: todayRow.id, workout_id: todayRow.workout_id }
            : null,
          totalCheckins: checkins.length,
        },
        loading: false,
        error: null,
      })
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : 'Erro ao carregar seus dados.',
      })
    }
  }, [userId])

  useEffect(() => {
    // Fetch on mount / when userId changes; reload is also exposed for refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { ...state, reload: load }
}
