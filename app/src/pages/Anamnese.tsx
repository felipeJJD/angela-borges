import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { IconArrowLeft, IconCheck, IconFileText } from '../components/icons'
import { FullScreenLoader } from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  AngelaAnamnesisJourney,
  type AnamnesisAnswer,
  type AnamnesisDeliveryStatus,
  type AnamnesisDraft,
  type AnamnesisDraftRepository,
  type AnamnesisSection,
  type AnamnesisStep,
  type AnamnesisStepKey,
} from '../features/anamnesis'
import { SerializedAnamnesisDraftSaver } from '../features/anamnesis/SerializedAnamnesisDraftSaver'
import { SupabaseAnamnesisDraftRepository } from '../features/anamnesis/SupabaseAnamnesisDraftRepository'

type AnamneseProps = Readonly<{
  repository?: AnamnesisDraftRepository | null
}>

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type DeliveryViewState = AnamnesisDeliveryStatus | Readonly<{ status: 'checking' }>

const sectionLabels: Record<AnamnesisSection, string> = {
  personal: 'Você',
  nutrition: 'Nutrição',
  training: 'Treino',
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function formatAnswer(step: AnamnesisStep, answer: AnamnesisAnswer | undefined): string {
  if (answer === undefined) return 'Não respondida'
  if (Array.isArray(answer)) {
    return answer
      .map(
        (value) =>
          step.options?.find((option) => option.value === value)?.label ?? value,
      )
      .join(', ')
  }
  if (step.type === 'single') {
    return step.options?.find((option) => option.value === answer)?.label ?? String(answer)
  }
  if (step.type === 'date' && typeof answer === 'string') return formatDate(answer)
  return `${String(answer)}${step.unit ? ` ${step.unit}` : ''}`
}

function PersistenceNotice({
  connected,
  saveState,
}: {
  connected: boolean
  saveState: SaveState
}) {
  const connectedCopy = {
    idle: {
      title: 'Salvamento seguro ativo',
      body: 'Seu progresso será salvo na sua conta conforme você responde.',
    },
    saving: {
      title: 'Salvando…',
      body: 'Aguarde um instante antes de fechar esta página.',
    },
    saved: {
      title: 'Rascunho salvo',
      body: 'Seu progresso está seguro e poderá ser retomado nesta conta.',
    },
    error: {
      title: 'Falha ao salvar',
      body: 'Seu progresso ainda está somente nesta tela. Continue conectada e tente outra etapa.',
    },
  }[saveState]

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-xs leading-relaxed ${
        connected
          ? 'border-coral/30 bg-coral/10 text-coral-50'
          : 'border-amber-400/25 bg-amber-400/10 text-amber-100'
      }`}
      role="status"
    >
      <strong className="block text-sm text-white">
        {connected ? connectedCopy.title : 'Rascunho não persistido'}
      </strong>
      {connected
        ? connectedCopy.body
        : 'O repositório seguro ainda não foi conectado. Fechar ou recarregar esta página descarta as respostas; nada é salvo no navegador.'}
    </div>
  )
}

function SectionRail({ activeSection }: { activeSection: AnamnesisSection }) {
  const sections: AnamnesisSection[] = ['personal', 'nutrition', 'training']
  const activeIndex = sections.indexOf(activeSection)

  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Seções da anamnese">
      {sections.map((section, index) => (
        <li
          key={section}
          className={`rounded-xl border px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${
            index === activeIndex
              ? 'border-coral/60 bg-coral/15 text-coral-bright'
              : index < activeIndex
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                : 'border-border bg-surface text-muted'
          }`}
        >
          {sectionLabels[section]}
        </li>
      ))}
    </ol>
  )
}

type QuestionProps = Readonly<{
  step: AnamnesisStep
  answer: AnamnesisAnswer | undefined
  issue?: string
  onChange: (answer: AnamnesisAnswer | undefined) => void
}>

function QuestionInput({ step, answer, issue, onChange }: QuestionProps) {
  if (step.type === 'single' || step.type === 'multi') {
    const selected = Array.isArray(answer) ? answer : []
    return (
      <div className="space-y-2">
        {step.options?.map((option) => {
          const checked =
            step.type === 'single' ? answer === option.value : selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                if (step.type === 'single') {
                  onChange(option.value)
                  return
                }
                const toggled = AngelaAnamnesisJourney.toggleMultiAnswer(
                  step.key as AnamnesisStepKey,
                  selected,
                  option.value,
                )
                onChange(toggled.length === 0 ? undefined : toggled)
              }}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                checked
                  ? 'border-coral/70 bg-coral/15 text-white'
                  : 'border-border bg-surface text-neutral-200 hover:border-neutral-600'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                  step.type === 'single' ? 'rounded-full' : 'rounded-md'
                } ${checked ? 'border-coral-bright bg-coral-bright text-white' : 'border-muted-2'}`}
              >
                {checked && <IconCheck className="h-3.5 w-3.5" />}
              </span>
              <span>{option.label}</span>
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

  if (step.type === 'text') {
    const text = typeof answer === 'string' ? answer : ''
    return (
      <div>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          maxLength={step.rules?.maxLength}
          rows={6}
          className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-muted-2 focus:border-coral/60 focus:outline-none focus:ring-2 focus:ring-coral/20"
          placeholder="Escreva aqui…"
          aria-invalid={Boolean(issue)}
        />
        <div className="mt-1 flex justify-between gap-3 text-xs">
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

  const value = typeof answer === 'number' || typeof answer === 'string' ? answer : ''
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
            if (event.target.value === '') {
              onChange(undefined)
            } else if (step.type === 'number') {
              onChange(event.target.valueAsNumber)
            } else {
              onChange(event.target.value)
            }
          }}
          aria-invalid={Boolean(issue)}
          className="h-14 w-full rounded-2xl border border-border bg-surface px-4 pr-14 text-lg text-white focus:border-coral/60 focus:outline-none focus:ring-2 focus:ring-coral/20"
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

function ReviewCard({ draft }: { draft: AnamnesisDraft }) {
  return (
    <div className="space-y-5">
      {(['personal', 'nutrition', 'training'] as const).map((section) => (
        <section key={section} aria-labelledby={`review-${section}`}>
          <h2
            id={`review-${section}`}
            className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-coral-bright"
          >
            {sectionLabels[section]}
          </h2>
          <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {AngelaAnamnesisJourney.catalog.steps
              .filter((step) => step.section === section)
              .map((step) => (
                <div key={step.key} className="px-4 py-3">
                  <dt className="text-xs leading-relaxed text-muted">{step.prompt}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-white">
                    {formatAnswer(
                      step,
                      draft.answers[step.key as AnamnesisStepKey],
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function AnamneseJourney({
  userId,
  repository,
  onExit,
}: Readonly<{
  userId: string
  repository: AnamnesisDraftRepository | null
  onExit: () => Promise<void>
}>) {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(
    AngelaAnamnesisJourney.reducer,
    userId,
    (boundUserId) =>
      AngelaAnamnesisJourney.createState(
        AngelaAnamnesisJourney.createDraft({ userId: boundUserId }),
      ),
  )
  const saver = useMemo(
    () => (repository ? new SerializedAnamnesisDraftSaver(repository) : null),
    [repository],
  )
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready'>(
    repository ? 'loading' : 'ready',
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [deliveryState, setDeliveryState] = useState<DeliveryViewState | null>(null)
  const submitInFlight = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveGeneration = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!repository) return
    let active = true
    repository
      .load()
      .then(async (draft) => {
        if (!active) return
        if (draft) dispatch({ type: 'hydrate', draft })
        if (draft?.status === 'submitted') {
          setDeliveryState({ status: 'checking' })
          try {
            const delivery = await repository.getDeliveryStatus(
              draft.idempotencyKey,
            )
            if (!active) return
            setDeliveryState(delivery)
            if (delivery.status === 'accepted_pending' && delivery.retryable) {
              const retried = await repository.submit(draft, draft.revision)
              if (active) setDeliveryState(retried.delivery)
            }
          } catch {
            if (active) {
              setDeliveryState({
                status: 'accepted_pending',
                retryable: true,
                attempts: 0,
              })
            }
          }
        }
        if (active) setLoadStatus('ready')
      })
      .catch(() => {
        if (active) {
          setLoadError('Não foi possível carregar o rascunho seguro. Você pode responder nesta tela.')
          setSaveState('error')
          setLoadStatus('ready')
        }
      })
    return () => {
      active = false
    }
  }, [repository])

  const scheduleSave = useCallback(
    (draft: AnamnesisDraft, immediate = false): Promise<void> => {
      if (!saver) return Promise.resolve()
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }

      const generation = ++saveGeneration.current
      setSaveState('saving')
      const persist = async () => {
        saveTimer.current = null
        try {
          const saved = await saver.queue(draft)
          if (!mounted.current) return
          dispatch({ type: 'save_succeeded', draft: saved })
          if (generation === saveGeneration.current) setSaveState('saved')
        } catch {
          if (mounted.current && generation === saveGeneration.current) {
            setSaveState('error')
          }
        }
      }

      if (immediate) return persist()
      saveTimer.current = setTimeout(() => void persist(), 300)
      return Promise.resolve()
    },
    [saver],
  )

  const submit = async () => {
    if (submitInFlight.current || state.phase !== 'review') return
    if (!AngelaAnamnesisJourney.validateDraft(state.draft).valid) {
      dispatch({ type: 'review' })
      return
    }

    submitInFlight.current = true
    dispatch({ type: 'submit_requested', now: new Date().toISOString() })
    try {
      if (!repository || !saver) {
        throw new Error(
          'O envio seguro ainda não está disponível. Suas respostas continuam somente nesta tela.',
        )
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      setSaveState('saving')
      const persisted = await saver.queue(state.draft)
      if (mounted.current) {
        dispatch({ type: 'save_succeeded', draft: persisted })
        setSaveState('saved')
      }
      const submitted = await repository.submit(persisted, persisted.revision)
      setDeliveryState(submitted.delivery)
      dispatch({ type: 'submit_succeeded', draft: submitted.draft })
    } catch (error) {
      dispatch({
        type: 'submit_failed',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível enviar agora. Revise e tente novamente.',
        now: new Date().toISOString(),
      })
    } finally {
      submitInFlight.current = false
    }
  }

  const progress = AngelaAnamnesisJourney.getProgress(state.draft.answers)
  const currentStep = AngelaAnamnesisJourney.catalog.steps[state.stepIndex]
  const move = (type: 'next' | 'back') => {
    void scheduleSave(state.draft, true)
    dispatch({ type })
  }
  const leave = () => {
    void scheduleSave(state.draft, true).finally(() => {
      void onExit().catch(() => undefined)
    })
  }
  const changeAnswer = (
    key: AnamnesisStepKey,
    value: AnamnesisAnswer | undefined,
  ) => {
    const action = {
      type: 'answer_changed' as const,
      key,
      value,
      now: new Date().toISOString(),
    }
    const next = AngelaAnamnesisJourney.reducer(state, action)
    dispatch(action)
    void scheduleSave(next.draft)
  }

  const refreshDelivery = async () => {
    if (!repository || submitInFlight.current || state.draft.status !== 'submitted') {
      return
    }
    submitInFlight.current = true
    setDeliveryState({ status: 'checking' })
    try {
      const current = await repository.getDeliveryStatus(
        state.draft.idempotencyKey,
      )
      if (current.status === 'accepted_pending' && current.retryable) {
        const retried = await repository.submit(
          state.draft,
          state.draft.revision,
        )
        setDeliveryState(retried.delivery)
      } else {
        setDeliveryState(current)
      }
    } catch {
      setDeliveryState({
        status: 'accepted_pending',
        retryable: true,
        attempts: 0,
      })
    } finally {
      submitInFlight.current = false
    }
  }

  if (loadStatus === 'loading') {
    return <FullScreenLoader label="Carregando seu rascunho…" />
  }

  if (state.phase === 'submitting') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <span className="h-10 w-10 animate-spin-slow rounded-full border-4 border-coral/25 border-t-coral" />
        <h1 className="mt-5 text-display text-2xl text-white">Enviando sua anamnese</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Aguarde a confirmação antes de fechar esta página.
        </p>
      </div>
    )
  }

  if (state.phase === 'submitted') {
    const delivered = deliveryState?.status === 'delivered'
    const failed = deliveryState?.status === 'failed'
    const checking = deliveryState === null || deliveryState.status === 'checking'
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            delivered
              ? 'bg-emerald-400/15 text-emerald-300'
              : failed
                ? 'bg-red-400/15 text-red-300'
                : 'bg-amber-400/15 text-amber-200'
          }`}
        >
          <IconCheck className="h-9 w-9" />
        </span>
        <h1 className="mt-5 text-display text-3xl text-white">
          {delivered
            ? 'Anamnese entregue'
            : failed
              ? 'Entrega precisa de suporte'
              : checking
                ? 'Confirmando entrega'
                : 'Anamnese recebida'}
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          {delivered
            ? 'A entrega ao painel da equipe foi confirmada.'
            : failed
              ? 'Suas respostas continuam seguras na sua conta, mas a entrega ao painel esgotou as tentativas automáticas.'
              : checking
                ? 'Suas respostas estão seguras na sua conta enquanto verificamos o painel da equipe.'
                : 'Suas respostas estão seguras na sua conta. A entrega ao painel segue pendente e pode ser retomada.'}
        </p>
        {!delivered && !failed && (
          <Button
            variant="outline"
            className="mt-6"
            disabled={checking}
            onClick={() => void refreshDelivery()}
          >
            Verificar entrega
          </Button>
        )}
        <Button className="mt-6" onClick={() => navigate('/dieta')}>
          Ver meu plano
        </Button>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-[100dvh] px-5 pb-8 pt-8 safe-top">
        <button
          type="button"
          onClick={() => dispatch({ type: 'retry' })}
          className="flex min-h-11 items-center gap-2 text-sm text-muted hover:text-white"
        >
          <IconArrowLeft className="h-5 w-5" />
          Voltar
        </button>
        <div className="mt-12 rounded-3xl border border-red-400/25 bg-red-400/10 p-6 text-center">
          <h1 className="text-display text-2xl text-white">
            {state.error?.kind === 'hydration'
              ? 'Rascunho não carregado'
              : 'Envio não concluído'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-red-100">
            {state.error?.message}
          </p>
          <Button
            variant="outline"
            full
            className="mt-6"
            onClick={() => dispatch({ type: 'retry' })}
          >
            {state.error?.kind === 'submit'
              ? 'Revisar e tentar novamente'
              : 'Continuar com um rascunho novo'}
          </Button>
        </div>
      </div>
    )
  }

  if (state.phase === 'review') {
    return (
      <div className="min-h-[100dvh] px-5 pb-8 safe-top">
        <header className="mb-5 flex items-center gap-3">
          <button
            type="button"
            aria-label="Voltar às perguntas"
            onClick={() => move('back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-white"
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral-bright">
              Revisão
            </p>
            <h1 className="text-display text-2xl text-white">Confira suas respostas</h1>
          </div>
        </header>

        <PersistenceNotice connected={Boolean(repository)} saveState={saveState} />
        {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
        <div className="mt-5">
          <ReviewCard draft={state.draft} />
        </div>
        <div className="mt-6 grid gap-3">
          <Button full onClick={() => void submit()}>
            Enviar anamnese
          </Button>
          <Button variant="ghost" full onClick={() => move('back')}>
            Voltar às perguntas
          </Button>
        </div>
      </div>
    )
  }

  if (!currentStep) return <FullScreenLoader label="Abrindo anamnese…" />

  const currentAnswer = state.draft.answers[currentStep.key as AnamnesisStepKey]
  const currentIssue = state.issues.find((entry) => entry.key === currentStep.key)

  return (
    <div className="min-h-[100dvh] px-5 pb-8 safe-top">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={state.stepIndex === 0 ? 'Sair da conta' : 'Voltar uma etapa'}
          onClick={() => (state.stepIndex === 0 ? leave() : move('back'))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-white"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral-bright">
            Anamnese Angela
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Etapa {state.stepIndex + 1} de {progress.total}
          </p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-coral/10 text-coral-bright">
          <IconFileText className="h-5 w-5" />
        </span>
      </header>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-coral-deep to-coral-bright transition-[width] duration-300"
          style={{ width: `${progress.percentage}%` }}
          aria-label={`${progress.percentage}% concluído`}
        />
      </div>
      <p className="mt-1 text-right text-[11px] text-muted-2">
        {progress.completed} de {progress.total} respostas válidas
      </p>

      <div className="mt-4">
        <SectionRail activeSection={currentStep.section} />
      </div>
      <div className="mt-4">
        <PersistenceNotice connected={Boolean(repository)} saveState={saveState} />
        {loadError && <p className="mt-2 text-xs text-red-300">{loadError}</p>}
      </div>

      <section className="mt-7 animate-fade-up" aria-labelledby="anamnesis-question">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {sectionLabels[currentStep.section]}
        </p>
        <h1
          id="anamnesis-question"
          className="mt-2 text-display text-3xl leading-tight text-white"
        >
          {currentStep.prompt}
        </h1>
        {currentStep.helper && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{currentStep.helper}</p>
        )}

        <div className="mt-6">
          <QuestionInput
            step={currentStep}
            answer={currentAnswer}
            issue={currentIssue?.message}
            onChange={(value) =>
              changeAnswer(currentStep.key as AnamnesisStepKey, value)
            }
          />
        </div>
      </section>

      <div className="mt-8 grid grid-cols-[auto_1fr] gap-3">
        <Button
          variant="ghost"
          onClick={() => move('back')}
          disabled={state.stepIndex === 0}
        >
          Anterior
        </Button>
        <Button full onClick={() => move('next')}>
          {state.stepIndex === progress.total - 1 ? 'Revisar respostas' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}

export function Anamnese({ repository: repositoryOverride }: AnamneseProps) {
  const { session, signOut } = useAuth()
  const userId = session?.user.id ?? null
  const repository = useMemo(() => {
    if (repositoryOverride !== undefined) return repositoryOverride
    return userId ? new SupabaseAnamnesisDraftRepository(userId, supabase) : null
  }, [repositoryOverride, userId])

  if (!userId) return <FullScreenLoader label="Confirmando sua conta…" />
  return (
    <AnamneseJourney
      key={userId}
      userId={userId}
      repository={repository}
      onExit={signOut}
    />
  )
}
