import { Link } from 'react-router-dom'

import { IconApple, IconChevronRight, IconDumbbell } from './icons'

const links = [
  {
    to: '/dieta',
    label: 'Dieta',
    description: 'Plano alimentar',
    Icon: IconApple,
  },
  {
    to: '/treino',
    label: 'Treino',
    description: 'Treino personalizado',
    Icon: IconDumbbell,
  },
]

export function HomePlanLinks() {
  return (
    <section className="animate-fade-up space-y-3" aria-labelledby="home-plan-title">
      <div className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral-bright">
          Feito para você
        </p>
        <h2 id="home-plan-title" className="mt-1 text-display text-xl text-white">
          Dieta e treino
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {links.map(({ to, label, description, Icon }) => (
          <Link
            key={to}
            to={to}
            className="group relative flex min-h-36 flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-surface via-surface to-ink-2 p-4 shadow-xl shadow-black/15 transition-all active:scale-[0.98]"
          >
            <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-coral/10 blur-xl transition-colors group-hover:bg-coral/15" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-coral/20 bg-coral/15 text-coral-bright">
              <Icon className="h-5 w-5" />
            </span>
            <span className="relative mt-auto flex items-end justify-between gap-2 pt-5">
              <span className="min-w-0">
                <span className="block text-display text-xl text-white">{label}</span>
                <span className="mt-1 block text-[11px] leading-tight text-muted">
                  {description}
                </span>
              </span>
              <IconChevronRight className="h-4 w-4 shrink-0 text-coral-bright transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
