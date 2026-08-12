import { NavLink } from 'react-router-dom'
import {
  IconApple,
  IconDumbbell,
  IconHome,
  IconUser,
} from './icons'

const items = [
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/dieta', label: 'Dieta', Icon: IconApple, end: true },
  { to: '/treino', label: 'Treino', Icon: IconDumbbell, end: true },
  { to: '/perfil', label: 'Perfil', Icon: IconUser, end: true },
]

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      data-visual="floating-glass"
      className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 px-4"
    >
      <div className="pointer-events-auto mx-auto grid h-[4.5rem] max-w-[380px] grid-cols-4 gap-1 rounded-[2rem] border border-white/10 bg-black/75 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-[1.55rem] px-1 text-center transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-bright/80 ${
                isActive
                  ? 'bg-coral/15 text-coral-bright shadow-[inset_0_0_0_1px_rgba(255,138,92,0.18)]'
                  : 'text-muted hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-5 w-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="truncate text-[10px] font-semibold tracking-wide">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
