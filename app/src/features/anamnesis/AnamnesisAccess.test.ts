import { describe, expect, it, vi } from 'vitest'

import {
  loadAnamnesisAccess,
  resolveAnamnesisGate,
  type SubmittedAnamnesisSource,
} from './AnamnesisAccess'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function source(result: unknown | null): SubmittedAnamnesisSource {
  return {
    readLatestAnamnesisSubmission: vi.fn(async () => result),
  }
}

describe('mandatory anamnesis access', () => {
  it('requires the questionnaire when no immutable submission exists', async () => {
    const reader = source(null)

    await expect(loadAnamnesisAccess(reader, USER_ID)).resolves.toBe('required')
    expect(reader.readLatestAnamnesisSubmission).toHaveBeenCalledWith(USER_ID)
  })

  it('unlocks the student shell as soon as a submission exists', async () => {
    await expect(
      loadAnamnesisAccess(
        source({
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          submittedAt: '2026-08-08T12:00:00.000Z',
        }),
        USER_ID,
      ),
    ).resolves.toBe('completed')
  })

  it('keeps transport failures distinct and fail-closed', async () => {
    const reader: SubmittedAnamnesisSource = {
      readLatestAnamnesisSubmission: vi.fn(async () => {
        throw new Error('offline')
      }),
    }

    await expect(loadAnamnesisAccess(reader, USER_ID)).rejects.toThrow('offline')
  })

  it('maps every gate state without treating errors as missing answers', () => {
    expect(resolveAnamnesisGate('checking')).toEqual({ kind: 'loading' })
    expect(resolveAnamnesisGate('required')).toEqual({
      kind: 'redirect',
      to: '/anamnese',
    })
    expect(resolveAnamnesisGate('completed')).toEqual({ kind: 'allow' })
    expect(resolveAnamnesisGate('error')).toEqual({ kind: 'error' })
  })
})
