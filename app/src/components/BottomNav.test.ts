import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BottomNav } from './BottomNav'

function render(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(BottomNav),
    ),
  )
}

describe('BottomNav', () => {
  it('keeps the five student destinations in the requested order', () => {
    const html = render('/')
    const labels = ['Início', 'Dieta', 'Treino', 'Biblioteca', 'Perfil']

    let previousIndex = -1
    for (const label of labels) {
      const index = html.indexOf(label)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }

    expect(html).toContain('href="/"')
    expect(html).toContain('href="/dieta"')
    expect(html).toContain('href="/treino"')
    expect(html).toContain('href="/treinos"')
    expect(html).toContain('href="/perfil"')
    expect(html).not.toContain('Meu Plano')
  })

  it('marks only the current top-level destination as active', () => {
    const html = render('/treino')

    expect(html).toMatch(/aria-current="page"[^>]*href="\/treino"/)
    expect(html).not.toMatch(/aria-current="page"[^>]*href="\/treinos"/)
  })
})
