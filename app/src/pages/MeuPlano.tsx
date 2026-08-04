import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../components/Button'
import type {
  AngelaPersonalizedPlanState,
  AngelaPublishedPlan,
} from '../features/personalized-plan/AngelaPersonalizedPlan'
import { safeAngelaExerciseVideoUrl } from '../features/personalized-plan/AngelaPersonalizedPlan'

export type MeuPlanoViewProps = Readonly<{
  state: AngelaPersonalizedPlanState
  online: boolean
  reloading: boolean
  onReload(): void
}>

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

function number(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)
    : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : []
}

function countLabel(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function OfflineNotice(
  props: Readonly<{ online: boolean; hasPublishedVersion?: boolean }>,
) {
  const { online, hasPublishedVersion = false } = props
  if (online) return null
  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-relaxed text-amber-100"
    >
      {hasPublishedVersion
        ? 'Você está offline. Esta versão foi carregada nesta sessão; não podemos confirmar atualizações até a conexão voltar.'
        : 'Você está offline. Não podemos confirmar o status do seu plano até a conexão voltar.'}
    </div>
  )
}

function StateShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="space-y-5 px-4 pt-6 safe-top">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-coral-bright">
          Protocolo personalizado
        </p>
        <h1 className="mt-1 text-display text-3xl text-white">Meu Plano</h1>
      </header>
      {children}
    </div>
  )
}

function EmptyState({ online }: Readonly<{ online: boolean }>) {
  return (
    <StateShell>
      <OfflineNotice online={online} />
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-display text-2xl text-white">
          Seu plano começa pela anamnese
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Conte sua rotina, objetivos e restrições. O plano só aparece aqui
          depois que dieta e treino forem publicados juntos.
        </p>
        <Link
          to="/anamnese"
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-coral-bright to-coral-deep px-5 font-semibold text-white glow-coral-sm"
        >
          Responder anamnese
        </Link>
      </section>
    </StateShell>
  )
}

function BuildingState(
  props: Readonly<{
    online: boolean
    submittedAt: string
    deliveryStatus: 'accepted_pending' | 'delivered'
    reloading: boolean
    onReload(): void
  }>,
) {
  return (
    <StateShell>
      <OfflineNotice online={props.online} />
      <section className="rounded-2xl border border-coral/25 bg-coral/10 p-5">
        <div className="mb-5 flex gap-2" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="h-2.5 w-2.5 rounded-full bg-coral-bright animate-pulse"
            />
          ))}
        </div>
        <h2 className="text-display text-2xl text-white">
          Estamos montando seu plano
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Dieta e treino serão publicados juntos, na mesma versão. Enquanto a
          revisão não termina, nenhum conteúdo parcial é exibido.
        </p>
        <p className="mt-4 text-xs text-muted-2">
          Anamnese recebida em {formatPublishedAt(props.submittedAt)} ·{' '}
          {props.deliveryStatus === 'delivered'
            ? 'entrega confirmada'
            : 'entrega em processamento'}
        </p>
        <Button
          variant="outline"
          className="mt-5"
          full
          disabled={!props.online}
          loading={props.reloading}
          onClick={props.onReload}
        >
          Atualizar status
        </Button>
      </section>
    </StateShell>
  )
}

