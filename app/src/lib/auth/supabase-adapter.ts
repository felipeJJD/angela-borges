import type { Session } from '@supabase/supabase-js'

import { supabase, type Profile } from '../supabase'
import type {
  AuthGateway,
  LoadAuthenticatedProfile,
} from './auth-state'

function friendlySignInError(message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('invalid login') ||
    normalized.includes('credentials')
  ) {
    return 'E-mail ou senha incorretos.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Fale com a Angela.'
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Falha de conexão. Verifique sua internet.'
  }
  return 'Não foi possível entrar. Tente novamente.'
}

export const supabaseAuthGateway: AuthGateway<Session> = {
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },
  onSessionChange: (listener) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(session)
    })
    return () => data.subscription.unsubscribe()
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(friendlySignInError(error.message))
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
}

export const loadAuthenticatedProfile: LoadAuthenticatedProfile<Profile> =
  async (userId) => {
    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, full_name, role, current_team, created_at')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        if (
          status === 401 ||
          status === 403 ||
          error.code === '42501'
        ) {
          return { status: 'forbidden' }
        }
        if (error.code === 'PGRST116') return { status: 'missing' }
        return { status: 'transient-error' }
      }

      if (!data) return { status: 'missing' }
      if (
        data.id !== userId ||
        (data.role !== 'admin' && data.role !== 'aluna')
      ) {
        return { status: 'forbidden' }
      }

      return { status: 'ready', profile: data as Profile }
    } catch {
      return { status: 'transient-error' }
    }
  }
