import { useState } from 'react'
import { IconCopy, IconCheck } from './icons'

export function CopyField({ label, value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard may be blocked; ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      )}
      <button
        type="button"
        onClick={copy}
        className="flex h-12 w-full items-center gap-2 rounded-2xl border border-coral/30 bg-coral/10 px-4 text-left transition-colors hover:bg-coral/15"
      >
        <code className="flex-1 truncate font-mono text-[15px] font-semibold tracking-wide text-coral-bright">
          {value}
        </code>
        {copied ? (
          <span className="flex items-center gap-1 text-xs font-medium text-coral-bright">
            <IconCheck className="h-4 w-4" /> Copiado
          </span>
        ) : (
          <IconCopy className="h-5 w-5 shrink-0 text-coral-bright/80" />
        )}
      </button>
    </div>
  )
}
