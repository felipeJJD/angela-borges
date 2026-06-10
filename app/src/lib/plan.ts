// Tipos do plano estruturado (workout_plans.plan) extraído dos PDFs.
export type PlanHeader = {
  intervalos?: string
  velocidade?: string
  pausa?: string
  metodo?: string
  aquecimento?: string
  objetivo_geral?: string
  objetivo_especifico?: string
  intro?: string
}

export type PlanExercise = {
  name: string
  sets: number | null
  reps: string
  rest?: string
  notes?: string
  video_urls: string[]
  reps_video_url?: string
  notes_video_url?: string
  notes_video_urls?: string[]
}

export type PlanDay = {
  weekday: string
  kind: 'treino' | 'descanso'
  focus?: string
  exercises?: PlanExercise[]
  rest_text?: string
  warmup_video_url?: string
  aerobio_video_url?: string
  video_urls?: string[]
  survey_url?: string
  signup_url?: string
}

export type WorkoutPlan = {
  version: number
  header: PlanHeader
  days: PlanDay[]
}

export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/,
  )
  return m ? m[1] : null
}

export function embedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`
}

export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** Rótulo curto do dia para os chips (SEG, TER, ... ou A, B, ...). */
export function shortDayLabel(weekday: string): string {
  const w = weekday.toUpperCase()
  if (w.startsWith('SEGUNDA')) return 'SEG'
  if (w.startsWith('TERÇA') || w.startsWith('TERCA')) return 'TER'
  if (w.startsWith('QUARTA')) return 'QUA'
  if (w.startsWith('QUINTA')) return 'QUI'
  if (w.startsWith('SEXTA')) return 'SEX'
  if (w.startsWith('SÁBADO E') || w.startsWith('SABADO E')) return 'FDS'
  if (w.startsWith('SÁBADO') || w.startsWith('SABADO')) return 'SÁB'
  if (w.startsWith('DOMINGO')) return 'DOM'
  if (w.startsWith('FINAL DE SEMANA')) return 'FDS'
  const t = w.match(/TREINO\s+([A-Z])/)
  if (t) return t[1]
  return w.slice(0, 3)
}

/** Divide texto em segmentos de texto/URL para linkificar rest_text e intro. */
export function splitUrls(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = []
  const re = /https?:\/\/\S+/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    const url = m[0].replace(/[).,]+$/, '')
    out.push({ text: url, url })
    last = m.index! + m[0].length - (m[0].length - url.length)
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
