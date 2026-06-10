import { currentWeek } from '../lib/dates'
import { IconCheck } from './icons'

export function WeekStrip({ checkinDates }: { checkinDates: Set<string> }) {
  const week = currentWeek()

  return (
    <div className="flex justify-between gap-1.5">
      {week.map((d) => {
        const done = checkinDates.has(d.iso)
        return (
          <div
            key={d.iso}
            className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border py-2.5 transition-colors ${
              d.isToday
                ? 'border-coral/60 bg-coral/10'
                : 'border-border bg-surface/50'
            }`}
          >
            <span
              className={`text-[10px] font-semibold uppercase ${
                d.isToday ? 'text-coral-bright' : 'text-muted-2'
              }`}
            >
              {d.label}
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? 'bg-coral text-white'
                  : d.isToday
                    ? 'bg-coral/15 text-coral-bright'
                    : 'bg-white/5 text-muted'
              }`}
            >
              {done ? <IconCheck className="h-4 w-4" /> : d.dayNum}
            </span>
          </div>
        )
      })}
    </div>
  )
}
