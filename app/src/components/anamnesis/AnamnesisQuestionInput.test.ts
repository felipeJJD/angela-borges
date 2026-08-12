import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AngelaAnamnesisJourney } from '../../features/anamnesis'
import {
  AnamnesisQuestionInput,
  interactionHintForStep,
} from './AnamnesisQuestionInput'

describe('AnamnesisQuestionInput', () => {
  it('keeps catalog values behind accessible selected cards', () => {
    const step = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'nutrition_goal',
    )!
    const selected = step.options![0]
    const html = renderToStaticMarkup(
      createElement(AnamnesisQuestionInput, {
        step,
        answer: selected.value,
        onChange: () => undefined,
      }),
    )

    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain(selected.label)
    expect(html).toContain('data-option-index="01"')
    expect(html).not.toContain('localStorage')
  })

  it('provides exact interaction hints without inventing option copy', () => {
    const single = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'nutrition_goal',
    )!
    const multi = AngelaAnamnesisJourney.catalog.steps.find(
      (candidate) => candidate.key === 'dietary_restrictions',
    )!

    expect(interactionHintForStep(single)).toBe('Escolha uma opção')
    expect(interactionHintForStep(multi)).toBe('Selecione todas que se aplicam')
  })
})
