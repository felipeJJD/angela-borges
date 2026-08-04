import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { HomePlanLinks } from '../components/HomePlanLinks'

describe('HomePlanLinks', () => {
  it('shows diet and training side by side as separate worker-plan destinations', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(HomePlanLinks)),
    )

    expect(html).toContain('grid-cols-2')
    expect(html).toContain('href="/dieta"')
    expect(html).toContain('href="/treino"')
    expect(html.indexOf('Dieta')).toBeLessThan(html.indexOf('Treino'))
  })
})
