import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'
import { supabase } from '../lib/supabase'
import type { Workout } from '../lib/supabase'
import { TEAM_LABELS } from '../lib/supabase'
import { firstName, todayISO } from '../lib/dates'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { ProgressRing } from '../components/ProgressRing'
import { TeamBadge } from '../components/TeamBadge'
import { WeekStrip } from '../components/WeekStrip'
import { WorkoutCard } from '../components/WorkoutCard'
import { HomePlanLinks } from '../components/HomePlanLinks'
import { IconCheck, IconChevronRight, IconFlame, IconLock } from '../components/icons'

function HomeSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="skeleton h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-5 w-24 rounded-full" />
        </div>
      </div>
      <div className="skeleton h-32 rounded-3xl" />
      <div className="skeleton h-20 rounded-3xl" />
      <div className="skeleton h-14 rounded-2xl" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export function Home() {
  const { session, profile } = useAuth()
  const userId = session?.user.id
  const { data, loading, error, reload } = useStudentData(userId)
  const toast = useToast()
  const navigate = useNavigate()
  const [marking, setMarking] = useState(false)

  const team = profile?.current_team ?? 1

  const view = useMemo(() => {
    if (!data) return null
    const teamWorkouts = data.workouts.filter((w) => w.team === team)
    const doneInTeam = teamWorkouts.filter((w) =>
      data.completedIds.has(w.id),
    ).length
    const currentWorkout: Workout | undefined = teamWorkouts.find(
      (w) => !data.completedIds.has(w.id),
    )
    return {
      teamWorkouts,
      doneInTeam,
      totalInTeam: teamWorkouts.length,
      currentWorkout,
    }
  }, [data, team])

  if (loading) return <HomeSkeleton />

  if (error || !data || !view) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Não conseguimos carregar seus treinos.</p>
        <Button variant="outline" onClick={() => void reload()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const checkedToday = !!data.todayCheckin
  const checkinWorkoutId = view.currentWorkout?.id ?? view.teamWorkouts[0]?.id

  const markToday = async () => {
    if (!userId || !checkinWorkoutId) return
    setMarking(true)
    const { error: insErr } = await supabase.from('daily_checkins').insert({
      user_id: userId,
      workout_id: checkinWorkoutId,
      done_on: todayISO(),
    })
    setMarking(false)
    if (insErr) {
      if (insErr.code === '23505') {
        toast.show('Você já marcou o treino de hoje 🔥', 'info')
        await reload()
        return
      }
      toast.show('Não foi possível marcar. Tente de novo.', 'error')
      return
    }
    toast.show('Treino de hoje marcado! 🔥', 'success')
    await reload()
  }

  const undoToday = async () => {
    if (!data.todayCheckin) return
    setMarking(true)
    const { error: delErr } = await supabase
      .from('daily_checkins')
      .delete()
      .eq('id', data.todayCheckin.id)
    setMarking(false)
    if (delErr) {
      toast.show('Não foi possível desfazer.', 'error')
      return
    }
    toast.show('Check-in de hoje desfeito.', 'info')
    await reload()
  }

  return (
    <div className="space-y-6 px-4 pt-6">
      {/* Header */}
      <header className="animate-fade-up flex items-center gap-3 safe-top">
        <img
          src="/brand/logo-round.jpeg"
          alt="Angela Borges"
          className="h-14 w-14 rounded-full border-2 border-coral/40 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">
            Olá,{' '}
            <span className="font-semibold text-white">
              {firstName(profile?.full_name)}
            </span>
            !
          </p>
          <div className="mt-1">
            <TeamBadge team={team} size="sm" />
          </div>
        </div>
      </header>

      {/* Progress card */}
      <section className="animate-fade-up rounded-3xl border border-border bg-gradient-to-br from-surface to-ink-2 p-5">
        <div className="flex items-center gap-4">
          <ProgressRing done={view.doneInTeam} total={view.totalInTeam} />
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-coral-bright">
              Progresso · Team {team} {TEAM_LABELS[team]}
            </p>
            <p className="mt-1 text-display text-2xl text-white">
              {view.doneInTeam}{' '}
              <span className="text-muted">de {view.totalInTeam}</span>
            </p>
            <p className="text-sm text-muted">fichas concluídas</p>
          </div>
        </div>
      </section>

      {/* Week strip */}
      <section className="animate-fade-up space-y-2.5">
        <h2 className="text-sm font-semibold text-muted">Esta semana</h2>
        <WeekStrip checkinDates={data.checkinDates} />
      </section>

      {/* Daily check-in CTA */}
      <section className="animate-fade-up">
        {checkedToday ? (
          <div className="flex items-center gap-3 rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral text-white">
              <IconFlame className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-white">Treino de hoje concluído 🔥</p>
              <button
                onClick={() => void undoToday()}
                disabled={marking}
                className="text-xs font-medium text-muted underline decoration-muted/50 underline-offset-2 disabled:opacity-50"
              >
                desfazer
              </button>
            </div>
            <IconCheck className="h-6 w-6 text-coral-bright" />
          </div>
        ) : (
          <Button
            size="lg"
            full
            loading={marking}
            onClick={() => void markToday()}
            disabled={!checkinWorkoutId}
          >
            Marcar treino de hoje
            <IconCheck className="h-5 w-5" />
          </Button>
        )}
      </section>

      {/* Personalized diet and training */}
      <HomePlanLinks />

      {/* Current workout highlight */}
      {view.currentWorkout && (
        <section className="animate-fade-up">
          <h2 className="mb-2.5 text-sm font-semibold text-muted">Continue de onde parou</h2>
          <button
            onClick={() => navigate(`/treino/${view.currentWorkout!.id}`)}
            className="group flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-coral/50 bg-gradient-to-br from-coral/20 to-coral/5 p-5 text-left transition-all active:scale-[0.98] glow-coral-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-coral-bright">
                Ficha atual
              </span>
              <p className="mt-1 truncate text-display text-xl text-white">
                {view.currentWorkout.title}
              </p>
              <p className="mt-1 text-sm text-white/70">Semana completa · seg → dom</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral text-white transition-transform group-hover:translate-x-0.5">
              <IconChevronRight className="h-6 w-6" />
            </span>
          </button>
        </section>
      )}

      {/* Workout list for current team */}
      <section className="animate-fade-up space-y-2.5">
        <h2 className="text-sm font-semibold text-muted">
          Fichas do Team {team}
        </h2>
        <div className="space-y-2">
          {view.teamWorkouts.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={w}
              completed={data.completedIds.has(w.id)}
              current={w.id === view.currentWorkout?.id}
            />
          ))}
        </div>
      </section>

      {/* Locked future teams */}
      <LockedTeams currentTeam={team} workouts={data.workouts} />
    </div>
  )
}

function LockedTeams({
  currentTeam,
  workouts,
}: {
  currentTeam: number
  workouts: Workout[]
}) {
  const future = [1, 2, 3].filter((t) => t > currentTeam) as (1 | 2 | 3)[]
  if (future.length === 0) return null

  return (
    <div className="animate-fade-up space-y-4">
      {future.map((t) => {
        const count = workouts.filter((w) => w.team === t).length
        return (
          <section key={t} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
                <IconLock className="h-4 w-4 text-muted-2" />
                Team {t} · {TEAM_LABELS[t]}
              </h2>
              <span className="text-xs text-muted-2">{count} fichas</span>
            </div>
            <div className="rounded-2xl border border-dashed border-border/70 bg-surface/30 px-4 py-5 text-center">
              <p className="text-sm text-muted-2">
                Conclua o Team {t - 1} para desbloquear.
              </p>
            </div>
          </section>
        )
      })}
    </div>
  )
}
