import type { AngelaPersonalizedPlanState } from './AngelaPersonalizedPlan'

export const ANGELA_PLAN_POLL_INTERVAL_MS = 15_000
export const ANGELA_PLAN_MAX_POLL_ATTEMPTS = 8

export function getAngelaPlanPollDelay(
  stateKind: AngelaPersonalizedPlanState['kind'],
  attempts: number,
): number | null {
  if (
    stateKind !== 'building' ||
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    attempts >= ANGELA_PLAN_MAX_POLL_ATTEMPTS
  ) {
    return null
  }
  return ANGELA_PLAN_POLL_INTERVAL_MS
}
