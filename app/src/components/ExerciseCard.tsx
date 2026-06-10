import type { PlanExercise } from '../lib/plan'
import { InlinePlayer, type VideoOption } from './InlinePlayer'

type Props = {
  exercise: PlanExercise
  index: number
  /** URL tocando neste card (null = nenhum) */
  playingUrl: string | null
  onPlay: (url: string) => void
}

function exerciseVideos(ex: PlanExercise): VideoOption[] {
  const combo = ex.video_urls.length > 1
  const noteUrls = [
    ...(ex.notes_video_url ? [ex.notes_video_url] : []),
    ...(ex.notes_video_urls ?? []),
  ]
  return [
    ...ex.video_urls.map((url, i) => ({
      label: combo ? `Vídeo ${i + 1}` : 'Vídeo',
      url,
    })),
    ...(ex.reps_video_url ? [{ label: 'Método', url: ex.reps_video_url }] : []),
    ...noteUrls.map((url, i) => ({
      label: noteUrls.length > 1 ? `Observação ${i + 1}` : 'Observação',
      url,
    })),
  ]
}

export function ExerciseCard({ exercise: ex, index, playingUrl, onPlay }: Props) {
  const videos = exerciseVideos(ex)

  return (
    <div className="animate-fade-up rounded-2xl border border-border bg-surface p-3">
      {videos.length > 0 && (
        <InlinePlayer
          videos={videos}
          title={ex.name}
          playingUrl={playingUrl}
          onPlay={onPlay}
        />
      )}

      <div className={videos.length > 0 ? 'mt-3 px-1 pb-1' : 'px-1 py-1'}>
        <p className="text-[11px] font-semibold tracking-wider text-muted-2">
          {String(index + 1).padStart(2, '0')}
        </p>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-white">
          {ex.name}
        </h3>

        {(ex.sets !== null || ex.reps || ex.rest) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {ex.sets !== null && (
              <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-white">
                {ex.sets} {ex.sets === 1 ? 'série' : 'séries'}
              </span>
            )}
            {ex.reps && (
              <span className="whitespace-pre-line rounded-lg bg-white/5 px-2.5 py-1 text-xs font-medium leading-relaxed text-white/90">
                {ex.reps}
              </span>
            )}
            {ex.rest && (
              <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-medium text-muted">
                descanso {ex.rest}
              </span>
            )}
          </div>
        )}

        {ex.notes && (
          <p className="mt-3 whitespace-pre-line border-l-2 border-coral/40 pl-3 text-[13px] leading-relaxed text-muted">
            {ex.notes}
          </p>
        )}
      </div>
    </div>
  )
}
