import { useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'
import { TEAM_LABELS } from '../lib/supabase'
import type { Workout } from '../lib/supabase'
import { Button } from '../components/Button'
import { WorkoutCard } from '../components/WorkoutCard'
import { IconLock } from '../components/icons'

function ListSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-6">
      <div className="skeleton h-7 w-40 rounded" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  )
}

export function Treinos() {
  const { session, profile } = useAuth()
  const userId = session?.user.id
  const { data, loading, error, reload } = useStudentData(userId)
  const team = profile?.current_team ?? 1

  const grouped = useMemo(() => {
    if (!data) return []
    const byTeam = new Map<number, Workout[]>()
    for (const w of data.workouts) {
      const arr = byTeam.get(w.team) ?? []
      arr.push(w)
      byTeam.set(w.team, arr)
    }
    return [1, 2, 3].map((t) => ({
      team: t as 1 | 2 | 3,
      workouts: byTeam.get(t) ?? [],
      locked: t > team,
    }))
  }, [data, team])

  if (loading) return <ListSkeleton />

  if (error || !data) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Erro ao carregar os treinos.</p>
        <Button variant="outline" onClick={() => void reload()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const currentWorkoutId = data.workouts
    .filter((w) => w.team === team)
    .find((w) => !data.completedIds.has(w.id))?.id

  return (
    <div className="space-y-7 px-4 pt-6 safe-top">
      <header className="animate-fade-up">
        <h1 className="text-display text-3xl text-white">Biblioteca</h1>
        <p className="mt-1 text-sm text-muted">
          {data.workouts.length} fichas da comunidade, organizadas por nível.
        </p>
      </header>

      {grouped.map(({ team: t, workouts, locked }) => {
        const done = workouts.filter((w) => data.completedIds.has(w.id)).length
        return (
          <section key={t} className="animate-fade-up space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-display text-lg text-white">
                {locked && <IconLock className="h-4 w-4 text-muted-2" />}
                Team {t}
                <span className="text-sm font-normal text-muted">
                  {TEAM_LABELS[t]}
                </span>
              </h2>
              {!locked && (
                <span className="text-xs font-medium text-coral-bright">
                  {done}/{workouts.length}
                </span>
              )}
            </div>

            {locked ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-surface/30 px-4 py-6 text-center">
                <p className="text-sm text-muted-2">
                  Conclua o Team {t - 1} para desbloquear {workouts.length} fichas.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {workouts.map((w) => (
                  <WorkoutCard
                    key={w.id}
                    workout={w}
                    completed={data.completedIds.has(w.id)}
                    current={w.id === currentWorkoutId}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
