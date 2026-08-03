import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('personalized plan legacy preservation sentinels', () => {
  it('keeps all 34 community fichas and their legacy routes as Biblioteca', () => {
    const planFiles = readdirSync(resolve(process.cwd(), '..', 'scripts', 'plans')).filter(
      (name) => name.endsWith('.json'),
    )
    const app = source('src/App.tsx')
    const nav = source('src/components/BottomNav.tsx')
    const library = source('src/pages/Treinos.tsx')

    expect(planFiles).toHaveLength(34)
    expect(app).toContain('path="/" element={<Home />}')
    expect(app).toContain('path="/meu-plano"')
    expect(app).toContain('path="/treinos"')
    expect(app).toContain('path="/treino/:id"')
    expect(nav).toContain("to: '/meu-plano'")
    expect(nav).toContain("to: '/treinos'")
    expect(nav).toContain("label: 'Biblioteca'")
    expect(library).toContain('Biblioteca')
    expect(library).toContain('data.workouts.length')
    expect(library).toContain('TEAM_LABELS')
    expect(library).toContain('WorkoutCard')
  })

  it('leaves check-ins, completions, team locks and legacy data paths intact', () => {
    const home = source('src/pages/Home.tsx')
    const studentData = source('src/hooks/useStudentData.ts')
    const library = source('src/pages/Treinos.tsx')
    const anamnesis = source('src/pages/Anamnese.tsx')

    expect(home).toContain("from('daily_checkins')")
    expect(home).toContain('profile?.current_team')
    expect(studentData).toContain("from('workout_completions')")
    expect(studentData).toContain("from('daily_checkins')")
    expect(studentData).toContain("from('workouts')")
    expect(library).toContain('locked: t > team')
    expect(anamnesis).toContain("navigate('/meu-plano')")
    expect(anamnesis).toContain('Ver meu plano')
  })

  it('uses one active-plan row and keeps privileged/foreign contracts out of the browser', () => {
    const frontend = [
      'src/features/personalized-plan/AngelaPersonalizedPlan.ts',
      'src/features/personalized-plan/SupabaseAngelaPlanDeliverySource.ts',
      'src/features/personalized-plan/useAngelaPersonalizedPlan.ts',
      'src/pages/MeuPlano.tsx',
    ]
      .map(source)
      .join('\n')

    expect(frontend).toContain("from('angela_personalized_plans')")
    expect(frontend).not.toMatch(/from\(['"](?:diet|training|diets|trainings)['"]\)/i)
    expect(frontend).not.toMatch(
      /service[_-]?role|supabase_service_role_key|matila|paiz[aã]o|mys?hape|brand[aã]o|account_id/i,
    )
  })
})
