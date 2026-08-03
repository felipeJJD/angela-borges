import { describe, expect, it } from 'vitest'

import {
  createAuthController,
  resolveAuthAccess,
  type AuthGateway,
  type AuthProfile,
  type AuthSession,
  type LoadAuthenticatedProfile,
} from './auth-state'

type TestSession = AuthSession & { user: { id: string } }
type TestProfile = AuthProfile & { full_name: string }

const sessionFor = (id: string): TestSession => ({ user: { id } })

const profileFor = (
  id: string,
  role: TestProfile['role'],
): TestProfile => ({ id, role, full_name: `Pessoa ${id}` })

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fakeGateway(
  getSession: () => Promise<TestSession | null> = async () => null,
) {
  let listener: (session: TestSession | null) => void = () => undefined
  let signOut: () => Promise<void> = async () => undefined
  const gateway: AuthGateway<TestSession> = {
    getSession,
    onSessionChange: (nextListener) => {
      listener = nextListener
      return () => {
        listener = () => undefined
      }
    },
    signIn: async () => undefined,
    signOut: () => signOut(),
  }

  return {
    gateway,
    emit: (session: TestSession | null) => listener(session),
    setSignOut: (nextSignOut: () => Promise<void>) => {
      signOut = nextSignOut
    },
  }
}

describe('resolveAuthAccess', () => {
  it('projects an authenticated student into the ready-student terminal state', () => {
    const session = sessionFor('student-1')
    const profile = profileFor('student-1', 'aluna')

    expect(
      resolveAuthAccess({
        booting: false,
        session,
        profileResolution: { status: 'ready', profile },
      }),
    ).toEqual({
      status: 'ready-student',
      session,
      profile,
    })
  })

  it('keeps every authentication and profile outcome observably distinct', () => {
    const studentSession = sessionFor('student-1')
    const adminSession = sessionFor('admin-1')

    const statuses = [
      resolveAuthAccess<TestSession, TestProfile>({
        booting: true,
        session: null,
        profileResolution: { status: 'idle' },
      }).status,
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: null,
        profileResolution: { status: 'idle' },
      }).status,
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: studentSession,
        profileResolution: { status: 'loading' },
      }).status,
      resolveAuthAccess({
        booting: false,
        session: studentSession,
        profileResolution: {
          status: 'ready',
          profile: profileFor('student-1', 'aluna'),
        },
      }).status,
      resolveAuthAccess({
        booting: false,
        session: adminSession,
        profileResolution: {
          status: 'ready',
          profile: profileFor('admin-1', 'admin'),
        },
      }).status,
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: studentSession,
        profileResolution: { status: 'missing' },
      }).status,
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: studentSession,
        profileResolution: { status: 'forbidden' },
      }).status,
      resolveAuthAccess<TestSession, TestProfile>({
        booting: false,
        session: studentSession,
        profileResolution: { status: 'transient-error' },
      }).status,
    ]

    expect(statuses).toEqual([
      'booting',
      'signed-out',
      'profile-loading',
      'ready-student',
      'ready-admin',
      'profile-missing',
      'profile-forbidden',
      'transient-error',
    ])
    expect(new Set(statuses).size).toBe(statuses.length)
  })

  it('rejects a profile that does not belong to the session user', () => {
    expect(
      resolveAuthAccess({
        booting: false,
        session: sessionFor('current-user'),
        profileResolution: {
          status: 'ready',
          profile: profileFor('different-user', 'admin'),
        },
      }),
    ).toMatchObject({
      status: 'profile-forbidden',
      action: 'sign-out-or-contact',
    })
  })
})

