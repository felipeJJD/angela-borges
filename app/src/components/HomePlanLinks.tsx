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
    <section className="animate-fade-up space-y-2.5" aria-labelledby="home-plan-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-coral-bright">
          Protocolo personalizado
        </p>
        <h2 id="home-plan-title" className="text-sm font-semibold text-muted">
          Seu plano
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {links.map(({ to, label, description, Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex min-h-32 flex-col rounded-3xl border border-border bg-gradient-to-br from-surface to-ink-2 p-4 transition-all active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-coral/15 text-coral-bright">
              <Icon className="h-5 w-5" />
            </span>
            <span className="mt-4 flex items-end justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-display text-lg text-white">{label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted-2">
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
