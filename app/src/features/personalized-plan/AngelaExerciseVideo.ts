const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_WATCH_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
])

export function angelaYouTubeEmbedUrl(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    value !== value.trim()
  ) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null

    const hostname = url.hostname.toLowerCase()
    let videoId: string | null = null
    if (YOUTUBE_WATCH_HOSTS.has(hostname) && url.pathname === '/watch') {
      videoId = url.searchParams.get('v')
    } else if (hostname === 'youtu.be') {
      const pathSegments = url.pathname.split('/').filter(Boolean)
      videoId = pathSegments.length === 1 ? pathSegments[0] : null
    }

    if (videoId === null || !YOUTUBE_ID_PATTERN.test(videoId)) return null

    return `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`
  } catch {
    return null
  }
}
