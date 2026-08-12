type Props = Readonly<{
  currentStep: number
  totalSteps: number
  completed: number
  percentage: number
}>

export function AnamnesisProgress({
  currentStep,
  totalSteps,
  completed,
  percentage,
}: Props) {
  return (
    <div aria-label={`Progresso da anamnese: ${percentage}% concluído`}>
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <span className="text-white">
          Questão {currentStep} de {totalSteps}
        </span>
        <span className="text-coral-bright">{percentage}% concluído</span>
      </div>
      <ol
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const state =
            index + 1 === currentStep
              ? 'current'
              : index + 1 < currentStep
                ? 'complete'
                : 'pending'
          return (
            <li
              key={index}
              data-progress-segment
              data-state={state}
              className={`h-1 rounded-full ${
                state === 'current'
                  ? 'bg-coral-bright shadow-[0_0_10px_rgba(255,138,92,0.65)]'
                  : state === 'complete'
                    ? 'bg-coral/70'
                    : 'bg-white/10'
              }`}
            />
          )
        })}
      </ol>
      <p className="mt-2 text-right text-[11px] text-muted-2">
        {completed} de {totalSteps} respostas válidas
      </p>
    </div>
  )
}
