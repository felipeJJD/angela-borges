import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  full?: boolean
  children: ReactNode
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/60'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-coral-bright to-coral-deep text-white glow-coral-sm hover:brightness-110',
  ghost: 'bg-white/5 text-white hover:bg-white/10',
  outline: 'border border-border text-white hover:bg-white/5',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
  subtle: 'bg-coral/15 text-coral-bright hover:bg-coral/25',
}

const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm min-w-11',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        full ? 'w-full' : ''
      } ${className}`}
    >
      {loading && (
        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
      )}
      <span className={loading ? 'opacity-90' : ''}>{children}</span>
    </button>
  )
}