function FailedState(
  props: Readonly<{
    online: boolean
    reason:
      | 'delivery-failed'
      | 'pipeline-failed'
      | 'invalid-published-plan'
      | 'unavailable'
    retryable: boolean
    reloading: boolean
    onReload(): void
  }>,
) {
  const deliveryFailed = props.reason === 'delivery-failed'
  const pipelineFailed = props.reason === 'pipeline-failed'
  return (
    <StateShell>
      <OfflineNotice online={props.online} />
      <section className="rounded-2xl border border-red-400/25 bg-red-400/10 p-5">
        <h2 className="text-display text-2xl text-white">
          {pipelineFailed
            ? 'Seu plano precisa de revisão'
            : 'Não conseguimos confirmar seu plano'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {pipelineFailed
            ? 'Nossa equipe precisa revisar o processamento antes de publicar dieta e treino.'
            : deliveryFailed
            ? 'A entrega da anamnese precisa ser revisada antes da publicação.'
            : 'Nenhum plano foi simulado. Vamos consultar novamente a versão publicada.'}
        </p>
        {props.retryable && (
          <Button
            className="mt-5"
            full
            loading={props.reloading}
            onClick={props.onReload}
          >
            Tentar novamente
          </Button>
        )}
        {deliveryFailed && (
          <Link
            to="/anamnese"
            className="mt-4 block text-center text-sm font-semibold text-coral-bright"
          >
            Revisar anamnese
          </Link>
        )}
      </section>
    </StateShell>
  )
}

function PlanSummary({ plan }: Readonly<{ plan: AngelaPublishedPlan }>) {
  const cards = [
    countLabel(plan.counts.dietMeals, 'refeição', 'refeições'),
    countLabel(plan.counts.trainingDays, 'dia', 'dias'),
    countLabel(plan.counts.trainingExercises, 'exercício', 'exercícios'),
  ]
  return (
    <>
      <section className="rounded-2xl border border-coral/25 bg-gradient-to-br from-coral/20 to-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-coral-bright">
              Plano publicado
            </p>
            <h2 className="mt-1 text-display text-2xl text-white">
              Versão {plan.protocolVersion}
            </h2>
          </div>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            Ativo
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-2">
          Publicado em {formatPublishedAt(plan.activatedAt)}
        </p>
      </section>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((label) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-surface px-2 py-4 text-center text-xs font-semibold text-white"
          >
            {label}
          </div>
        ))}
      </div>
    </>
  )
}

