import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button } from './Button'

function renderButton(loading = false): string {
  return renderToStaticMarkup(
    createElement(
      Button,
      { loading, variant: 'outline' },
      createElement('svg', { 'aria-hidden': 'true' }),
      'Sair da conta',
    ),
  )
}

function spanClasses(markup: string): string[][] {
  return [...markup.matchAll(/<span class="([^"]*)"/g)].map((match) =>
    match[1].split(/\s+/).filter(Boolean),
  )
}

describe('Button', () => {
  it('aligns an icon and label inside the content wrapper', () => {
    const [contentClasses] = spanClasses(renderButton())

    expect(contentClasses).toEqual(
      expect.arrayContaining([
        'inline-flex',
        'items-center',
        'justify-center',
        'gap-2',
      ]),
    )
  })

  it('keeps aligned content dimmed and disabled while loading', () => {
    const markup = renderButton(true)
    const contentClasses = spanClasses(markup).at(-1)

    expect(markup).toContain('disabled=""')
    expect(contentClasses).toEqual(
      expect.arrayContaining([
        'inline-flex',
        'items-center',
        'justify-center',
        'gap-2',
        'opacity-90',
      ]),
    )
  })
})
