import { describe, expect, it } from 'vitest'

import { angelaYouTubeEmbedUrl } from './AngelaExerciseVideo'

describe('Angela exercise video embed URL', () => {
  it('converts an approved YouTube watch URL to the privacy-enhanced player', () => {
    expect(
      angelaYouTubeEmbedUrl(
        'https://www.youtube.com/watch?v=OlBu4Z5leTk&feature=youtu.be',
      ),
    ).toBe(
      'https://www.youtube-nocookie.com/embed/OlBu4Z5leTk?playsinline=1&rel=0',
    )
  })

  it('converts a short youtu.be URL to the same privacy-enhanced player', () => {
    expect(
      angelaYouTubeEmbedUrl('https://youtu.be/mkI2kZiFO2w?feature=shared'),
    ).toBe(
      'https://www.youtube-nocookie.com/embed/mkI2kZiFO2w?playsinline=1&rel=0',
    )
  })

  it.each([
    ['an impostor host', 'https://youtube.com.evil.example/watch?v=OlBu4Z5leTk'],
    ['a non-YouTube host', 'https://example.com/watch?v=OlBu4Z5leTk'],
    ['plain HTTP', 'http://www.youtube.com/watch?v=OlBu4Z5leTk'],
    ['an invalid video id', 'https://www.youtube.com/watch?v=short'],
    ['surrounding whitespace', ' https://youtu.be/OlBu4Z5leTk'],
  ])('does not embed %s', (_label, url) => {
    expect(angelaYouTubeEmbedUrl(url)).toBeNull()
  })
})
