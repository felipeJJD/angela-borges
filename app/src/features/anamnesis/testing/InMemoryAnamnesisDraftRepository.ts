import { ANGELA_ANAMNESIS_SCHEMA_VERSION } from '../catalog'
import type { AnamnesisDraft } from '../draft'
import {
  AnamnesisDraftRevisionConflictError,
  AnamnesisDraftScopeError,
  AnamnesisDraftValidationError,
  type AnamnesisDeliveryStatus,
  type AnamnesisDraftRepository,
  type AnamnesisSubmissionResult,
} from '../repository'
import { validateAnamnesisDraft } from '../validation'

type InMemoryRepositoryOptions = Readonly<{
  now?: () => string
  seed?: AnamnesisDraft
}>

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

export class InMemoryAnamnesisDraftRepository
  implements AnamnesisDraftRepository
{
  private readonly boundUserId: string
  private readonly now: () => string
  private stored: AnamnesisDraft | null

  constructor(boundUserId: string, options: InMemoryRepositoryOptions = {}) {
    if (!boundUserId.trim()) throw new Error('A bound user is required')
    this.boundUserId = boundUserId
    this.now = options.now ?? (() => new Date().toISOString())
    this.stored = options.seed ? cloneDraft(options.seed) : null
    if (this.stored) this.assertScopeAndSchema(this.stored)
  }

  async load(): Promise<AnamnesisDraft | null> {
    return this.stored ? cloneDraft(this.stored) : null
  }

  async save(
    draft: AnamnesisDraft,
    expectedRevision: number,
  ): Promise<AnamnesisDraft> {
    this.assertScopeAndSchema(draft)
    this.assertRevision(draft, expectedRevision)

    const saved: AnamnesisDraft = {
      ...cloneDraft(draft),
      revision: expectedRevision + 1,
      status: 'draft',
      updatedAt: this.now(),
      submittedAt: null,
    }
    this.stored = saved
    return cloneDraft(saved)
  }

  async submit(
    draft: AnamnesisDraft,
    expectedRevision: number,
  ): Promise<AnamnesisSubmissionResult> {
    this.assertScopeAndSchema(draft)

    if (
      this.stored?.status === 'submitted' &&
      this.stored.id === draft.id &&
      this.stored.idempotencyKey === draft.idempotencyKey
    ) {
      return {
        draft: cloneDraft(this.stored),
        delivery: { status: 'delivered', retryable: false, attempts: 1 },
      }
    }

    this.assertRevision(draft, expectedRevision)
    const validation = validateAnamnesisDraft(draft)
    if (!validation.valid) throw new AnamnesisDraftValidationError(validation.issues)

    const submittedAt = this.now()
    const submitted: AnamnesisDraft = {
      ...cloneDraft(draft),
      revision: expectedRevision + 1,
      status: 'submitted',
      updatedAt: submittedAt,
      submittedAt,
    }
    this.stored = submitted
    return {
      draft: cloneDraft(submitted),
      delivery: { status: 'delivered', retryable: false, attempts: 1 },
    }
  }

  async getDeliveryStatus(idempotencyKey: string): Promise<AnamnesisDeliveryStatus> {
    if (!this.stored || this.stored.idempotencyKey !== idempotencyKey) {
      throw new Error('No submitted anamnesis exists for this identity.')
    }
    return { status: 'delivered', retryable: false, attempts: 1 }
  }

  private assertScopeAndSchema(draft: AnamnesisDraft): void {
    if (draft.userId !== this.boundUserId) throw new AnamnesisDraftScopeError()
    if (draft.schemaVersion !== ANGELA_ANAMNESIS_SCHEMA_VERSION) {
      const validation = validateAnamnesisDraft(draft)
      throw new AnamnesisDraftValidationError(validation.issues)
    }
  }

  private assertRevision(draft: AnamnesisDraft, expectedRevision: number): void {
    const actualRevision = this.stored?.revision ?? 0
    if (
      expectedRevision !== actualRevision ||
      draft.revision !== expectedRevision ||
      (this.stored !== null &&
        (this.stored.id !== draft.id ||
          this.stored.idempotencyKey !== draft.idempotencyKey))
    ) {
      throw new AnamnesisDraftRevisionConflictError(expectedRevision, actualRevision)
    }
  }
}
