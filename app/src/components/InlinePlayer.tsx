import { embedUrl, thumbnailUrl, youtubeId } from '../lib/plan'
import { IconPlay } from './icons'

export type VideoOption = { label: string; url: string }

type Props = {
  videos: VideoOption[] // >= 1
  title: string
  /** URL tocando nesta área (null = parado, mostra thumbnail) */
  playingUrl: string | null
  onPlay: (url: string) => void
}

/**
 * Player estilo YouTube embutido no card: thumbnail + play; ao tocar vira
 * iframe com autoplay no mesmo lugar. Com mais de um vídeo, chips trocam a fonte.
 */
export function InlinePlayer({ videos, title, playingUrl, onPlay }: Props) {
  const current = videos.find((v) => v.url === playingUrl) ?? null
  const cover = videos.find((v) => youtubeId(v.url)) ?? videos[0]
  const playingId = current ? youtubeId(current.url) : null
  const coverId = youtubeId(cover.url)

  const handle = (url: string) => {
    if (youtubeId(url)) {
      onPlay(url)
    } else {
      window.open(url, '_blank', 'noopener')
    }
  }

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {playingId ? (
          <iframe
            src={embedUrl(playingId)}
            title={`${title} — ${current!.label}`}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            onClick={() => handle(cover.url)}
            className="group block h-full w-full"
            aria-label={`Assistir vídeo de ${title}`}
          >
            {coverId && (
              <img
                src={thumbnailUrl(coverId)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-80 transition group-active:opacity-60"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-coral shadow-lg shadow-black/40 transition group-active:scale-90">
                <IconPlay className="h-6 w-6 translate-x-[2px] text-white" />
              </span>
            </span>
          </button>
        )}
      </div>

      {videos.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {videos.map((v, i) => {
            const active = current
              ? v.url === current.url && v.label === current.label
              : i === 0
            return (
              <button
                key={v.label + i}
                onClick={() => handle(v.url)}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
                  active && current
                    ? 'bg-coral text-white'
                    : 'bg-coral/10 text-coral-bright'
                }`}
              >
                <IconPlay className="h-3 w-3" />
                {v.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
