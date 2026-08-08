import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    profile: {
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Ana Teste',
      role: 'aluna',
      current_team: 1,
    },
  }),
}))

vi.mock('../hooks/useStudentData', () => ({
  useStudentData: () => ({
    data: {
      workouts: [
        {
          id: 'legacy-workout',
          team: 1,
          title: 'Treino Iniciante 1',
          pdf_path: 'legacy.pdf',
          sort_order: 1,
        },
      ],
      completedIds: new Set<string>(),
      checkinDates: new Set<string>(),
      todayCheckin: null,
      totalCheckins: 3,
    },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock('../components/Toast', () => ({
  useToast: () => ({ show: vi.fn() }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  TEAM_LABELS: { 1: 'Iniciante', 2: 'Intermediário', 3: 'Avançado' },
}))

import { selectCheckinWorkoutId } from '../features/home/selectCheckinWorkoutId'
import { Home } from './Home'

describe('Home student experience', () => {
  it('never records a check-in against another team workout', () => {
    const workouts = [
      {
        id: 'other-team-workout',
        team: 2 as const,
        title: 'Outro time',
        pdf_path: 'other.pdf',
        sort_order: 1,
      },
    ]

    expect(selectCheckinWorkoutId(workouts, new Set(), 1)).toBeUndefined()
  })

  it('keeps the check-in attached to the current team', () => {
    const workouts = [
      {
        id: 'completed-current-team',
        team: 1 as const,
        title: 'Atual concluído',
        pdf_path: 'current.pdf',
        sort_order: 1,
      },
      {
        id: 'pending-other-team',
        team: 2 as const,
        title: 'Outro pendente',
        pdf_path: 'other.pdf',
        sort_order: 1,
      },
    ]

    expect(
      selectCheckinWorkoutId(workouts, new Set(['completed-current-team']), 1),
    ).toBe('completed-current-team')
  })

  it('shows the personalized routine without legacy team fichas', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(Home),
      ),
    )

    expect(html).toContain('Olá, Ana!')
    expect(html).toContain('Sua rotina, do seu jeito.')
    expect(html).toContain('3 check-ins registrados')
    expect(html).toContain('Marcar treino de hoje')
    expect(html).toContain('href="/dieta"')
    expect(html).toContain('href="/treino"')

    expect(html).not.toContain('Fichas do Team')
    expect(html).not.toContain('Treino Iniciante 1')
    expect(html).not.toContain('Continue de onde parou')
    expect(html).not.toContain('Team 2')
  })
})
