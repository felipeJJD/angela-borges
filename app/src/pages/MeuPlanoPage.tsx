import { useEffect, useState } from 'react'

import { useAngelaPersonalizedPlan } from '../features/personalized-plan/useAngelaPersonalizedPlan'
import { useAuth } from '../hooks/useAuth'
import { MeuPlanoView, type MeuPlanoSection } from './MeuPlano'

function MeuPlanoSkeleton({ section }: Readonly<{ section: MeuPlanoSection }>) {
  const label = section === 'diet' ? 'Dieta' : section === 'training' ? 'Treino' : 'Meu Plano'
  return (
    <div className="space-y-4 px-4 pt-6 safe-top" aria-label={`Carregando ${label}`}>
      <div className="skeleton h-4 w-36 rounded" />
      <div className="skeleton h-9 w-44 rounded" />
      <div className="skeleton mt-6 h-48 rounded-2xl" />
    </div>
  )
}

export function MeuPlanoPage({
  section = 'all',
}: Readonly<{ section?: MeuPlanoSection }>) {
  const { session } = useAuth()
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const viewModel = useAngelaPersonalizedPlan(session?.user.id, online)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (viewModel.loading) return <MeuPlanoSkeleton section={section} />
  return (
    <MeuPlanoView
      state={viewModel.state}
      online={online}
      section={section}
      reloading={viewModel.reloading}
      onReload={viewModel.reload}
    />
  )
}
