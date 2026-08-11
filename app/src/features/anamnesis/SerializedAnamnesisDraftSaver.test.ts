import { describe, expect, it, vi } from 'vitest'

import { SerializedAnamnesisDraftSaver } from './SerializedAnamnesisDraftSaver'
import type { AnamnesisDraft } from './draft'
import type { AnamnesisDraftRepository } from './repository'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DRAFT_ID = '22222222-2222-4222-8222-222222222222'

function draft(answer: string, updatedAt: string): AnamnesisDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    schemaVersion: 'angela-anamnesis.v1',
    revision: 0,
    status: 'draft',
    answers: { birth_date: answer },
    createdAt: '2026-08-03T15:00:00.000Z',
    updatedAt,
    submittedAt: null,
    idempotencyKey: DRAFT_ID,
  }
}

describe('SerializedAnamnesisDraftSaver', () => {
  it('serializes writes and rebases the latest queued answers on the server revision', async () => {
    const releases: Array<(saved: AnamnesisDraft) => void> = []
    let active = 0
    let maxActive = 0
    const save = vi.fn(
      () =>
        new Promise<AnamnesisDraft>((resolve) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          releases.push((saved) => {
            active -= 1
            resolve(saved)
          })
        }),
    )
    const repository: AnamnesisDraftRepository = {
      load: vi.fn(),
      save,
      submit: vi.fn(),
      getDeliveryStatus: vi.fn(),
    }
    const saver = new SerializedAnamnesisDraftSaver(repository)
    const first = draft('1990-06-15', '2026-08-03T15:01:00.000Z')
    const latest = draft('1991-07-16', '2026-08-03T15:02:00.000Z')

    const firstResult = saver.queue(first)
    const latestResult = saver.queue(latest)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenNthCalledWith(1, first, 0)

    releases.shift()?.({ ...first, revision: 1 })
    await firstResult
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))

    expect(save).toHaveBeenNthCalledWith(
      2,
      { ...latest, revision: 1 },
      1,
    )
    releases.shift()?.({ ...latest, revision: 2 })

    await expect(latestResult).resolves.toMatchObject({
      revision: 2,
      answers: { birth_date: '1991-07-16' },
    })
    await expect(saver.flush()).resolves.toMatchObject({ revision: 2 })
    expect(maxActive).toBe(1)
  })

  it('preserves the newest queued answers when an earlier save fails', async () => {
    let rejectFirst: ((error: Error) => void) | undefined
    let resolveLatest: ((saved: AnamnesisDraft) => void) | undefined
    const save = vi
      .fn<AnamnesisDraftRepository['save']>()
      .mockImplementationOnce(
        () =>
          new Promise<AnamnesisDraft>((_resolve, reject) => {
            rejectFirst = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<AnamnesisDraft>((resolve) => {
            resolveLatest = resolve
          }),
      )
    const repository: AnamnesisDraftRepository = {
      load: vi.fn(),
      save,
      submit: vi.fn(),
      getDeliveryStatus: vi.fn(),
    }
    const saver = new SerializedAnamnesisDraftSaver(repository)
    const first = draft('1990-06-15', '2026-08-11T21:04:00.000Z')
    const latest = draft('1991-07-16', '2026-08-11T21:06:00.000Z')

    const failedSave = saver.queue(first)
    const latestSave = saver.queue(latest)
    void latestSave.catch(() => undefined)

    rejectFirst?.(new Error('upstream timed out'))

    await expect(failedSave).rejects.toThrow('upstream timed out')
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenNthCalledWith(2, latest, 0)

    resolveLatest?.({ ...latest, revision: 1 })
    await expect(latestSave).resolves.toMatchObject({
      revision: 1,
      answers: { birth_date: '1991-07-16' },
    })
    await expect(saver.flush()).resolves.toMatchObject({
      revision: 1,
      answers: { birth_date: '1991-07-16' },
    })
  })
})
