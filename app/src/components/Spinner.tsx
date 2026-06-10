export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-coral/25 border-t-coral animate-spin-slow ${className}`}
      role="status"
      aria-label="Carregando"
    />
  )
}

export function FullScreenLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-ink">
      <Spinner className="h-9 w-9" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}
