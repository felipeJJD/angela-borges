import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('mandatory anamnesis route composition', () => {
  it('keeps the questionnaire outside the submitted-anamnesis gate', () => {
    const app = source('src/App.tsx')

    expect(app).toContain("import { RequireSubmittedAnamnesis } from './components/RequireSubmittedAnamnesis'")
    expect(app).toContain('path="/anamnese"')
    expect(app).toContain('<Route element={<RequireSubmittedAnamnesis />}>')

    const questionnaire = app.indexOf('path="/anamnese"')
    const gate = app.indexOf('<Route element={<RequireSubmittedAnamnesis />}>')
    const studentLayout = app.indexOf('<Route element={<StudentLayout />}>')
    expect(questionnaire).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(questionnaire)
    expect(studentLayout).toBeGreaterThan(gate)
  })

  it('hides app navigation during mandatory questions and offers account exit', () => {
    const layout = source('src/components/StudentLayout.tsx')
    const questionnaire = source('src/pages/Anamnese.tsx')

    expect(layout).not.toContain('useLocation')
    expect(layout).not.toContain('/anamnese')
    expect(layout).toContain('<BottomNav />')
    expect(questionnaire).toContain("aria-label={state.stepIndex === 0 ? 'Sair da conta'")
    expect(questionnaire).toContain('onExit={signOut}')
    expect(questionnaire).not.toContain("navigate('/')")
    expect(questionnaire).toContain('scheduleSave(state.draft, true).finally')
  })
})
