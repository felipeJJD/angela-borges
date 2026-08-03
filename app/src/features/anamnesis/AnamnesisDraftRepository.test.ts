import { describe, expect, it } from 'vitest'
import { AngelaAnamnesisJourney, type AnamnesisDraft } from './index'
import {
  AnamnesisDraftRevisionConflictError,
  AnamnesisDraftScopeError,
  AnamnesisDraftValidationError,
  type AnamnesisDraftRepository,
} from './repository'
import { InMemoryAnamnesisDraftRepository } from './testing/InMemoryAnamnesisDraftRepository'

const completeAnswers = {
  birth_date: '1990-06-15',
  height_cm: 165,
  weight_kg: 68.4,
  nutrition_goal: 'general_health',
  meal_routine: ['breakfast', 'lunch', 'dinner'],
  dietary_restrictions: ['none'],
  nutrition_challenge: 'meal_planning',
  health_history: ['none'],
  sleep_quality: 'good',
  water_intake: '1_75_to_2l',
  emotional_eating: 'rarely',
  meal_preparation: 'self',
  planned_supplements: ['none'],
  sweet_craving_times: ['none'],
  disliked_foods: ['eggplant'],
  food_budget: '200_to_400',
  training_experience_level: 'basic',
  training_days_per_week: '3_4_days',
  training_location: 'gym',
  injuries_or_limitations: 'Nenhuma',
  preferred_exercises: ['strength', 'functional'],
  conditioning_level: 'medium',
  training_background: 'gym_months',
  training_barrier: 'time',
  training_focus_areas: ['glutes', 'legs'],
} as const

function newDraft(userId = 'user-123'): AnamnesisDraft {
  return AngelaAnamnesisJourney.createDraft({
    id: 'draft-repository',
    userId,
    now: '2026-08-03T15:00:00.000Z',
  })
}

function createRepository(): AnamnesisDraftRepository {
  const times = [
    '2026-08-03T15:01:00.000Z',
    '2026-08-03T15:02:00.000Z',
    '2026-08-03T15:03:00.000Z',
  ]
  return new InMemoryAnamnesisDraftRepository('user-123', {
    now: () => times.shift() ?? '2026-08-03T15:04:00.000Z',
  })
}

describe('AnamnesisDraftRepository contract', () => {
  it('loads and saves a draft through a user-bound, account-agnostic interface', async () => {
    const repository = createRepository()
    expect(await repository.load()).toBeNull()

    const saved = await repository.save(newDraft(), 0)
    expect(saved).toMatchObject({
      id: 'draft-repository',
      userId: 'user-123',
      schemaVersion: 'angela-anamnesis.v1',
      status: 'draft',
      revision: 1,
      updatedAt: '2026-08-03T15:01:00.000Z',
    })
    expect(await repository.load()).toEqual(saved)
  })

  it('rejects another user and stale optimistic revisions without changing storage', async () => {
    const repository = createRepository()
    const saved = await repository.save(newDraft(), 0)

    await expect(repository.save(newDraft('other-user'), 1)).rejects.toBeInstanceOf(
      AnamnesisDraftScopeError,
    )
    await expect(repository.save(saved, 0)).rejects.toBeInstanceOf(
      AnamnesisDraftRevisionConflictError,
    )
    expect(await repository.load()).toEqual(saved)
  })

  it('submits a complete draft once and replays the stable idempotent result', async () => {
    const repository = createRepository()
    const saved = await repository.save(
      { ...newDraft(), answers: { ...completeAnswers } },
      0,
    )

    const submitted = await repository.submit(saved, 1)
    expect(submitted).toMatchObject({
      revision: 2,
      status: 'submitted',
      submittedAt: '2026-08-03T15:02:00.000Z',
      idempotencyKey: saved.idempotencyKey,
    })
    expect(await repository.submit(saved, 1)).toEqual(submitted)
    expect(await repository.load()).toEqual(submitted)
  })

  it('refuses to submit an incomplete draft', async () => {
    const repository = createRepository()
    const saved = await repository.save(newDraft(), 0)

    await expect(repository.submit(saved, 1)).rejects.toBeInstanceOf(
      AnamnesisDraftValidationError,
    )
    expect((await repository.load())?.status).toBe('draft')
  })
})
