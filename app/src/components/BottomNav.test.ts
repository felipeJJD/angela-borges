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
  it('keeps only the four student destinations in the requested order', () => {
    const html = render('/')
    const labels = ['Início', 'Dieta', 'Treino', 'Perfil']

    let previousIndex = -1
    for (const label of labels) {
      const index = html.indexOf(label)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }

    expect(html).toContain('href="/"')
    expect(html).toContain('href="/dieta"')
    expect(html).toContain('href="/treino"')
    expect(html).toContain('href="/perfil"')
    expect(html).not.toContain('href="/treinos"')
    expect(html).not.toContain('Biblioteca')
    expect(html).not.toContain('Meu Plano')
  })

  it('marks only the current top-level destination as active', () => {
    const html = render('/treino')

    expect(html).toMatch(/aria-current="page"[^>]*href="\/treino"/)
    expect(html).not.toContain('href="/treinos"')
  })

  it('renders a floating glass navigation with one active capsule', () => {
    const html = render('/treino')
    const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0]

    expect(html).toContain('aria-label="Navegação principal"')
    expect(html).toContain('data-visual="floating-glass"')
    expect(activeLink).toContain('href="/treino"')
    expect(activeLink).toContain('bg-coral/15')
    expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
  })
})
