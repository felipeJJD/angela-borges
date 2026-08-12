import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { StudentLayout } from './StudentLayout'

describe('StudentLayout visual contract', () => {
  it('provides the shared canvas and clearance for the floating navigation', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(StudentLayout) },
            createElement(Route, {
              index: true,
              element: createElement('p', null, 'Conteúdo do aluno'),
            }),
          ),
        ),
      ),
    )

    expect(html).toContain('student-shell')
    expect(html).toContain('pb-nav')
    expect(html).toContain('Conteúdo do aluno')
  })

  it('defines floating-nav clearance and a reduced-motion fallback', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/\.pb-nav\s*\{[^}]*7\.25rem/s)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
  })
})
