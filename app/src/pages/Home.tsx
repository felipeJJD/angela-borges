import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'
import { supabase } from '../lib/supabase'
import { firstName, todayISO } from '../lib/dates'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { WeekStrip } from '../components/WeekStrip'
import { HomePlanLinks } from '../components/HomePlanLinks'
import { IconCheck, IconFlame } from '../components/icons'
import { selectCheckinWorkoutId } from '../features/home/selectCheckinWorkoutId'

function HomeSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-8 w-44 rounded" />
        </div>
        <div className="skeleton h-14 w-14 rounded-full" />
      </div>
      <div className="skeleton h-48 rounded-[2rem]" />
      <div className="skeleton h-44 rounded-[2rem]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-36 rounded-3xl" />
        <div className="skeleton h-36 rounded-3xl" />
      </div>
    </div>
  )
}
export function Home() {
  const { session, profile } = useAuth()
  const userId = session?.user.id
  const { data, loading, error, reload } = useStudentData(userId)
  const toast = useToast()
  const [marking, setMarking] = useState(false)
  const team = profile?.current_team ?? 1

  const checkinWorkoutId = useMemo(() => {
    if (!data) return undefined
    return selectCheckinWorkoutId(data.workouts, data.completedIds, team)
  }, [data, team])

  if (loading) return <HomeSkeleton />

  if (error || !data) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Não conseguimos carregar seu espaço.</p>
        <Button variant="outline" onClick={() => void reload()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const checkedToday = Boolean(data.todayCheckin)
  const checkinsLabel = `${data.totalCheckins} ${
    data.totalCheckins === 1 ? 'check-in registrado' : 'check-ins registrados'
  }`

  const markToday = async () => {
    if (!userId || !checkinWorkoutId) return
    setMarking(true)
    const { error: insertError } = await supabase.from('daily_checkins').insert({
      user_id: userId,
      workout_id: checkinWorkoutId,
      done_on: todayISO(),
    })
    setMarking(false)
    if (insertError) {
      if (insertError.code === '23505') {
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
    const { error: deleteError } = await supabase
      .from('daily_checkins')
      .delete()
      .eq('id', data.todayCheckin.id)
    setMarking(false)
    if (deleteError) {
      toast.show('Não foi possível desfazer.', 'error')
      return
    }
    toast.show('Check-in de hoje desfeito.', 'info')
    await reload()
  }

  return (
    <div className="relative isolate overflow-hidden px-4 pt-5">
      <div className="pointer-events-none absolute -left-24 top-24 -z-10 h-52 w-52 rounded-full bg-coral/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-72 -z-10 h-56 w-56 rounded-full bg-coral-deep/10 blur-3xl" />

      <div className="space-y-5">
        <header className="animate-fade-up flex items-center justify-between gap-4 safe-top">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-coral-bright">
              Área da aluna
            </p>
            <h1 className="mt-1 truncate text-display text-3xl text-white">
              Olá, {firstName(profile?.full_name)}!
            </h1>
          </div>
          <img
            src="/brand/logo-round.jpeg"
            alt="Angela Borges"
            className="h-14 w-14 shrink-0 rounded-full border-2 border-coral/40 object-cover shadow-lg shadow-coral/10"
          />
        </header>

        <section className="animate-fade-up relative overflow-hidden rounded-[2rem] border border-coral/30 bg-gradient-to-br from-coral/20 via-surface to-ink-2 p-6 shadow-2xl shadow-black/25">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border border-coral/20 bg-coral/10" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-coral-bright">
              Seu acompanhamento
            </p>
            <h2 className="mt-3 max-w-[15rem] text-display text-3xl leading-tight text-white">
              Sua rotina, do seu jeito.
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/65">
              Dieta, treino e constância reunidos em um espaço feito para você.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-sm">
              <IconFlame className="h-4 w-4 text-coral-bright" />
              {checkinsLabel}
            </span>
          </div>
        </section>

        <section className="animate-fade-up rounded-[2rem] border border-border bg-surface/80 p-4 shadow-xl shadow-black/15 backdrop-blur-sm">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral-bright">
                Constância
              </p>
              <h2 className="mt-1 text-display text-xl text-white">Sua semana</h2>
            </div>
            <span className="text-xs text-muted">um dia de cada vez</span>
          </div>
          <WeekStrip checkinDates={data.checkinDates} />

          <div className="mt-4 border-t border-border pt-4">
            {checkedToday ? (
              <div className="flex items-center gap-3 rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-lg shadow-coral/20">
                  <IconFlame className="h-6 w-6" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-white">Treino de hoje marcado</p>
                  <button
                    onClick={() => void undoToday()}
                    disabled={marking}
                    className="mt-0.5 text-xs font-medium text-muted underline decoration-muted/50 underline-offset-2 disabled:opacity-50"
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
          </div>
        </section>

        <HomePlanLinks />
      </div>
    </div>
  )
}
