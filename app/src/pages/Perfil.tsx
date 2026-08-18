import { useState } from 'react'

import { ProfileView } from '../components/profile/ProfileView'
import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'

export function Perfil() {
  const { session, profile, signOut } = useAuth()
  const userId = session?.user.id
  const { data } = useStudentData(userId)
  const email = session?.user.email ?? '—'
  const [signingOut, setSigningOut] = useState(false)

  const completed = data?.completedIds.size ?? 0
  const checkins = data?.totalCheckins ?? 0

  function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    void signOut().catch(() => undefined)
  }

  return (
    <ProfileView
      fullName={profile?.full_name ?? '—'}
      email={email}
      checkins={checkins}
      completed={completed}
      signingOut={signingOut}
      onSignOut={handleSignOut}
    />
  )
}
