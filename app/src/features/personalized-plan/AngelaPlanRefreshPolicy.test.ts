import { describe, expect, it } from 'vitest'

import {
  ANGELA_PLAN_MAX_POLL_ATTEMPTS,
  ANGELA_PLAN_POLL_INTERVAL_MS,
  getAngelaPlanPollDelay,
} from './AngelaPlanRefreshPolicy'

describe('Angela plan bounded refresh policy', () => {
  it('polls a building delivery on a bounded cadence', () => {
    expect(
      getAngelaPlanPollDelay(
        'building',
        0,
      ),
    ).toBe(ANGELA_PLAN_POLL_INTERVAL_MS)
    expect(
      getAngelaPlanPollDelay(
        'building',
        ANGELA_PLAN_MAX_POLL_ATTEMPTS,
      ),
    ).toBeNull()
  })

  it.each(['empty', 'failed', 'published'] as const)(
    'never polls the terminal %s state',
    (kind) => {
      expect(getAngelaPlanPollDelay(kind, 0)).toBeNull()
    },
  )
})
