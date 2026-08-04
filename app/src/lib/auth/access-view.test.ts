import { describe, expect, it } from 'vitest'

import { resolveAuthAccess, type AuthProfile, type AuthSession } from './auth-state'
import { resolveAuthView } from './access-view'

type TestSession = AuthSession & { user: { id: string } }
type TestProfile = AuthProfile & { full_name: string }

const session = (id: string): TestSession => ({ user: { id } })
const profile = (
  id: string,
  role: TestProfile['role'],
): TestProfile => ({ id, role, full_name: id })

const ready = (id: string, role: TestProfile['role']) =>
  resolveAuthAccess({
    booting: false,
    session: session(id),
    profileResolution: { status: 'ready' as const, profile: profile(id, role) },
  })

describe('resolveAuthView', () => {
  it('keeps the existing student and admin happy paths sentinel-green', () => {
    const student = ready('student-1', 'aluna')
    const admin = ready('admin-1', 'admin')

    expect(resolveAuthView(student, 'student')).toEqual({ kind: 'render' })
    expect(resolveAuthView(admin, 'admin')).toEqual({ kind: 'render' })
    expect(resolveAuthView(admin, 'student')).toEqual({
      kind: 'redirect',
      to: '/admin',
    })
    expect(resolveAuthView(student, 'admin')).toEqual({
      kind: 'redirect',
      to: '/',
    })
    expect(resolveAuthView(student, 'login')).toEqual({
      kind: 'redirect',
      to: '/',
    })
    expect(resolveAuthView(admin, 'login')).toEqual({
      kind: 'redirect',
      to: '/admin',
    })
  })

  it('never turns a terminal profile problem into an endless loader or redirect', () => {
    const currentSession = session('student-1')
    const terminalProblems = [
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: currentSession,
        profileResolution: { status: 'missing' },
      }),
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: currentSession,
        profileResolution: { status: 'forbidden' },
      }),
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: currentSession,
        profileResolution: { status: 'transient-error' },
      }),
    ]

    for (const access of terminalProblems) {
      expect(resolveAuthView(access, 'student')).toEqual({
        kind: 'issue',
        issue: access.status,
      })
      expect(resolveAuthView(access, 'admin')).toEqual({
        kind: 'issue',
        issue: access.status,
      })
      expect(resolveAuthView(access, 'login')).toEqual({
        kind: 'issue',
        issue: access.status,
      })
    }
  })

  it('loads only while auth or the current profile is genuinely pending', () => {
    const booting = resolveAuthAccess<TestSession, TestProfile>({
      booting: true,
      session: null,
      profileResolution: { status: 'idle' },
    })
    const loadingProfile = resolveAuthAccess<TestSession, TestProfile>({
      booting: false,
      session: session('student-1'),
      profileResolution: { status: 'loading' },
    })
    const signedOut = resolveAuthAccess<TestSession, TestProfile>({
      booting: false,
      session: null,
      profileResolution: { status: 'idle' },
    })

    expect(resolveAuthView(booting, 'student').kind).toBe('loading')
    expect(resolveAuthView(loadingProfile, 'login')).toEqual({
      kind: 'loading',
      label: 'Entrando…',
    })
    expect(resolveAuthView(signedOut, 'student')).toEqual({
      kind: 'redirect',
      to: '/login',
    })
    expect(resolveAuthView(signedOut, 'login')).toEqual({ kind: 'render' })
  })
})
