import type { ReactNode } from 'react'

import { TEAM_LABELS } from '../../lib/supabase'
import { IconCheck, IconFlame, IconLogout } from '../icons'
import { TeamBadge } from '../TeamBadge'

type Props = Readonly<{
  fullName: string
  email: string
  team: 1 | 2 | 3
  checkins: number
  completed: number
  signingOut: boolean
  signOutError: string | null
  onSignOut: () => void
}>

export function ProfileView(props: Props) {
  return (
    <div className="space-y-7 px-4 pt-5 safe-top">
      <header className="animate-fade-up flex flex-col items-center text-center">
        <div className="rounded-full bg-gradient-to-br from-coral-bright via-coral to-coral-deep p-[2px] shadow-[0_16px_45px_-20px_rgba(255,138,92,0.9)]">
          <img
            src="/brand/logo-round.jpeg"
            alt="Angela Borges"
            className="h-24 w-24 rounded-full object-cover ring-4 ring-ink"
          />
        </div>
        <h1 className="mt-4 text-display text-3xl text-white">
          {props.fullName}
        </h1>
        <p className="mt-1 text-sm text-muted">{props.email}</p>
        <div className="mt-3">
          <TeamBadge team={props.team} />
        </div>
      </header>

      <section aria-labelledby="profile-progress">
        <h2
          id="profile-progress"
          className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Sua evolução
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<IconFlame className="h-5 w-5" />}
            value={props.checkins}
            label="check-ins"
          />
          <StatCard
            icon={<IconCheck className="h-5 w-5" />}
            value={props.completed}
            label="fichas concluídas"
          />
        </div>
      </section>

      <ProfileGroup title="Informações da conta">
        <ProfileRow
          label="Nível atual"
          value={`Team ${props.team} · ${TEAM_LABELS[props.team]}`}
        />
        <ProfileRow label="Nome" value={props.fullName} />
        <ProfileRow label="E-mail" value={props.email} last />
      </ProfileGroup>

      <ProfileGroup title="Conta">
        <button
          type="button"
          disabled={props.signingOut}
          aria-busy={props.signingOut}
          onClick={props.onSignOut}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-red-300 transition hover:bg-red-400/5 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10">
            <IconLogout className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold">
            {props.signingOut ? 'Saindo…' : 'Sair da conta'}
          </span>
        </button>
      </ProfileGroup>
      {props.signOutError && (
        <p className="text-sm text-red-300" role="alert">
          {props.signOutError}
        </p>
      )}
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: number
  label: string
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-surface/80 p-4 shadow-[0_16px_45px_-32px_rgba(0,0,0,0.95)] backdrop-blur-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral/15 text-coral-bright">
        {icon}
      </span>
      <p className="mt-3 text-display text-3xl text-white">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}

function ProfileGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const id = `profile-${title.toLowerCase().replaceAll(' ', '-')}`
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
      >
        {title}
      </h2>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/80 shadow-[0_16px_45px_-32px_rgba(0,0,0,0.95)] backdrop-blur-sm">
        {children}
      </div>
    </section>
  )
}

function ProfileRow({
  label,
  value,
  last = false,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={`flex min-h-14 items-center justify-between gap-4 px-4 py-3 ${
        last ? '' : 'border-b border-white/10'
      }`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-white">
        {value}
      </span>
    </div>
  )
}
