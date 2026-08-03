import type { AnamnesisDraft } from './draft'
import type { AnamnesisValidationIssue } from './validation'

export type AnamnesisDeliveryStatus = Readonly<{
  status: 'accepted_pending' | 'delivered' | 'failed'
  retryable: boolean
  attempts: number
}>

export type AnamnesisSubmissionResult = Readonly<{
  draft: AnamnesisDraft
  delivery: AnamnesisDeliveryStatus
}>

/**
 * Persistence seam for one already-authenticated user.
 *
 * The adapter binds the user when it is created, so callers never pass account
 * or transport details to load/save/submit. `expectedRevision` is mandatory on
 * every mutation and adapters must reject stale writes.
 */
export interface AnamnesisDraftRepository {
  load(): Promise<AnamnesisDraft | null>
  save(draft: AnamnesisDraft, expectedRevision: number): Promise<AnamnesisDraft>
  submit(
    draft: AnamnesisDraft,
    expectedRevision: number,
  ): Promise<AnamnesisSubmissionResult>
  getDeliveryStatus(idempotencyKey: string): Promise<AnamnesisDeliveryStatus>
}

export class AnamnesisDraftRevisionConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      `Anamnesis draft revision conflict: expected ${expectedRevision}, current ${actualRevision}.`,
    )
    this.name = 'AnamnesisDraftRevisionConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export class AnamnesisDraftScopeError extends Error {
  constructor() {
    super('The anamnesis draft does not belong to the repository-bound user.')
    this.name = 'AnamnesisDraftScopeError'
  }
}

export class AnamnesisDraftValidationError extends Error {
  readonly issues: readonly AnamnesisValidationIssue[]

  constructor(issues: readonly AnamnesisValidationIssue[]) {
    super('The anamnesis draft is not valid for this operation.')
    this.name = 'AnamnesisDraftValidationError'
    this.issues = issues
  }
}
