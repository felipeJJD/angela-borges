import { IconCheck } from '../icons'
import {
  AngelaAnamnesisJourney,
  type AnamnesisAnswer,
  type AnamnesisStep,
  type AnamnesisStepKey,
} from '../../features/anamnesis'

type Props = Readonly<{
  step: AnamnesisStep
  answer: AnamnesisAnswer | undefined
  issue?: string
  onChange: (answer: AnamnesisAnswer | undefined) => void
}>

// eslint-disable-next-line react-refresh/only-export-components
export function interactionHintForStep(step: AnamnesisStep): string {
  if (step.type === 'single') return 'Escolha uma opção'
  if (step.type === 'multi') return 'Selecione todas que se aplicam'
  return 'Preencha o campo abaixo'
}

export function AnamnesisQuestionInput({
  step,
  answer,
  issue,
  onChange,
}: Props) {
  if (step.type === 'single' || step.type === 'multi') {
    const selected = Array.isArray(answer) ? answer : []
    return (
      <div className="space-y-3">
        {step.options?.map((option, index) => {
          const checked =
            step.type === 'single'
              ? answer === option.value
              : selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                if (step.type === 'single') return onChange(option.value)
                const toggled = AngelaAnamnesisJourney.toggleMultiAnswer(
                  step.key as AnamnesisStepKey,
                  selected,
                  option.value,
                )
                onChange(toggled.length === 0 ? undefined : toggled)
              }}
              className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-bright/80 ${
                checked
                  ? 'border-coral-bright/80 bg-gradient-to-r from-coral/20 to-coral-deep/10 text-white shadow-[0_10px_30px_-18px_rgba(255,138,92,0.9)]'
                  : 'border-white/8 bg-surface/90 text-neutral-200 hover:border-white/20'
              }`}
            >
              <span
                data-option-index={String(index + 1).padStart(2, '0')}
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                  checked
                    ? 'bg-coral-bright text-ink'
                    : 'bg-white/6 text-muted'
                }`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                {option.label}
              </span>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                  step.type === 'single' ? 'rounded-full' : 'rounded-lg'
                } border ${
                  checked
                    ? 'border-coral-bright bg-coral-bright text-ink'
                    : 'border-muted-2 text-transparent'
                }`}
              >
                <IconCheck className="h-3.5 w-3.5" />
              </span>
            </button>
          )
        })}
        {issue && (
          <p className="pt-1 text-sm text-red-300" role="alert">
            {issue}
          </p>
        )}
      </div>
    )
  }

  const fieldClass =
    'w-full rounded-2xl border-2 border-white/10 bg-surface/90 text-white outline-none transition focus:border-coral-bright/70 focus:ring-4 focus:ring-coral/10'

  if (step.type === 'text') {
    const text = typeof answer === 'string' ? answer : ''
    return (
      <div>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          maxLength={step.rules?.maxLength}
          rows={6}
          className={`${fieldClass} resize-none px-4 py-3 text-[15px] leading-relaxed placeholder:text-muted-2`}
          placeholder="Escreva aqui…"
          aria-invalid={Boolean(issue)}
        />
        <div className="mt-2 flex justify-between gap-3 text-xs">
          <span className="text-red-300" role={issue ? 'alert' : undefined}>
            {issue}
          </span>
          <span className="shrink-0 text-muted-2">
            {text.length}/{step.rules?.maxLength ?? 500}
          </span>
        </div>
      </div>
    )
  }

  const value =
    typeof answer === 'number' || typeof answer === 'string' ? answer : ''
  return (
    <label className="block">
      <span className="sr-only">{step.prompt}</span>
      <div className="relative">
        <input
          type={step.type}
          value={value}
          min={step.rules?.min}
          max={step.rules?.max}
          step={step.inputStep}
          onChange={(event) => {
            if (event.target.value === '') onChange(undefined)
            else if (step.type === 'number') onChange(event.target.valueAsNumber)
            else onChange(event.target.value)
          }}
          aria-invalid={Boolean(issue)}
          className={`${fieldClass} h-16 px-4 pr-14 text-lg`}
        />
        {step.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">
            {step.unit}
          </span>
        )}
      </div>
      {issue && (
        <span className="mt-2 block text-sm text-red-300" role="alert">
          {issue}
        </span>
      )}
    </label>
  )
}
