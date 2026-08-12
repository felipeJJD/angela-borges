import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnamnesisProgress } from './AnamnesisProgress'

describe('AnamnesisProgress', () => {
  it('renders one segment per question and announces progress', () => {
    const html = renderToStaticMarkup(
      createElement(AnamnesisProgress, {
        currentStep: 3,
        totalSteps: 5,
        completed: 2,
        percentage: 40,
      }),
    )

    expect((html.match(/data-progress-segment/g) ?? [])).toHaveLength(5)
    expect(html).toContain('data-state="current"')
    expect(html).toContain('Questão 3 de 5')
    expect(html).toContain('40% concluído')
    expect(html).toContain('2 de 5 respostas válidas')
  })
})
