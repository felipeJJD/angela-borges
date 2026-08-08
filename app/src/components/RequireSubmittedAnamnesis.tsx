import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import {
  loadAnamnesisAccess,
  resolveAnamnesisGate,
  type AnamnesisGateState,
} from '../features/anamnesis/AnamnesisAccess'
import { SupabaseAngelaPlanDeliverySource } from '../features/personalized-plan/SupabaseAngelaPlanDeliverySource'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Button } from './Button'
import { FullScreenLoader } from './Spinner'

type GateCheck = Readonly<{
  userId: string | null
  retryToken: number
  state: AnamnesisGateState
}>

export function RequireSubmittedAnamnesis() {
  const { session, signOut } = useAuth()
  const location = useLocation()
  const userId = session?.user.id ?? null
  const source = useMemo(() => new SupabaseAngelaPlanDeliverySource(supabase), [])
  const [retryToken, setRetryToken] = useState(0)
  const [check, setCheck] = useState<GateCheck>({
    userId: null,
    retryToken: -1,
    state: 'checking',
  })

  useEffect(() => {
    if (!userId) return
    let active = true

    void loadAnamnesisAccess(source, userId)
      .then((state) => {
        if (active) setCheck({ userId, retryToken, state })
      })
      .catch(() => {
        if (active) setCheck({ userId, retryToken, state: 'error' })
      })

    return () => {
      active = false
    }
  }, [retryToken, source, userId])

  if (!userId || check.userId !== userId || check.retryToken !== retryToken) {
    return <FullScreenLoader label="Confirmando sua anamnese…" />
  }

  const decision = resolveAnamnesisGate(check.state)
  if (decision.kind === 'loading') {
    return <FullScreenLoader label="Confirmando sua anamnese…" />
  }
  if (decision.kind === 'redirect') {
    return (
      <Navigate
        to={decision.to}
        replace
        state={{ from: location.pathname }}
      />
    )
  }
  if (decision.kind === 'error') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
        <div role="alert" className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral-bright">
            Primeiro acesso
          </p>
          <h1 className="mt-2 text-display text-2xl text-white">
            Não conseguimos confirmar sua anamnese
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Confira sua conexão e tente novamente. Seu acesso só será liberado depois dessa confirmação.
          </p>
          <div className="mt-6 grid gap-3">
            <Button full onClick={() => setRetryToken((current) => current + 1)}>
              Tentar novamente
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => void signOut().catch(() => undefined)}
            >
              Sair da conta
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
