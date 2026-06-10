import { TEAM_LABELS } from '../lib/supabase'

type Props = {
  team: 1 | 2 | 3
  size?: 'sm' | 'md'
  showLabel?: boolean
}

export function TeamBadge({ team, size = 'md', showLabel = true }: Props) {
  const small = size === 'sm'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral/10 font-semibold text-coral-bright ${
        small ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
    >
      <span className="text-display tracking-wide">Team {team}</span>
      {showLabel && (
        <>
          <span className="opacity-40">·</span>
          <span className="font-medium text-coral-bright/90">
            {TEAM_LABELS[team]}
          </span>
        </>
      )}
    </span>
  )
}
