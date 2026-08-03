import { describe, expect, it } from 'vitest'
import { AngelaAnamnesisJourney } from './index'

const validAnswers = {
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
  disliked_foods: ['eggplant', 'mushrooms'],
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

describe('AngelaAnamnesisJourney catalog', () => {
  it('publishes the stable 25-step Angela questionnaire', () => {
    const catalog = AngelaAnamnesisJourney.catalog

    expect(catalog.schemaVersion).toBe('angela-anamnesis.v1')
    expect(catalog.steps.map(({ key }) => key)).toEqual([
      'birth_date',
      'height_cm',
      'weight_kg',
      'nutrition_goal',
      'meal_routine',
      'dietary_restrictions',
      'nutrition_challenge',
      'health_history',
      'sleep_quality',
      'water_intake',
      'emotional_eating',
      'meal_preparation',
      'planned_supplements',
      'sweet_craving_times',
      'disliked_foods',
      'food_budget',
      'training_experience_level',
      'training_days_per_week',
      'training_location',
      'injuries_or_limitations',
      'preferred_exercises',
      'conditioning_level',
      'training_background',
      'training_barrier',
      'training_focus_areas',
    ])
    expect(catalog.steps.filter(({ section }) => section === 'personal')).toHaveLength(3)
    expect(catalog.steps.filter(({ section }) => section === 'nutrition')).toHaveLength(13)
    expect(catalog.steps.filter(({ section }) => section === 'training')).toHaveLength(9)
    expect(new Set(catalog.steps.map(({ type }) => type))).toEqual(
      new Set(['single', 'multi', 'number', 'date', 'text']),
    )

    const optionValues = Object.fromEntries(
      catalog.steps
        .filter(({ options }) => options)
        .map(({ key, options }) => [key, options?.map(({ value }) => value)]),
    )
    expect(optionValues).toEqual({
      nutrition_goal: ['weight_loss', 'muscle_gain', 'general_health'],
      meal_routine: [
        'breakfast',
        'morning_snack',
        'lunch',
        'afternoon_snack',
        'dinner',
        'supper',
        'late_night_snack',
      ],
      dietary_restrictions: [
        'none',
        'lactose_intolerance',
        'gluten_intolerance',
        'other_allergies',
      ],
      nutrition_challenge: [
        'sweets',
        'anxiety_compulsion',
        'alcohol',
        'overeating',
        'meal_planning',
      ],
      health_history: ['diabetes', 'hypertension', 'high_cholesterol', 'none'],
      sleep_quality: ['excellent', 'good', 'fair', 'poor'],
      water_intake: ['under_1l', '1_to_1_5l', '1_75_to_2l', 'over_2l'],
      emotional_eating: ['never', 'rarely', 'often', 'always'],
      meal_preparation: ['self', 'family', 'eats_out', 'delivery', 'household_help'],
      planned_supplements: [
        'none',
        'whey_protein',
        'creatine',
        'pre_workout',
        'omega_3',
        'multivitamin',
      ],
      sweet_craving_times: [
        'none',
        'breakfast',
        'morning_snack',
        'lunch',
        'afternoon_snack',
        'dinner',
        'supper',
      ],
      disliked_foods: [
        'none',
        'kale',
        'eggplant',
        'cucumber',
        'tomato',
        'onion',
        'garlic',
        'pepper',
        'carrot',
        'broccoli',
        'zucchini',
        'mushrooms',
        'peanuts',
        'fish',
        'shrimp',
        'octopus',
        'squid',
        'egg',
        'cheese',
        'milk',
        'yogurt',
        'whole_grain_bread',
      ],
      food_budget: ['up_to_200', '200_to_400', '400_to_600', 'over_600'],
      training_experience_level: ['beginner', 'basic', 'intermediate', 'experienced'],
      training_days_per_week: ['1_2_days', '3_4_days', '5_6_days', 'every_day'],
      training_location: ['gym', 'home_equipment', 'outdoors', 'mixed'],
      preferred_exercises: ['strength', 'aerobic', 'functional', 'varied'],
      conditioning_level: ['very_low', 'low', 'medium', 'good'],
      training_background: [
        'never_consistent',
        'school_sports',
        'gym_months',
        'diverse_experience',
      ],
      training_barrier: ['time', 'motivation', 'knowledge', 'fatigue'],
      training_focus_areas: ['glutes', 'legs', 'arms', 'back', 'shoulders', 'chest'],
    })

    expect(
      catalog.steps
        .filter(({ rules }) => rules?.exclusiveOption)
        .map(({ key }) => key),
    ).toEqual([
      'dietary_restrictions',
      'health_history',
      'planned_supplements',
      'sweet_craving_times',
      'disliked_foods',
    ])
    expect(
      catalog.steps
        .filter(({ rules }) => rules?.maxSelections === 2)
        .map(({ key }) => key),
    ).toEqual(['preferred_exercises', 'training_focus_areas'])

    const copy = JSON.stringify(catalog).toLocaleLowerCase('pt-BR')
    expect(copy).not.toContain(['pai', 'zão'].join(''))
    expect(copy).not.toContain(['filho', 'ta'].join(''))
  })
})

describe('AngelaAnamnesisJourney validation', () => {
  it('uses one stable UUID for the draft, idempotency, and correlation identity', () => {
    const draft = AngelaAnamnesisJourney.createDraft({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      now: '2026-08-03T15:00:00.000Z',
    })

    expect(draft).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      schemaVersion: 'angela-anamnesis.v1',
      revision: 0,
      status: 'draft',
      answers: {},
      createdAt: '2026-08-03T15:00:00.000Z',
      updatedAt: '2026-08-03T15:00:00.000Z',
      submittedAt: null,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('enforces required values, numeric ranges, dates, and stable options', () => {
    expect(AngelaAnamnesisJourney.validateAnswer('height_cm', 119)).toMatchObject({
      valid: false,
      issues: [{ key: 'height_cm', code: 'out_of_range' }],
    })
    expect(AngelaAnamnesisJourney.validateAnswer('height_cm', 165)).toEqual({
      valid: true,
      issues: [],
    })
    expect(AngelaAnamnesisJourney.validateAnswer('birth_date', '')).toMatchObject({
      valid: false,
      issues: [{ key: 'birth_date', code: 'required' }],
    })
    expect(AngelaAnamnesisJourney.validateAnswer('birth_date', '2999-01-01')).toMatchObject({
      valid: false,
      issues: [{ key: 'birth_date', code: 'future_date' }],
    })
    expect(
      AngelaAnamnesisJourney.validateAnswer('nutrition_goal', 'unstable-option'),
    ).toMatchObject({
      valid: false,
      issues: [{ key: 'nutrition_goal', code: 'invalid_option' }],
    })
  })

  it('applies exclusive none and max-selection rules consistently', () => {
    expect(
      AngelaAnamnesisJourney.validateAnswer('dietary_restrictions', [
        'none',
        'lactose_intolerance',
      ]),
    ).toMatchObject({
      valid: false,
      issues: [{ key: 'dietary_restrictions', code: 'exclusive_option' }],
    })
    expect(
      AngelaAnamnesisJourney.validateAnswer('preferred_exercises', [
        'strength',
        'functional',
        'aerobic',
      ]),
    ).toMatchObject({
      valid: false,
      issues: [{ key: 'preferred_exercises', code: 'max_selections' }],
    })

    expect(
      AngelaAnamnesisJourney.toggleMultiAnswer(
        'dietary_restrictions',
        ['lactose_intolerance'],
        'none',
      ),
    ).toEqual(['none'])
    expect(
      AngelaAnamnesisJourney.toggleMultiAnswer(
        'dietary_restrictions',
        ['none'],
        'gluten_intolerance',
      ),
    ).toEqual(['gluten_intolerance'])
    expect(
      AngelaAnamnesisJourney.toggleMultiAnswer(
        'preferred_exercises',
        ['strength', 'functional'],
        'aerobic',
      ),
    ).toEqual(['strength', 'functional'])
  })

  it('validates the complete draft and reports deterministic progress', () => {
    const draft = {
      ...AngelaAnamnesisJourney.createDraft({
        id: 'draft-002',
        userId: 'user-123',
        now: '2026-08-03T15:00:00.000Z',
      }),
      answers: { ...validAnswers },
    }

    expect(AngelaAnamnesisJourney.validateDraft(draft)).toEqual({
      valid: true,
      issues: [],
    })
    expect(AngelaAnamnesisJourney.getProgress(draft.answers)).toEqual({
      completed: 25,
      total: 25,
      percentage: 100,
    })

    const incompleteDraft = {
      ...draft,
      answers: { ...draft.answers, water_intake: undefined },
    }
    expect(AngelaAnamnesisJourney.validateDraft(incompleteDraft)).toMatchObject({
      valid: false,
      issues: [{ key: 'water_intake', code: 'required' }],
    })
    expect(AngelaAnamnesisJourney.getProgress(incompleteDraft.answers)).toEqual({
      completed: 24,
      total: 25,
      percentage: 96,
    })
  })
})

describe('AngelaAnamnesisJourney reducer', () => {
  const createDraft = () =>
    AngelaAnamnesisJourney.createDraft({
      id: 'draft-reducer',
      userId: 'user-123',
      now: '2026-08-03T15:00:00.000Z',
    })

  it('blocks next and review until required data is valid, while allowing back', () => {
    const initial = AngelaAnamnesisJourney.createState(createDraft())
    const blocked = AngelaAnamnesisJourney.reducer(initial, { type: 'next' })

    expect(blocked).toMatchObject({
      phase: 'answering',
      stepIndex: 0,
      issues: [{ key: 'birth_date', code: 'required' }],
    })

    const answered = AngelaAnamnesisJourney.reducer(blocked, {
      type: 'answer_changed',
      key: 'birth_date',
      value: '1990-06-15',
      now: '2026-08-03T15:01:00.000Z',
    })
    const advanced = AngelaAnamnesisJourney.reducer(answered, { type: 'next' })
    expect(advanced.stepIndex).toBe(1)

    const forcedReview = AngelaAnamnesisJourney.reducer(advanced, { type: 'review' })
    expect(forcedReview).toMatchObject({
      phase: 'answering',
      stepIndex: 1,
      issues: [{ key: 'height_cm', code: 'required' }],
    })
    expect(
      AngelaAnamnesisJourney.reducer(forcedReview, { type: 'back' }).stepIndex,
    ).toBe(0)
  })

  it('accepts a server revision without overwriting answers changed during the save', () => {
    const initial = AngelaAnamnesisJourney.createState(createDraft())
    const firstAnswer = AngelaAnamnesisJourney.reducer(initial, {
      type: 'answer_changed',
      key: 'birth_date',
      value: '1990-06-15',
      now: '2026-08-03T15:01:00.000Z',
    })
    const newerAnswer = AngelaAnamnesisJourney.reducer(firstAnswer, {
      type: 'answer_changed',
      key: 'birth_date',
      value: '1991-07-16',
      now: '2026-08-03T15:02:00.000Z',
    })

    const synchronized = AngelaAnamnesisJourney.reducer(newerAnswer, {
      type: 'save_succeeded',
      draft: {
        ...firstAnswer.draft,
        revision: 1,
        updatedAt: '2026-08-03T15:01:30.000Z',
      },
    })

    expect(synchronized.draft).toMatchObject({
      revision: 1,
      answers: { birth_date: '1991-07-16' },
      updatedAt: '2026-08-03T15:02:00.000Z',
    })
  })

  it('hydrates only the bound user and current schema, resuming at the first gap', () => {
    const initial = AngelaAnamnesisJourney.createState(createDraft())
    const partialDraft = {
      ...createDraft(),
      answers: { birth_date: '1990-06-15', height_cm: 165 },
    }
    const hydrated = AngelaAnamnesisJourney.reducer(initial, {
      type: 'hydrate',
      draft: partialDraft,
    })
    expect(hydrated).toMatchObject({ phase: 'answering', stepIndex: 2, error: null })

    const otherUser = AngelaAnamnesisJourney.reducer(initial, {
      type: 'hydrate',
      draft: { ...partialDraft, userId: 'other-user' },
    })
    expect(otherUser).toMatchObject({
      phase: 'error',
      stepIndex: 0,
      error: { kind: 'hydration' },
      draft: { userId: 'user-123', answers: {} },
    })

    const otherSchema = AngelaAnamnesisJourney.reducer(initial, {
      type: 'hydrate',
      draft: { ...partialDraft, schemaVersion: 'angela-anamnesis.v0' },
    })
    expect(otherSchema).toMatchObject({
      phase: 'error',
      error: { kind: 'hydration' },
      draft: { schemaVersion: 'angela-anamnesis.v1', answers: {} },
    })
  })

  it('suppresses double submit and models success and retryable failure', () => {
    const completeDraft = { ...createDraft(), answers: { ...validAnswers } }
    const review = AngelaAnamnesisJourney.reducer(
      AngelaAnamnesisJourney.createState(completeDraft),
      { type: 'review' },
    )
    expect(review.phase).toBe('review')

    const submitting = AngelaAnamnesisJourney.reducer(review, {
      type: 'submit_requested',
      now: '2026-08-03T15:02:00.000Z',
    })
    expect(submitting).toMatchObject({
      phase: 'submitting',
      draft: { status: 'submitting' },
    })
    expect(
      AngelaAnamnesisJourney.reducer(submitting, {
        type: 'submit_requested',
        now: '2026-08-03T15:02:01.000Z',
      }),
    ).toBe(submitting)

    const failed = AngelaAnamnesisJourney.reducer(submitting, {
      type: 'submit_failed',
      message: 'O envio seguro não está disponível.',
      now: '2026-08-03T15:03:00.000Z',
    })
    expect(failed).toMatchObject({
      phase: 'error',
      error: { kind: 'submit', message: 'O envio seguro não está disponível.' },
      draft: { status: 'draft' },
    })
    expect(AngelaAnamnesisJourney.reducer(failed, { type: 'retry' }).phase).toBe(
      'review',
    )

    const submittedDraft = {
      ...submitting.draft,
      revision: 1,
      status: 'submitted' as const,
      submittedAt: '2026-08-03T15:04:00.000Z',
      updatedAt: '2026-08-03T15:04:00.000Z',
    }
    expect(
      AngelaAnamnesisJourney.reducer(submitting, {
        type: 'submit_succeeded',
        draft: submittedDraft,
      }),
    ).toMatchObject({ phase: 'submitted', draft: submittedDraft, error: null })
  })
})
