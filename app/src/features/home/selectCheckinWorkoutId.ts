import type { Workout } from '../../lib/supabase'

export function selectCheckinWorkoutId(
  workouts: readonly Workout[],
  completedIds: ReadonlySet<string>,
  team: number,
): string | undefined {
  const teamWorkouts = workouts.filter((workout) => workout.team === team)
  return (
    teamWorkouts.find((workout) => !completedIds.has(workout.id))?.id ??
    teamWorkouts[0]?.id
  )
}
