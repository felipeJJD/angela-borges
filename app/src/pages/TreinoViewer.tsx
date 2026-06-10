import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Workout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { Confetti } from '../components/Confetti'
import { IconArrowLeft, IconCheck } from '../components/icons'

// PDF.js worker (Vite resolves the URL at build time)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type RpcResult = { advanced: boolean; done: number; total: number }

export function TreinoViewer() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const toast = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [width, setWidth] = useState(0)

  const [finishing, setFinishing] = useState(false)
  const [celebration, setCelebration] = useState<{ team: number } | null>(null)
  const [doneState, setDoneState] = useState(false)

  // Measure container width for full-bleed pages
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

  // Load workout meta + signed URL + completion status
  useEffect(() => {
    if (!id || !userId) return
    let active = true
    ;(async () => {
      setMetaError(null)
      const [wRes, cRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, team, title, pdf_path, sort_order')
          .eq('id', id)
          .single(),
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
      const w = wRes.data as Workout
      setWorkout(w)
      setAlreadyDone(!!cRes.data)
      setDoneState(!!cRes.data)

      const { data: urlData, error: urlErr } = await supabase.storage
        .from('treinos')
        .createSignedUrl(w.pdf_path, 21600)

      if (!active) return
      if (urlErr || !urlData) {
        setMetaError('Não foi possível abrir o PDF.')
        return
      }
      setSignedUrl(urlData.signedUrl)
    })()
    return () => {
      active = false
    }
  }, [id, userId])

  const pageWidth = useMemo(() => (width > 0 ? width : undefined), [width])

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
    if (res?.advanced) {
      // current_team was bumped — fetch new team for the message
      setCelebration({ team: Math.min((workout?.team ?? 1) + 1, 3) })
    } else {
      toast.show(`Ficha concluída! ${res?.done ?? 0}/${res?.total ?? 0} 🎉`, 'success')
    }
  }

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
      <ViewerHeader title={workout?.title ?? 'Carregando…'} onBack={() => navigate(-1)} />

      <div ref={containerRef} className="flex-1 pb-32">
        {!signedUrl ? (
          <PdfSkeleton />
        ) : pdfError ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="text-muted">Falha ao carregar o PDF.</p>
            <Button variant="outline" onClick={() => navigate('/')}>
              Voltar
            </Button>
          </div>
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

      {/* Sticky footer CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-ink/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
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

function ViewerHeader({ title, onBack }: { title: string; onBack: () => void }) {
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
          Você subiu para o<br />
          <span className="text-gradient-coral">Team {team}!</span>
        </h2>
        <p className="mt-3 max-w-xs text-white/70">
          Você concluiu todas as fichas do seu nível. Novos treinos liberados. 🔥
        </p>
        <Button size="lg" className="mt-8" onClick={onClose}>
          Bora pro próximo nível
        </Button>
      </div>
    </div>
  )
}
