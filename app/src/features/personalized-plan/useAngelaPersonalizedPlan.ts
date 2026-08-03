import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'
import {
  createAngelaPersonalizedPlan,
  type AngelaPersonalizedPlanState,
  type AngelaPlanDeliverySource,
} from './AngelaPersonalizedPlan'
import { getAngelaPlanPollDelay } from './AngelaPlanRefreshPolicy'
import { SupabaseAngelaPlanDeliverySource } from './SupabaseAngelaPlanDeliverySource'

const authenticatedSource = new SupabaseAngelaPlanDeliverySource(supabase)

export type AngelaPersonalizedPlanViewModel = Readonly<{
  state: AngelaPersonalizedPlanState
  loading: boolean
  reloading: boolean
  reload(): void
}>

export function useAngelaPersonalizedPlan(
  userId: string | undefined,
  pollingEnabled = true,
  source: AngelaPlanDeliverySource = authenticatedSource,
): AngelaPersonalizedPlanViewModel {
  const [loaded, setLoaded] = useState<Readonly<{
    userId: string
    state: AngelaPersonalizedPlanState
  }> | null>(null)
  const [reloading, setReloading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [polling, setPolling] = useState<Readonly<{
    userId: string
    attempts: number
  }> | null>(null)

  const reload = useCallback(() => {
    if (userId !== undefined) setPolling({ userId, attempts: 0 })
    setReloading(true)
    setRevision((value) => value + 1)
  }, [userId])

  useEffect(() => {
    let current = true
    if (userId === undefined) {
      return () => {
        current = false
      }
    }

    void createAngelaPersonalizedPlan(userId, source)
      .load()
      .then((nextState) => {
        if (!current) return
        setLoaded({ userId, state: nextState })
      })
      .finally(() => {
        if (!current) return
        setReloading(false)
      })

    return () => {
      current = false
    }
  }, [revision, source, userId])

  const currentState =
    userId !== undefined && loaded?.userId === userId ? loaded.state : null
  const pollAttempts =
    userId !== undefined && polling?.userId === userId ? polling.attempts : 0

  useEffect(() => {
    if (!pollingEnabled || reloading || userId === undefined || currentState === null) {
      return
    }
    const delay = getAngelaPlanPollDelay(currentState.kind, pollAttempts)
    if (delay === null) return
    const timer = window.setTimeout(() => {
      setPolling({ userId, attempts: pollAttempts + 1 })
      setReloading(true)
      setRevision((value) => value + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [currentState, pollAttempts, pollingEnabled, reloading, userId])

  if (userId === undefined) {
    return { state: { kind: 'empty' }, loading: false, reloading: false, reload }
  }
  return {
    state: loaded?.userId === userId ? loaded.state : { kind: 'empty' },
    loading: loaded?.userId !== userId,
    reloading,
    reload,
  }
}
