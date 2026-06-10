import { useEffect, type ReactNode } from 'react'
import { IconX } from './icons'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Bottom sheet on mobile / centered card. */
export function Sheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-up relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-ink-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-display text-lg text-white">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted hover:bg-white/10"
            aria-label="Fechar"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
