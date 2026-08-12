import { useState } from 'react'

import { ProfileView } from '../components/profile/ProfileView'
import { useAuth } from '../hooks/useAuth'
import { useStudentData } from '../hooks/useStudentData'

export function Perfil() {
  const { session, profile, signOut } = useAuth()
  const userId = session?.user.id
  const { data } = useStudentData(userId)
  const team = profile?.current_team ?? 1
  const email = session?.user.email ?? '—'
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const completed = data?.completedIds.size ?? 0
  const checkins = data?.totalCheckins ?? 0

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
      setSignOutError('Não foi possível sair. Tente novamente.')
    }
  }

  return (
    <ProfileView
      fullName={profile?.full_name ?? '—'}
      email={email}
      team={team}
      checkins={checkins}
      completed={completed}
      signingOut={signingOut}
      signOutError={signOutError}
      onSignOut={() => void handleSignOut()}
    />
  )
}
