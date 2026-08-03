export type AuthSession = Readonly<{
  user: Readonly<{ id: string }>
}>

export type AuthProfile = Readonly<{
  id: string
  role: 'admin' | 'aluna'
}>

export type AuthenticatedProfileResult<TProfile extends AuthProfile> =
  | { status: 'ready'; profile: TProfile }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'transient-error' }

export type LoadAuthenticatedProfile<TProfile extends AuthProfile> = (
  userId: string,
) => Promise<AuthenticatedProfileResult<TProfile>>

export type AuthGateway<TSession extends AuthSession> = Readonly<{
  getSession: () => Promise<TSession | null>
  onSessionChange: (
    listener: (session: TSession | null) => void,
  ) => () => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}>

export type ProfileResolution<TProfile extends AuthProfile> =
  | { status: 'idle' }
  | { status: 'loading' }
  | AuthenticatedProfileResult<TProfile>

export type AuthAccess<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
> =
  | { status: 'booting'; session: null; profile: null }
  | { status: 'signed-out'; session: null; profile: null }
  | { status: 'profile-loading'; session: TSession; profile: null }
  | { status: 'ready-student'; session: TSession; profile: TProfile }
  | { status: 'ready-admin'; session: TSession; profile: TProfile }
  | {
      status: 'profile-missing'
      session: TSession
      profile: null
      action: 'sign-out-or-contact'
    }
  | {
      status: 'profile-forbidden'
      session: TSession
      profile: null
      action: 'sign-out-or-contact'
    }
  | {
      status: 'transient-error'
      session: TSession | null
      profile: null
      action: 'retry'
    }

export type AuthAccessInput<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
> = Readonly<{
  booting: boolean
  session: TSession | null
  profileResolution: ProfileResolution<TProfile>
}>

export function resolveAuthAccess<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
>({
  booting,
  session,
  profileResolution,
}: AuthAccessInput<TSession, TProfile>): AuthAccess<TSession, TProfile> {
  if (booting) return { status: 'booting', session: null, profile: null }

  if (profileResolution.status === 'transient-error') {
    return {
      status: 'transient-error',
      session,
      profile: null,
      action: 'retry',
    }
  }

  if (!session) return { status: 'signed-out', session: null, profile: null }

  if (
    profileResolution.status === 'idle' ||
    profileResolution.status === 'loading'
  ) {
    return { status: 'profile-loading', session, profile: null }
  }

  if (profileResolution.status === 'missing') {
    return {
      status: 'profile-missing',
      session,
      profile: null,
      action: 'sign-out-or-contact',
    }
  }

  if (profileResolution.status === 'forbidden') {
    return {
      status: 'profile-forbidden',
      session,
      profile: null,
      action: 'sign-out-or-contact',
    }
  }

  const { profile } = profileResolution
  if (profile.id !== session.user.id) {
    return {
      status: 'profile-forbidden',
      session,
      profile: null,
      action: 'sign-out-or-contact',
    }
  }

  return {
    status: profile.role === 'admin' ? 'ready-admin' : 'ready-student',
    session,
    profile,
  }
}

type AuthControllerDependencies<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
> = Readonly<{
  gateway: AuthGateway<TSession>
  loadAuthenticatedProfile: LoadAuthenticatedProfile<TProfile>
}>

export type AuthController<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
> = Readonly<{
  start: () => () => void
  getState: () => AuthAccess<TSession, TProfile>
  subscribe: (listener: () => void) => () => void
  retry: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}>

export function createAuthController<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
>({
  gateway,
  loadAuthenticatedProfile,
}: AuthControllerDependencies<TSession, TProfile>): AuthController<
  TSession,
  TProfile
> {
  let source: AuthAccessInput<TSession, TProfile> = {
    booting: true,
    session: null,
    profileResolution: { status: 'idle' },
  }
  let started = false
  let disposed = false
  let revision = 0
  let state = resolveAuthAccess(source)
  const listeners = new Set<() => void>()

  const getState = () => state

  const publish = (next: AuthAccessInput<TSession, TProfile>) => {
    source = next
    state = resolveAuthAccess(source)
    listeners.forEach((listener) => listener())
  }

  const applySession = async (session: TSession | null) => {
    const requestRevision = ++revision
    if (!session) {
      publish({
        booting: false,
        session: null,
        profileResolution: { status: 'idle' },
      })
      return
    }

    publish({
      booting: false,
      session,
      profileResolution: { status: 'loading' },
    })

    let profileResolution: AuthenticatedProfileResult<TProfile>
    try {
      profileResolution = await loadAuthenticatedProfile(session.user.id)
    } catch {
      profileResolution = { status: 'transient-error' }
    }

    if (disposed || requestRevision !== revision) return
    publish({ booting: false, session, profileResolution })
  }

  const loadInitialSession = async () => {
    const requestRevision = revision
    try {
      const session = await gateway.getSession()
      if (disposed || requestRevision !== revision) return
      await applySession(session)
    } catch {
      if (disposed || requestRevision !== revision) return
      revision += 1
      publish({
        booting: false,
        session: null,
        profileResolution: { status: 'transient-error' },
      })
    }
  }

  return {
    start: () => {
      if (started) return () => undefined
      started = true
      disposed = false
      const stopListening = gateway.onSessionChange((session) => {
        void applySession(session)
      })
      void loadInitialSession()

      return () => {
        if (!started) return
        started = false
        disposed = true
        revision += 1
        stopListening()
      }
    },
    getState,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    retry: async () => {
      if (source.session) {
        await applySession(source.session)
        return
      }
      publish({
        booting: true,
        session: null,
        profileResolution: { status: 'idle' },
      })
      await loadInitialSession()
    },
    signIn: (email, password) => gateway.signIn(email, password),
    signOut: async () => {
      await applySession(null)
      await gateway.signOut()
    },
  }
}
