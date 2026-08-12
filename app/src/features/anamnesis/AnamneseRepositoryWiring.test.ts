import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  repositoryConstructor: vi.fn(),
  supabaseClient: { kind: 'synthetic-supabase-client' },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: '11111111-1111-4111-8111-111111111111' } },
  }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: mocks.supabaseClient,
}))

vi.mock('./SupabaseAnamnesisDraftRepository', () => ({
  SupabaseAnamnesisDraftRepository: class {
    load = vi.fn(async () => null)
    save = vi.fn()
    submit = vi.fn()
    getDeliveryStatus = vi.fn()

    constructor(userId: string, client: unknown) {
      mocks.repositoryConstructor(userId, client)
    }
  },
}))

import { Anamnese } from '../../pages/Anamnese'

describe('Anamnese production repository wiring', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds the production Supabase repository to the current authenticated user', () => {
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/anamnese'] },
        createElement(Anamnese),
      ),
    )

    expect(mocks.repositoryConstructor).toHaveBeenCalledOnce()
    expect(mocks.repositoryConstructor).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      mocks.supabaseClient,
    )
  })

  it('keeps clinical answers and privileged Dashboard credentials out of browser storage/code', () => {
    const appSource = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'Anamnese.tsx'),
      'utf8',
    )
    const repositorySource = readFileSync(
      resolve(
        process.cwd(),
        'src',
        'features',
        'anamnesis',
        'SupabaseAnamnesisDraftRepository.ts',
      ),
      'utf8',
    )
    const progressSource = readFileSync(
      resolve(
        process.cwd(),
        'src',
        'components',
        'anamnesis',
        'AnamnesisProgress.tsx',
      ),
      'utf8',
    )
    const inputSource = readFileSync(
      resolve(
        process.cwd(),
        'src',
        'components',
        'anamnesis',
        'AnamnesisQuestionInput.tsx',
      ),
      'utf8',
    )
    const browserSource = `${appSource}\n${repositorySource}\n${progressSource}\n${inputSource}`

    expect(browserSource).not.toMatch(/localStorage|sessionStorage|indexedDB/i)
    expect(browserSource).not.toMatch(
      /ANGELA_WEBHOOK_HMAC_SECRET|SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i,
    )
  })

  it('composes the visual controls without replacing the journey or repository', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'Anamnese.tsx'),
      'utf8',
    )

    expect(source).toContain('AnamnesisProgress')
    expect(source).toContain('AnamnesisQuestionInput')
    expect(source).toContain('interactionHintForStep')
    expect(source).toContain('AngelaAnamnesisJourney.createState')
    expect(source).toContain('AngelaAnamnesisJourney.createDraft')
    expect(source).toContain('SerializedAnamnesisDraftSaver')
    expect(source).toContain('aria-labelledby="anamnesis-question"')
  })

  it('recovers submitted drafts by checking honest pending/delivered/failed delivery state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'Anamnese.tsx'),
      'utf8',
    )
    expect(source).toContain('getDeliveryStatus')
    expect(source).toContain('accepted_pending')
    expect(source).toContain('delivered')
    expect(source).toContain('failed')
    expect(source).toContain('Verificar entrega')
    expect(source).not.toContain('Recebi suas respostas')
  })
})
