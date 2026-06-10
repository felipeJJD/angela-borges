import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { IconEye, IconEyeOff } from './icons'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, type = 'text', className = '', id, ...rest },
  ref,
) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (show ? 'text' : 'password') : type

  return (
    <label htmlFor={id} className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={inputType}
          className={`h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px] text-white placeholder:text-muted-2 transition-colors focus:border-coral/60 focus:outline-none focus:ring-2 focus:ring-coral/20 ${
            isPassword ? 'pr-12' : ''
          } ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-2 flex w-9 items-center justify-center text-muted-2 hover:text-white"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
          >
            {show ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
          </button>
        )}
      </div>
      {hint && <span className="mt-1.5 block text-xs text-muted-2">{hint}</span>}
    </label>
  )
})
