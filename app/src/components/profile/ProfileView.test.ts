import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileView } from './ProfileView'

vi.mock('../../lib/supabase', () => ({
  TEAM_LABELS: { 1: 'Iniciante', 2: 'Intermediário', 3: 'Avançado' },
}))

const baseProps = {
  fullName: 'Aluna Teste',
  email: 'aluna@example.test',
  team: 1,
  checkins: 7,
  completed: 3,
  signingOut: false,
  signOutError: null,
  onSignOut: () => undefined,
}

describe('ProfileView', () => {
  it('groups only Angela-supported identity, progress, and account fields', () => {
    const html = renderToStaticMarkup(createElement(ProfileView, baseProps))

    expect(html).toContain('Aluna Teste')
    expect(html).toContain('aluna@example.test')
    expect(html).toContain('Sua evolução')
    expect(html).toContain('Informações da conta')
    expect(html).toContain('Conta')
    expect(html).toContain('Sair da conta')
    expect(html).not.toMatch(/Alterar senha|Notificações|Excluir conta|Suporte/)
  })

  it('disables and relabels logout while the request is active', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileView, { ...baseProps, signingOut: true }),
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Saindo…')
  })

  it('announces a recoverable logout failure', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileView, {
        ...baseProps,
        signOutError: 'Não foi possível sair. Tente novamente.',
      }),
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Não foi possível sair. Tente novamente.')
  })
})

type ProfileElementProps = Readonly<{
  signingOut: boolean
  signOutError: string | null
  onSignOut: () => void
}>

function createUseStateHarness() {
  const values: unknown[] = []
  let cursor = 0

  function useState<T>(initialState: T | (() => T)) {
    const index = cursor
    cursor += 1

    if (!(index in values)) {
      values[index] =
        typeof initialState === 'function'
          ? (initialState as () => T)()
          : initialState
    }

    function setState(nextState: T | ((previousState: T) => T)) {
      values[index] =
        typeof nextState === 'function'
          ? (nextState as (previousState: T) => T)(values[index] as T)
          : nextState
    }

    return [values[index] as T, setState] as const
  }

  return {
    beginRender() {
      cursor = 0
    },
    useState,
  }
}

async function loadPerfil(
  signOut: () => Promise<void>,
  useState: ReturnType<typeof createUseStateHarness>['useState'],
) {
  vi.resetModules()
  vi.doMock('react', async () => ({
    ...(await vi.importActual<typeof import('react')>('react')),
    useState,
  }))
  vi.doMock('../../hooks/useAuth', () => ({
    useAuth: () => ({
      session: {
        user: { id: 'student-1', email: 'aluna@example.test' },
      },
      profile: { full_name: 'Aluna Teste', current_team: 1 },
      signOut,
    }),
  }))
  vi.doMock('../../hooks/useStudentData', () => ({
    useStudentData: () => ({
      data: { completedIds: new Set(['workout-1']), totalCheckins: 2 },
    }),
  }))

  return import('../../pages/Perfil')
}

function profileProps(element: ReactElement): ProfileElementProps {
  return element.props as ProfileElementProps
}

afterEach(() => {
  vi.doUnmock('react')
  vi.doUnmock('../../hooks/useAuth')
  vi.doUnmock('../../hooks/useStudentData')
  vi.resetModules()
})

describe('Perfil logout state', () => {
  it('blocks repeated logout requests while the first one is pending', async () => {
    let resolveSignOut: (() => void) | undefined
    const pendingSignOut = new Promise<void>((resolve) => {
      resolveSignOut = resolve
    })
    const signOut = vi.fn(() => pendingSignOut)
    const state = createUseStateHarness()
    const { Perfil } = await loadPerfil(signOut, state.useState)

    state.beginRender()
    const initial = profileProps(Perfil())
    initial.onSignOut()

    state.beginRender()
    const pending = profileProps(Perfil())
    expect(pending.signingOut).toBe(true)
    pending.onSignOut()
    pending.onSignOut()

    expect(signOut).toHaveBeenCalledTimes(1)
    resolveSignOut?.()
    await pendingSignOut
  })

  it('clears the failure and retries logout after a rejection', async () => {
    const signOut = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    const state = createUseStateHarness()
    const { Perfil } = await loadPerfil(signOut, state.useState)

    state.beginRender()
    profileProps(Perfil()).onSignOut()
    await Promise.resolve()
    await Promise.resolve()

    state.beginRender()
    const failed = profileProps(Perfil())
    expect(failed.signingOut).toBe(false)
    expect(failed.signOutError).toBe(
      'Não foi possível sair. Tente novamente.',
    )

    failed.onSignOut()
    state.beginRender()
    const retrying = profileProps(Perfil())
    expect(retrying.signingOut).toBe(true)
    expect(retrying.signOutError).toBeNull()
    expect(signOut).toHaveBeenCalledTimes(2)
    await Promise.resolve()
  })
})
