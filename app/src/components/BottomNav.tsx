import { NavLink } from 'react-router-dom'
import { IconHome, IconDumbbell, IconFileText, IconUser } from './icons'

const items = [
  { to: '/meu-plano', label: 'Meu Plano', Icon: IconFileText, end: false },
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/treinos', label: 'Biblioteca', Icon: IconDumbbell, end: false },
  { to: '/perfil', label: 'Perfil', Icon: IconUser, end: false },
]

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-ink/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-w-11 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors ${
                isActive ? 'text-coral-bright' : 'text-muted-2'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-6 w-6 transition-transform ${isActive ? 'scale-110' : ''}`}
                />
                <span className="text-[11px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
