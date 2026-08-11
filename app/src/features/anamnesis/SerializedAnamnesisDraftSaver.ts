import type { AnamnesisDraft } from './draft'
import type { AnamnesisDraftRepository } from './repository'

type Waiter = Readonly<{
  resolve: (draft: AnamnesisDraft) => void
  reject: (error: unknown) => void
}>

type PendingSave = {
  draft: AnamnesisDraft
  waiters: Waiter[]
}

function cloneDraft(draft: AnamnesisDraft): AnamnesisDraft {
  return {
    ...draft,
    answers: Object.fromEntries(
      Object.entries(draft.answers).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
    ),
  }
}

function hasSameIdentity(left: AnamnesisDraft, right: AnamnesisDraft): boolean {
  return (
    left.id === right.id &&
    left.userId === right.userId &&
    left.schemaVersion === right.schemaVersion &&
    left.idempotencyKey === right.idempotencyKey
  )
}

/**
 * Coalescing save queue behind the repository seam.
 *
 * At most one CAS write is in flight. Answers queued during that write are
 * rebased onto the revision returned by the server before the next write.
 */
export class SerializedAnamnesisDraftSaver {
  private readonly repository: AnamnesisDraftRepository
  private pending: PendingSave | null = null
  private draining = false
  private latestSaved: AnamnesisDraft | null = null
  private idleWaiters: Array<(draft: AnamnesisDraft | null) => void> = []

  constructor(repository: AnamnesisDraftRepository) {
    this.repository = repository
  }

  queue(draft: AnamnesisDraft): Promise<AnamnesisDraft> {
    const candidate = cloneDraft(draft)
    if (this.latestSaved && !hasSameIdentity(this.latestSaved, candidate)) {
      return Promise.reject(new Error('The queued anamnesis draft identity changed.'))
    }

    const promise = new Promise<AnamnesisDraft>((resolve, reject) => {
      const waiter = { resolve, reject }
      if (this.pending) {
        if (!hasSameIdentity(this.pending.draft, candidate)) {
          reject(new Error('The queued anamnesis draft identity changed.'))
          return
        }
        this.pending.draft = candidate
        this.pending.waiters.push(waiter)
        return
      }
      this.pending = { draft: candidate, waiters: [waiter] }
    })

    void this.drain()
    return promise
  }

  flush(): Promise<AnamnesisDraft | null> {
    if (!this.draining && !this.pending) {
      return Promise.resolve(this.latestSaved ? cloneDraft(this.latestSaved) : null)
    }
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true

    while (this.pending) {
      const current = this.pending
      this.pending = null
      try {
        const expectedRevision = this.latestSaved?.revision ?? current.draft.revision
        const candidate = { ...current.draft, revision: expectedRevision }
        const saved = await this.repository.save(candidate, expectedRevision)
        if (!hasSameIdentity(candidate, saved) || saved.revision <= expectedRevision) {
          throw new Error('The save result does not match the queued anamnesis draft.')
        }
        this.latestSaved = cloneDraft(saved)
        current.waiters.forEach(({ resolve }) => resolve(cloneDraft(saved)))
      } catch (error) {
        current.waiters.forEach(({ reject }) => reject(error))
      }
    }

    this.draining = false
    const result = this.latestSaved ? cloneDraft(this.latestSaved) : null
    const waiters = this.idleWaiters
    this.idleWaiters = []
    waiters.forEach((resolve) => resolve(result))
  }

}
