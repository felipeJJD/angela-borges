import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; message: string; kind: ToastKind }

type ToastCtx = {
  show: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const styles: Record<ToastKind, string> = {
  success: 'border-coral/40 bg-coral/15 text-coral-bright',
  error: 'border-red-500/40 bg-red-500/15 text-red-300',
  info: 'border-border bg-surface-2 text-white',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3200)
  }, [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-up pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-md shadow-lg ${styles[t.kind]}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
