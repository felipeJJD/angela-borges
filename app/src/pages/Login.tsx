import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { FullScreenLoader } from '../components/Spinner'

export function Login() {
  const { session, profile, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <FullScreenLoader />

  if (session && profile) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/'} replace />
  }
  // session exists but profile still resolving handled by loading; if session w/o profile, wait
  if (session && !profile) return <FullScreenLoader label="Entrando…" />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      // redirect handled by auth state change
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.')
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      {/* Hero background */}
      <div className="absolute inset-0">
        <img
          src="/brand/hero.jpeg"
          alt=""
          className="h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/70 to-ink" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-6 safe-top">
        {/* Top brand mark */}
        <div className="flex flex-1 flex-col justify-end pb-8">
          <div className="animate-fade-up">
            <span className="text-display text-xs tracking-[0.3em] text-coral-bright">
              COMUNIDADE
            </span>
            <h1 className="mt-1 text-display text-5xl font-bold leading-[0.95] text-white">
              ANGELA
              <br />
              <span className="text-gradient-coral">BORGES</span>
            </h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/70">
              Seus treinos, sua evolução. Bora pra cima. 🔥
            </p>
          </div>
        </div>

        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="animate-fade-up mb-[max(1.5rem,env(safe-area-inset-bottom))] rounded-3xl border border-white/10 bg-ink-2/80 p-5 backdrop-blur-xl"
        >
          <div className="space-y-3">
            <Input
              id="email"
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Senha"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="animate-fade-up mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            full
            loading={submitting}
            className="mt-4"
          >
            Entrar
          </Button>
        </form>
      </div>
    </div>
  )
}