describe('createAuthController', () => {
  it('leaves booting when the initial session lookup fails', async () => {
    const gateway: AuthGateway<TestSession> = {
      getSession: async () => {
        throw new Error('network unavailable')
      },
      onSessionChange: () => () => undefined,
      signIn: async () => undefined,
      signOut: async () => undefined,
    }
    const loadAuthenticatedProfile: LoadAuthenticatedProfile<TestProfile> =
      async () => ({ status: 'missing' })
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile,
    })

    const stop = auth.start()
    await nextTurn()

    expect(auth.getState()).toMatchObject({
      status: 'transient-error',
      session: null,
      action: 'retry',
    })
    stop()
  })

  it('leaves booting after a successful initial session lookup while the profile loads', async () => {
    const session = sessionFor('student-1')
    const pendingProfile = deferred<{
      status: 'ready'
      profile: TestProfile
    }>()
    const { gateway } = fakeGateway(async () => session)
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: () => pendingProfile.promise,
    })

    const stop = auth.start()
    await nextTurn()
    expect(auth.getState()).toEqual({
      status: 'profile-loading',
      session,
      profile: null,
    })

    pendingProfile.resolve({
      status: 'ready',
      profile: profileFor('student-1', 'aluna'),
    })
    await nextTurn()
    stop()
  })

  it('settles signed-out when the successful initial lookup has no session', async () => {
    let profileLoads = 0
    const { gateway } = fakeGateway()
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: async () => {
        profileLoads += 1
        return { status: 'missing' }
      },
    })

    const stop = auth.start()
    await nextTurn()

    expect(auth.getState()).toEqual({
      status: 'signed-out',
      session: null,
      profile: null,
    })
    expect(profileLoads).toBe(0)
    stop()
  })

  it('does not load a stale initial user after a newer auth event', async () => {
    const initialSession = deferred<TestSession | null>()
    const loadedUserIds: string[] = []
    const { gateway, emit } = fakeGateway(() => initialSession.promise)
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: async (userId) => {
        loadedUserIds.push(userId)
        return {
          status: 'ready',
          profile: profileFor(userId, 'aluna'),
        }
      },
    })

    const stop = auth.start()
    emit(sessionFor('current-user'))
    await nextTurn()
    initialSession.resolve(sessionFor('stale-initial-user'))
    await nextTurn()

    expect(loadedUserIds).toEqual(['current-user'])
    expect(auth.getState()).toMatchObject({
      status: 'ready-student',
      session: sessionFor('current-user'),
    })
    stop()
  })

  it('loads only the current user id and settles a missing profile', async () => {
    const session = sessionFor('student-1')
    const loadedUserIds: string[] = []
    const { gateway } = fakeGateway(async () => session)
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: async (userId) => {
        loadedUserIds.push(userId)
        return { status: 'missing' }
      },
    })

    const stop = auth.start()
    await nextTurn()

    expect(loadedUserIds).toEqual(['student-1'])
    expect(auth.getState()).toMatchObject({
      status: 'profile-missing',
      session,
      action: 'sign-out-or-contact',
    })
    stop()
  })

  it('ignores a stale profile result after a newer session becomes ready', async () => {
    const firstProfile = deferred<{
      status: 'ready'
      profile: TestProfile
    }>()
    const secondProfile = deferred<{
      status: 'ready'
      profile: TestProfile
    }>()
    const loads = new Map([
      ['first-user', firstProfile.promise],
      ['second-user', secondProfile.promise],
    ])
    const { gateway, emit } = fakeGateway()
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: (userId) => {
        const load = loads.get(userId)
        if (!load) throw new Error(`unexpected user ${userId}`)
        return load
      },
    })

    const stop = auth.start()
    await nextTurn()
    emit(sessionFor('first-user'))
    emit(sessionFor('second-user'))

    secondProfile.resolve({
      status: 'ready',
      profile: profileFor('second-user', 'admin'),
    })
    await nextTurn()
    expect(auth.getState()).toMatchObject({
      status: 'ready-admin',
      session: sessionFor('second-user'),
    })

    firstProfile.resolve({
      status: 'ready',
      profile: profileFor('first-user', 'aluna'),
    })
    await nextTurn()
    expect(auth.getState()).toMatchObject({
      status: 'ready-admin',
      session: sessionFor('second-user'),
    })
    stop()
  })

  it('clears local access immediately on sign-out and ignores pending profile work', async () => {
    const session = sessionFor('student-1')
    const pendingProfile = deferred<{
      status: 'ready'
      profile: TestProfile
    }>()
    const pendingSignOut = deferred<void>()
    const gatewayHarness = fakeGateway(async () => session)
    gatewayHarness.setSignOut(() => pendingSignOut.promise)
    const auth = createAuthController({
      gateway: gatewayHarness.gateway,
      loadAuthenticatedProfile: () => pendingProfile.promise,
    })

    const stop = auth.start()
    await nextTurn()
    const signOut = auth.signOut()

    expect(auth.getState().status).toBe('signed-out')
    pendingProfile.resolve({
      status: 'ready',
      profile: profileFor('student-1', 'aluna'),
    })
    await nextTurn()
    expect(auth.getState().status).toBe('signed-out')

    pendingSignOut.resolve()
    await signOut
    stop()
  })

  it('retries a transient profile failure for the same authenticated user', async () => {
    const session = sessionFor('student-1')
    let attempts = 0
    const { gateway } = fakeGateway(async () => session)
    const auth = createAuthController({
      gateway,
      loadAuthenticatedProfile: async () => {
        attempts += 1
        return attempts === 1
          ? { status: 'transient-error' }
          : {
              status: 'ready',
              profile: profileFor('student-1', 'aluna'),
            }
      },
    })

    const stop = auth.start()
    await nextTurn()
    expect(auth.getState()).toMatchObject({
      status: 'transient-error',
      action: 'retry',
    })

    await auth.retry()
    expect(auth.getState()).toMatchObject({
      status: 'ready-student',
      session,
    })
    expect(attempts).toBe(2)
    stop()
  })
})
