import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'
import { TEAM_LABELS } from '../lib/supabase'
import { firstName } from '../lib/dates'
import { Button } from '../components/Button'
import { TeamBadge } from '../components/TeamBadge'
import { IconLogout, IconCheck, IconFlame } from '../components/icons'

export function Perfil() {
  const { session, profile, signOut } = useAuth()
  const userId = session?.user.id
  const { data } = useStudentData(userId)
  const team = profile?.current_team ?? 1
  const email = session?.user.email ?? '—'

  const completed = data?.completedIds.size ?? 0
  const checkins = data?.totalCheckins ?? 0

  return (
    <div className="space-y-7 px-4 pt-6 safe-top">
      {/* Identity */}
      <header className="animate-fade-up flex flex-col items-center pt-4 text-center">
        <img
          src="/brand/logo-round.jpeg"
          alt="Avatar"
          className="h-24 w-24 rounded-full border-2 border-coral/40 object-cover"
        />
        <h1 className="mt-4 text-display text-2xl text-white">
          {profile?.full_name ?? firstName(profile?.full_name)}
        </h1>
        <p className="mt-1 text-sm text-muted">{email}</p>
        <div className="mt-3">
          <TeamBadge team={team} />
        </div>
      </header>

      {/* Stats */}
      <section className="animate-fade-up grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-border bg-surface p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral/15 text-coral-bright">
            <IconFlame className="h-5 w-5" />
          </span>
          <p className="mt-3 text-display text-3xl text-white">{checkins}</p>
          <p className="text-sm text-muted">check-ins</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral/15 text-coral-bright">
            <IconCheck className="h-5 w-5" />
          </span>
          <p className="mt-3 text-display text-3xl text-white">{completed}</p>
          <p className="text-sm text-muted">fichas concluídas</p>
        </div>
      </section>

      {/* Detail rows */}
      <section className="animate-fade-up overflow-hidden rounded-3xl border border-border bg-surface">
        <Row label="Nível atual" value={`Team ${team} · ${TEAM_LABELS[team]}`} />
        <Row label="Nome" value={profile?.full_name ?? '—'} />
        <Row label="E-mail" value={email} last />
      </section>

      <Button
        variant="outline"
        full
        size="lg"
        onClick={() => void signOut()}
        className="animate-fade-up text-red-300"
      >
        <IconLogout className="h-5 w-5" />
        Sair da conta
      </Button>
    </div>
  )
}

function Row({
  label,
  value,
  last,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3.5 ${
        last ? '' : 'border-b border-border'
      }`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="truncate text-sm font-medium text-white">{value}</span>
    </div>
  )
}
