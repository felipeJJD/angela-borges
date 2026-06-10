const TZ = 'America/Sao_Paulo'

/** Today's date as YYYY-MM-DD in America/Sao_Paulo. */
export function todayISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

/** A "local" Date anchored to SP wall-clock, safe for day arithmetic. */
function spDate(): Date {
  const iso = todayISO()
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export type WeekDay = {
  iso: string // YYYY-MM-DD
  label: string // Seg, Ter...
  dayNum: number // 1..31
  isToday: boolean
}

const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Current week Monday→Sunday in SP. */
export function currentWeek(): WeekDay[] {
  const base = spDate()
  const today = todayISO()
  const dow = base.getDay() // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(base)
  monday.setDate(base.getDate() + mondayOffset)

  const days: WeekDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toISO(d)
    days.push({
      iso,
      label: SHORT[d.getDay()],
      dayNum: d.getDate(),
      isToday: iso === today,
    })
  }
  return days
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Relative description in PT-BR for a YYYY-MM-DD date (or null). */
export function relativeDay(iso: string | null): string {
  if (!iso) return 'nunca'
  const today = todayISO()
  if (iso === today) return 'hoje'

  const [ty, tm, td] = today.split('-').map(Number)
  const [y, m, d] = iso.split('-').map(Number)
  const a = new Date(ty, tm - 1, td).getTime()
  const b = new Date(y, m - 1, d).getTime()
  const diff = Math.round((a - b) / 86_400_000)

  if (diff === 1) return 'ontem'
  if (diff > 1 && diff < 7) return `há ${diff} dias`
  if (diff >= 7 && diff < 30) {
    const w = Math.floor(diff / 7)
    return w === 1 ? 'há 1 semana' : `há ${w} semanas`
  }
  if (diff >= 30) {
    const mo = Math.floor(diff / 30)
    return mo === 1 ? 'há 1 mês' : `há ${mo} meses`
  }
  // future date — shouldn't happen, fall back
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

export function firstName(full: string | null | undefined): string {
  if (!full) return 'aluna'
  return full.trim().split(/\s+/)[0]
}
