import { useNavigate } from 'react-router-dom'
import type { Workout } from '../lib/supabase'
import { IconCheck, IconChevronRight, IconLock } from './icons'

type Props = {
  workout: Workout
  completed: boolean
  current: boolean
  locked?: boolean
}

export function WorkoutCard({ workout, completed, current, locked }: Props) {
  const navigate = useNavigate()

  if (locked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/40 px-4 py-3.5 opacity-60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-2">
          <IconLock className="h-4.5 w-4.5" />
        </span>
        <p className="flex-1 truncate text-sm font-medium text-muted">
          {workout.title}
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={() => navigate(`/treino/${workout.id}`)}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
        current
          ? 'border-coral/50 bg-coral/10 glow-coral-sm'
          : 'border-border bg-surface hover:bg-surface-2'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          completed
            ? 'bg-coral text-white'
            : current
              ? 'bg-coral/20 text-coral-bright'
              : 'bg-white/5 text-muted'
        }`}
      >
        {completed ? <IconCheck className="h-5 w-5" /> : workout.sort_order}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold ${
            completed ? 'text-muted line-through decoration-coral/50' : 'text-white'
          }`}
        >
          {workout.title}
        </p>
        {current && (
          <p className="text-[11px] font-medium text-coral-bright">Sua ficha atual</p>
        )}
        {completed && !current && (
          <p className="text-[11px] text-muted-2">Concluída</p>
        )}
      </div>
      <IconChevronRight className="h-5 w-5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
