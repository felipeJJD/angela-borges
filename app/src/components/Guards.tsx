import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { FullScreenLoader } from './Spinner'

/** Requires an authenticated aluna (non-admin). Admins are sent to /admin. */
export function RequireStudent({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!profile) return <FullScreenLoader label="Carregando perfil…" />
  if (profile.role === 'admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

/** Requires an authenticated admin. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <FullScreenLoader label="Carregando perfil…" />
  if (profile.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
