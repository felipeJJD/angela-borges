import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import type { Profile } from '../lib/supabase'
import {
  createAuthController,
  type AuthAccess,
  type AuthGateway,
  type LoadAuthenticatedProfile,
} from '../lib/auth/auth-state'
import {
  loadAuthenticatedProfile as loadSupabaseProfile,
  supabaseAuthGateway,
} from '../lib/auth/supabase-adapter'

type AppAuthAccess = AuthAccess<Session, Profile>

export type AuthState = {
  access: AppAuthAccess
  status: AppAuthAccess['status']
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  retry: () => Promise<void>
  refreshProfile: () => Promise<void>
}

type AuthProviderProps = {
  children: ReactNode
  gateway?: AuthGateway<Session>
  loadAuthenticatedProfile?: LoadAuthenticatedProfile<Profile>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({
  children,
  gateway = supabaseAuthGateway,
  loadAuthenticatedProfile = loadSupabaseProfile,
}: AuthProviderProps) {
  const auth = useMemo(
    () => createAuthController({ gateway, loadAuthenticatedProfile }),
    [gateway, loadAuthenticatedProfile],
  )
  const access = useSyncExternalStore(
    auth.subscribe,
    auth.getState,
    auth.getState,
  )

  useEffect(() => {
    return auth.start()
  }, [auth])

  const value = useMemo<AuthState>(
    () => ({
      access,
      status: access.status,
      session: access.session,
      profile: access.profile,
      loading:
        access.status === 'booting' || access.status === 'profile-loading',
      signIn: auth.signIn,
      signOut: auth.signOut,
      retry: auth.retry,
      refreshProfile: auth.retry,
    }),
    [access, auth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