function DietSection({ plan }: Readonly<{ plan: AngelaPublishedPlan }>) {
  return (
    <section className="space-y-3" aria-labelledby="diet-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-coral-bright">
          Nutrição
        </p>
        <h2 id="diet-title" className="text-display text-2xl text-white">
          Dieta
        </h2>
      </div>
      {typeof plan.diet.notes === 'string' && plan.diet.notes.trim() !== '' && (
        <p className="rounded-2xl border border-border bg-surface/60 p-4 text-sm leading-relaxed text-muted">
          {plan.diet.notes}
        </p>
      )}
      {plan.diet.meals.map((meal, mealIndex) => (
        <article
          key={`${text(meal.name, 'Refeição')}-${mealIndex}`}
          className="rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-display text-lg text-white">
              {text(meal.name, `Refeição ${mealIndex + 1}`)}
            </h3>
            {typeof meal.time === 'string' && (
              <span className="text-xs text-muted">{meal.time}</span>
            )}
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {meal.foods.map((food, foodIndex) => {
              const quantity = number(food.quantity)
              const unit = typeof food.unit === 'string' ? food.unit : ''
              const substitutions = stringList(food.substitutions)
              return (
                <li
                  key={`${text(food.name, 'Alimento')}-${foodIndex}`}
                  className="py-2.5 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white">
                      {text(food.name, `Alimento ${foodIndex + 1}`)}
                    </span>
                    {quantity !== null && (
                      <span className="shrink-0 text-muted">
                        {quantity} {unit}
                      </span>
                    )}
                  </div>
                  {substitutions.length > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-2">
                      Substituições: {substitutions.join(', ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </article>
      ))}
    </section>
  )
}

function TrainingSection({ plan }: Readonly<{ plan: AngelaPublishedPlan }>) {
  return (
    <section className="space-y-3" aria-labelledby="training-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-coral-bright">
          Movimento
        </p>
        <h2 id="training-title" className="text-display text-2xl text-white">
          Treino
        </h2>
      </div>
      {typeof plan.training.notes === 'string' &&
        plan.training.notes.trim() !== '' && (
          <p className="rounded-2xl border border-border bg-surface/60 p-4 text-sm leading-relaxed text-muted">
            {plan.training.notes}
          </p>
        )}
      {plan.training.days.map((day, dayIndex) => (
        <article
          key={`${text(day.name, 'Treino')}-${dayIndex}`}
          className="rounded-2xl border border-border bg-surface p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            {text(day.day_label, `Dia ${dayIndex + 1}`)}
          </p>
          <h3 className="mt-1 text-display text-lg text-white">
            {text(day.name, `Treino ${dayIndex + 1}`)}
          </h3>
          {((typeof day.warmup === 'string' && day.warmup.trim() !== '') ||
            (typeof day.cooldown === 'string' && day.cooldown.trim() !== '')) && (
            <div className="mt-3 space-y-1 rounded-xl border border-border/70 bg-surface-2/50 p-3 text-xs leading-relaxed text-muted">
              {typeof day.warmup === 'string' && day.warmup.trim() !== '' && (
                <p>
                  <span className="font-semibold text-white">Aquecimento:</span>{' '}
                  {day.warmup}
                </p>
              )}
              {typeof day.cooldown === 'string' && day.cooldown.trim() !== '' && (
                <p>
                  <span className="font-semibold text-white">Desaquecimento:</span>{' '}
                  {day.cooldown}
                </p>
              )}
            </div>
          )}
          <ol className="mt-3 divide-y divide-border/70">
            {day.exercises.map((exercise, exerciseIndex) => {
              const substitutions = stringList(exercise.substitutions)
              const videoUrl = safeAngelaExerciseVideoUrl(exercise.video_url)
              return (
                <li
                  key={`${text(exercise.name, 'Exercício')}-${exerciseIndex}`}
                  className="py-3"
                >
                  <p className="text-sm font-medium text-white">
                    {text(exercise.name, `Exercício ${exerciseIndex + 1}`)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {typeof exercise.sets === 'number'
                      ? `${exercise.sets} séries`
                      : 'Séries conforme orientação'}
                    {typeof exercise.reps === 'string' ? ` · ${exercise.reps}` : ''}
                  </p>
                  {typeof exercise.rest_seconds === 'number' &&
                    Number.isFinite(exercise.rest_seconds) && (
                      <p className="mt-1 text-xs text-muted">
                        Descanso: {exercise.rest_seconds}{' '}
                        {exercise.rest_seconds === 1 ? 'segundo' : 'segundos'}
                      </p>
                    )}
                  {typeof exercise.notes === 'string' &&
                    exercise.notes.trim() !== '' && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-2">
                        {exercise.notes}
                      </p>
                    )}
                  {substitutions.length > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-2">
                      Substituições: {substitutions.join(', ')}
                    </p>
                  )}
                  {videoUrl !== null && (
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-coral/40 bg-coral/10 px-3 text-xs font-semibold text-coral-bright"
                    >
                      Assistir vídeo
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
        </article>
      ))}
    </section>
  )
}

function Metadata({ plan }: Readonly<{ plan: AngelaPublishedPlan }>) {
  return (
    <details className="rounded-2xl border border-border bg-surface/60 p-4 text-xs text-muted">
      <summary className="cursor-pointer font-semibold text-white">
        Informações da versão
      </summary>
      <dl className="mt-3 grid gap-2 break-all">
        <div>
          <dt>Protocolo</dt>
          <dd className="text-muted-2">{plan.protocolId}</dd>
        </div>
        <div>
          <dt>Catálogo</dt>
          <dd className="text-muted-2">{plan.generationMetadata.catalogVersion}</dd>
        </div>
        <div>
          <dt>Motor</dt>
          <dd className="text-muted-2">{plan.generationMetadata.engineVersion}</dd>
        </div>
        <div>
          <dt>Esquema</dt>
          <dd className="text-muted-2">{plan.schemaVersion}</dd>
        </div>
      </dl>
    </details>
  )
}

function PublishedState(
  props: Readonly<{ plan: AngelaPublishedPlan; online: boolean }>,
) {
  return (
    <StateShell>
      <OfflineNotice online={props.online} hasPublishedVersion />
      <PlanSummary plan={props.plan} />
      <DietSection plan={props.plan} />
      <TrainingSection plan={props.plan} />
      <Metadata plan={props.plan} />
    </StateShell>
  )
}

export function MeuPlanoView({
  state,
  online,
  reloading,
  onReload,
}: MeuPlanoViewProps) {
  if (state.kind === 'empty') return <EmptyState online={online} />
  if (state.kind === 'building') {
    return (
      <BuildingState
        online={online}
        submittedAt={state.submittedAt}
        deliveryStatus={state.deliveryStatus}
        reloading={reloading}
        onReload={onReload}
      />
    )
  }
  if (state.kind === 'failed') {
    return (
      <FailedState
        online={online}
        reason={state.reason}
        retryable={state.retryable}
        reloading={reloading}
        onReload={onReload}
      />
    )
  }
  return <PublishedState plan={state.plan} online={online} />
}
