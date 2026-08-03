import type {
  AuthAccess,
  AuthProfile,
  AuthSession,
} from './auth-state'

export type AuthSurface = 'student' | 'admin' | 'login'

export type AuthViewDecision =
  | { kind: 'render' }
  | { kind: 'loading'; label: string }
  | { kind: 'redirect'; to: '/login' | '/' | '/admin' }
  | {
      kind: 'issue'
      issue: 'profile-missing' | 'profile-forbidden' | 'transient-error'
    }

export function resolveAuthView<
  TSession extends AuthSession,
  TProfile extends AuthProfile,
>(
  access: AuthAccess<TSession, TProfile>,
  surface: AuthSurface,
): AuthViewDecision {
  if (access.status === 'booting') {
    return { kind: 'loading', label: 'Carregando…' }
  }

  if (access.status === 'profile-loading') {
    return {
      kind: 'loading',
      label: surface === 'login' ? 'Entrando…' : 'Carregando perfil…',
    }
  }

  if (access.status === 'profile-missing') {
    return { kind: 'issue', issue: 'profile-missing' }
  }

  if (access.status === 'profile-forbidden') {
    return { kind: 'issue', issue: 'profile-forbidden' }
  }

  if (access.status === 'transient-error') {
    return { kind: 'issue', issue: 'transient-error' }
  }

  if (access.status === 'signed-out') {
    return surface === 'login'
      ? { kind: 'render' }
      : { kind: 'redirect', to: '/login' }
  }

  if (surface === 'login') {
    return {
      kind: 'redirect',
      to: access.status === 'ready-admin' ? '/admin' : '/',
    }
  }

  if (surface === 'admin') {
    return access.status === 'ready-admin'
      ? { kind: 'render' }
      : { kind: 'redirect', to: '/' }
  }

  return access.status === 'ready-student'
    ? { kind: 'render' }
    : { kind: 'redirect', to: '/admin' }
}
