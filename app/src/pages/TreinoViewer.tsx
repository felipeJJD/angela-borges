import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Workout } from '../lib/supabase'
import type { PlanDay, PlanHeader, WorkoutPlan } from '../lib/plan'
import { shortDayLabel, splitUrls } from '../lib/plan'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { Confetti } from '../components/Confetti'
import { ExerciseCard } from '../components/ExerciseCard'
import { InlinePlayer, type VideoOption } from '../components/InlinePlayer'
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconExternal,
  IconFileText,
  IconFlame,
  IconPlay,
} from '../components/icons'

// PDF.js worker (Vite resolves the URL at build time)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type RpcResult = { advanced: boolean; team_completed: boolean; done: number; total: number }

export function TreinoViewer() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const toast = useToast()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [mode, setMode] = useState<'plan' | 'pdf' | null>(null)
  const [dayIdx, setDayIdx] = useState(0)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [finishing, setFinishing] = useState(false)
  const [celebration, setCelebration] = useState<{ team: number } | null>(null)
  const [doneState, setDoneState] = useState(false)

  // Load workout meta + plan + completion status
  useEffect(() => {
    if (!id || !userId) return
    let active = true
    ;(async () => {
      setMetaError(null)
      const [wRes, pRes, cRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, team, title, pdf_path, sort_order')
          .eq('id', id)
          .single(),
        supabase
          .from('workout_plans')
          .select('plan')
          .eq('workout_id', id)
          .maybeSingle(),
        supabase
          .from('workout_completions')
          .select('workout_id')
          .eq('user_id', userId)
          .eq('workout_id', id)
          .maybeSingle(),
      ])

      if (!active) return
      if (wRes.error || !wRes.data) {
        setMetaError('Ficha não encontrada.')
        return
      }
      setWorkout(wRes.data as Workout)
      setAlreadyDone(!!cRes.data)
      setDoneState(!!cRes.data)

      const loadedPlan =
        (pRes.data?.plan as WorkoutPlan | undefined) ?? null
      const valid = loadedPlan && Array.isArray(loadedPlan.days) &&
        loadedPlan.days.length > 0
      setPlan(valid ? loadedPlan : null)
      setMode(valid ? 'plan' : 'pdf')
    })()
    return () => {
      active = false
    }
  }, [id, userId])

  const finish = async () => {
    if (!id) return
    setFinishing(true)
    const { data, error } = await supabase.rpc('complete_workout', {
      p_workout_id: id,
    })
    setFinishing(false)
    if (error) {
      toast.show('Não foi possível concluir. Tente de novo.', 'error')
      return
    }
    const res = (Array.isArray(data) ? data[0] : data) as RpcResult
    setDoneState(true)
    if (res?.team_completed) {
      // todas as fichas do team concluídas — admin libera o próximo nível
      setCelebration({ team: workout?.team ?? 1 })
    } else {
      toast.show(`Ficha concluída! ${res?.done ?? 0}/${res?.total ?? 0} 🎉`, 'success')
    }
  }

  // último dia de treino da semana — o botão de concluir só aparece dele em diante
  const lastTreinoIdx = useMemo(() => {
    if (!plan) return -1
    let last = -1
    plan.days.forEach((d, i) => {
      if (d.kind === 'treino') last = i
    })
    return last
  }, [plan])
  const showFooter =
    mode === 'pdf' || !plan || lastTreinoIdx < 0 || dayIdx >= lastTreinoIdx

  // ── Error / loading meta states ──
  if (metaError) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <ViewerHeader title="Ficha" onBack={() => navigate(-1)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-muted">{metaError}</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink">
      <ViewerHeader
        title={workout?.title ?? 'Carregando…'}
        onBack={() => navigate(-1)}
        action={
          plan
            ? {
                label: mode === 'plan' ? 'PDF' : 'Ficha',
                icon: mode === 'plan' ? IconFileText : IconPlay,
                onClick: () => setMode(mode === 'plan' ? 'pdf' : 'plan'),
              }
            : undefined
        }
      />

      <div className="flex-1 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {mode === null ? (
          <PlanSkeleton />
        ) : mode === 'plan' && plan ? (
          <PlanView plan={plan} dayIdx={dayIdx} onDayChange={setDayIdx} />
        ) : workout ? (
          <PdfView pdfPath={workout.pdf_path} onBackHome={() => navigate('/')} />
        ) : (
          <PlanSkeleton />
        )}

        {/* CTA de conclusão no fim do conteúdo — na ficha nativa, só a partir do
            último dia de treino da semana (ex.: sexta); no PDF/fallback, sempre */}
        {showFooter && (
          <div className="mx-auto max-w-md px-4 pt-6">
            {doneState ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-coral/40 bg-coral/10 py-3.5 text-coral-bright">
                <IconCheck className="h-5 w-5" />
                <span className="font-semibold">
                  {alreadyDone ? 'Ficha já concluída' : 'Ficha concluída'}
                </span>
              </div>
            ) : (
              <Button size="lg" full loading={finishing} onClick={() => void finish()}>
                Concluir esta ficha
                <IconCheck className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {celebration && (
        <Celebration
          team={celebration.team}
          onClose={() => {
            setCelebration(null)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}

// ── Plan (ficha nativa) ──

function PlanView({
  plan,
  dayIdx,
  onDayChange,
}: {
  plan: WorkoutPlan
  dayIdx: number
  onDayChange: (i: number) => void
}) {
  // só 1 player montado por vez (card = chave do bloco dono do vídeo tocando)
  const [playing, setPlaying] = useState<{ card: string; url: string } | null>(null)
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)]
  const hasHeaderInfo = Object.values(plan.header ?? {}).some(Boolean)

  const playingIn = (card: string) =>
    playing?.card === card ? playing.url : null
  const playIn = (card: string) => (url: string) => setPlaying({ card, url })

  return (
    <div>
      {/* chips de dias */}
      {/* offset = altura do ViewerHeader (botão 40px + pb 12px + borda 1px + safe-top) */}
      <div className="sticky top-[calc(max(1rem,env(safe-area-inset-top))+53px)] z-30 border-b border-border bg-ink/95 backdrop-blur-xl">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-2.5">
          {plan.days.map((d, i) => {
            const active = i === dayIdx
            return (
              <button
                key={d.weekday + i}
                onClick={() => {
                  onDayChange(i)
                  setPlaying(null)
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition active:scale-95 ${
                  active
                    ? 'bg-coral text-white'
                    : d.kind === 'descanso'
                      ? 'bg-white/5 text-muted-2'
                      : 'bg-white/10 text-white/80'
                }`}
              >
                {shortDayLabel(d.weekday)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {hasHeaderInfo && <HeaderInfo header={plan.header} />}

        <div className="animate-fade-up">
          <h2 className="text-display text-2xl text-white">{day.weekday}</h2>
          {day.focus && (
            <p className="mt-0.5 text-sm font-medium text-coral-bright">
              {day.focus}
            </p>
          )}
        </div>

        {day.kind === 'descanso' ? (
          <RestDayCard
            day={day}
            playingUrl={playingIn('rest')}
            onPlay={playIn('rest')}
          />
        ) : (
          <div className="space-y-2.5">
            {day.warmup_video_url && (
              <div className="animate-fade-up rounded-2xl border border-border bg-surface/60 p-3">
                <InlinePlayer
                  videos={[{ label: 'Aquecimento', url: day.warmup_video_url }]}
                  title="Aquecimento"
                  playingUrl={playingIn('warmup')}
                  onPlay={playIn('warmup')}
                />
                <p className="mt-2.5 px-1 pb-1 text-sm font-medium text-white">
                  Aquecimento
                  {plan.header.aquecimento ? (
                    <span className="text-muted"> — {plan.header.aquecimento}</span>
                  ) : null}
                </p>
              </div>
            )}
            {(day.exercises ?? []).map((ex, i) => (
              <ExerciseCard
                key={`${dayIdx}-${i}`}
                exercise={ex}
                index={i}
                playingUrl={playingIn(`ex-${dayIdx}-${i}`)}
                onPlay={playIn(`ex-${dayIdx}-${i}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const HEADER_LABELS: [keyof PlanHeader, string][] = [
  ['objetivo_geral', 'Objetivo geral'],
  ['objetivo_especifico', 'Objetivo específico'],
  ['intervalos', 'Intervalo entre séries'],
  ['velocidade', 'Velocidade'],
  ['pausa', 'Pausa entre exercícios'],
  ['metodo', 'Método'],
  ['aquecimento', 'Aquecimento'],
]

function HeaderInfo({ header }: { header: PlanHeader }) {
  const [open, setOpen] = useState(false)
  const fields = HEADER_LABELS.filter(([k]) => header[k])
  if (fields.length === 0 && !header.intro) return null
  return (
    <div className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-surface/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-semibold text-white">
          Informações do treino
        </span>
        <IconChevronDown
          className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border px-4 py-3">
          {fields.map(([k, label]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                {label}
              </p>
              <p className="text-[13px] leading-relaxed text-white/85">
                {header[k]}
              </p>
            </div>
          ))}
          {header.intro && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Leia antes de começar
              </p>
              <LinkifiedText
                text={header.intro}
                className="whitespace-pre-line text-[13px] leading-relaxed text-white/85"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RestDayCard({
  day,
  playingUrl,
  onPlay,
}: {
  day: PlanDay
  playingUrl: string | null
  onPlay: (url: string) => void
}) {
  const videos: VideoOption[] = [
    ...(day.warmup_video_url
      ? [{ label: 'Aquecimento', url: day.warmup_video_url }]
      : []),
    ...(day.aerobio_video_url
      ? [{ label: 'Aeróbio', url: day.aerobio_video_url }]
      : []),
    ...(day.video_urls ?? []).map((url, i) => ({
      label: `Vídeo ${i + 1}`,
      url,
    })),
  ]
  return (
    <div className="animate-fade-up rounded-2xl border border-border bg-surface p-4">
      {videos.length > 0 && (
        <div className="mb-4">
          <InlinePlayer
            videos={videos}
            title="Dia de recuperação"
            playingUrl={playingUrl}
            onPlay={onPlay}
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-coral/15 text-coral-bright">
          <IconFlame className="h-5 w-5" />
        </span>
        <p className="text-display text-lg text-white">Dia de recuperação</p>
      </div>
      {day.rest_text && (
        <LinkifiedText
          text={day.rest_text}
          className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted"
        />
      )}
      {(day.survey_url ?? day.signup_url) && (
        <a
          href={day.survey_url ?? day.signup_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm font-semibold text-coral-bright active:scale-[0.99]"
        >
          <IconExternal className="h-4 w-4" />
          Abrir link
        </a>
      )}
    </div>
  )
}

function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitUrls(text), [text])
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.url ? (
          <a
            key={i}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-coral-bright underline"
          >
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  )
}

function PlanSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-8 w-14 rounded-full" />
        ))}
      </div>
      <div className="skeleton h-8 w-48 rounded" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-28 rounded-2xl" />
      ))}
    </div>
  )
}

// ── PDF (visualização original) ──

function PdfView({
  pdfPath,
  onBackHome,
}: {
  pdfPath: string
  onBackHome: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.storage
        .from('treinos')
        .createSignedUrl(pdfPath, 21600)
      if (!active) return
      if (error || !data) {
        setPdfError(true)
        return
      }
      setSignedUrl(data.signedUrl)
    })()
    return () => {
      active = false
    }
  }, [pdfPath])

  const pageWidth = useMemo(() => (width > 0 ? width : undefined), [width])

  return (
    <div ref={containerRef}>
      {pdfError ? (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <p className="text-muted">Falha ao carregar o PDF.</p>
          <Button variant="outline" onClick={onBackHome}>
            Voltar
          </Button>
        </div>
      ) : !signedUrl ? (
        <PdfSkeleton />
      ) : (
        <Document
          file={signedUrl}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setPdfError(true)}
          externalLinkTarget="_blank"
          loading={<PdfSkeleton />}
          error={
            <div className="px-6 py-20 text-center text-muted">
              Não foi possível exibir este PDF.
            </div>
          }
          className="flex flex-col items-center"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              className="pdf-page-wrap w-full border-b border-border/40 bg-white"
            >
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderAnnotationLayer
                renderTextLayer
                loading={
                  <div className="flex h-[60vh] items-center justify-center bg-surface">
                    <Spinner />
                  </div>
                }
              />
            </div>
          ))}
        </Document>
      )}
    </div>
  )
}

function ViewerHeader({
  title,
  onBack,
  action,
}: {
  title: string
  onBack: () => void
  action?: {
    label: string
    icon: (p: { className?: string }) => React.ReactElement
    onClick: () => void
  }
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-ink/95 px-3 py-3 backdrop-blur-xl safe-top">
      <button
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white active:scale-95"
        aria-label="Voltar"
      >
        <IconArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-display text-lg text-white">
        {title}
      </h1>
      {action && (
        <button
          onClick={action.onClick}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/85 active:scale-95"
        >
          <action.icon className="h-3.5 w-3.5" />
          {action.label}
        </button>
      )}
    </header>
  )
}

function PdfSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <div className="skeleton aspect-[1/1.414] w-full rounded-xl" />
      <div className="skeleton aspect-[1/1.414] w-full rounded-xl" />
    </div>
  )
}

function Celebration({ team, onClose }: { team: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-ink/95 px-6 text-center backdrop-blur-md">
      <Confetti />
      <div className="animate-pop-in relative z-10 flex flex-col items-center">
        <span className="text-7xl">🎉</span>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-coral-bright">
          Parabéns!
        </p>
        <h2 className="mt-2 text-display text-4xl leading-tight text-white">
          Você concluiu todas as fichas do<br />
          <span className="text-gradient-coral">Team {team}!</span>
        </h2>
        <p className="mt-3 max-w-xs text-white/70">
          {team >= 3
            ? 'Incrível! 🔥 Você completou o nível mais avançado da Comunidade.'
            : 'Incrível! 🔥 A Angela vai avaliar sua evolução e liberar o seu próximo nível em breve.'}
        </p>
        <Button size="lg" className="mt-8" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </div>
  )
}
