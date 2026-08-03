import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import {
  resolveAuthView,
  type AuthViewDecision,
} from '../lib/auth/access-view'
import { Button } from './Button'
import { FullScreenLoader } from './Spinner'

type AuthIssue = Extract<AuthViewDecision, { kind: 'issue' }>['issue']

const ISSUE_COPY: Record<
  AuthIssue,
  { title: string; description: string; action: string }
> = {
  'transient-error': {
    title: 'Não foi possível carregar seu acesso',
    description: 'Confira sua conexão e tente novamente.',
    action: 'Tentar novamente',
  },
  'profile-missing': {
    title: 'Perfil não encontrado',
    description:
      'Sua conta entrou, mas o perfil ainda não está disponível. Saia da conta e fale com a Angela pelo seu canal habitual.',
    action: 'Sair da conta',
  },
  'profile-forbidden': {
    title: 'Acesso ao perfil bloqueado',
    description:
      'Não foi possível acessar seu perfil. Saia da conta e fale com a Angela pelo seu canal habitual.',
    action: 'Sair da conta',
  },
}

export function AuthAccessIssue({
  issue,
  onRetry,
  onSignOut,
}: {
  issue: AuthIssue
  onRetry: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const copy = ISSUE_COPY[issue]
  const action = issue === 'transient-error' ? onRetry : onSignOut

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink px-6 text-center">
      <div
        role="alert"
        className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6"
      >
        <h1 className="text-display text-2xl text-white">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {copy.description}
        </p>
        <Button
          type="button"
          full
          className="mt-6"
          onClick={() => {
            void action().catch(() => undefined)
          }}
        >
          {copy.action}
        </Button>
      </div>
    </div>
  )
}

/** Requires an authenticated aluna (non-admin). Admins are sent to /admin. */
export function RequireStudent({ children }: { children: ReactNode }) {
  const { access, retry, signOut } = useAuth()
  const location = useLocation()
  const decision = resolveAuthView(access, 'student')

  if (decision.kind === 'loading') {
    return <FullScreenLoader label={decision.label} />
  }
  if (decision.kind === 'issue') {
    return (
      <AuthAccessIssue
        issue={decision.issue}
        onRetry={retry}
        onSignOut={signOut}
      />
    )
  }
  if (decision.kind === 'redirect') {
    return (
      <Navigate
        to={decision.to}
        replace
        state={decision.to === '/login' ? { from: location } : undefined}
      />
    )
  }
  return <>{children}</>
}

/** Requires an authenticated admin. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { access, retry, signOut } = useAuth()
  const decision = resolveAuthView(access, 'admin')

  if (decision.kind === 'loading') {
    return <FullScreenLoader label={decision.label} />
  }
  if (decision.kind === 'issue') {
    return (
      <AuthAccessIssue
        issue={decision.issue}
        onRetry={retry}
        onSignOut={signOut}
      />
    )
  }
  if (decision.kind === 'redirect') {
    return <Navigate to={decision.to} replace />
  }
  return <>{children}</>
}
