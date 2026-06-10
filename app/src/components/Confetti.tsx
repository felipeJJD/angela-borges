import { useState } from 'react'

const COLORS = ['#ff8a5c', '#e8784e', '#c95c33', '#ffffff', '#ffd0bd']

type Piece = {
  left: number
  delay: number
  duration: number
  size: number
  color: string
  rounded: boolean
  i: number
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 1.5,
    size: 6 + Math.random() * 8,
    color: COLORS[i % COLORS.length],
    rounded: Math.random() > 0.5,
    i,
  }))
}

/** Pure-CSS confetti burst. Render conditionally; it self-runs ~2.5s. */
export function Confetti({ count = 70 }: { count?: number }) {
  // Generated once per mount via lazy initializer (kept out of render purity).
  const [pieces] = useState<Piece[]>(() => makePieces(count))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.i}
          style={{
            position: 'absolute',
            top: '-5%',
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.rounded ? 1 : 0.5),
            background: p.color,
            borderRadius: p.rounded ? '50%' : '2px',
            animation: `confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
    </div>
  )
}
