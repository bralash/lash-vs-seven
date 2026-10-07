import type { ReactNode } from 'react'
import type { Seated } from './types'

interface Props {
  p: Seated | null
  you: boolean
  /** the big number (points, rounds won…) */
  value: ReactNode
  /** small caption under it, e.g. "3 words" */
  meta?: ReactNode
}

/** One player's card in the match HUD: name (+ you / away), big score, caption. Seat colour on top. */
export function ScoreCard({ p, you, value, meta }: Props) {
  if (!p) return <div className="mt-score" />
  return (
    <div className={`mt-score mt-score--${p.seat}${you ? ' mt-score--you' : ''}`}>
      <span className="mt-score__name">
        {p.name}
        {you && <em> · you</em>}
        {!p.online && <em> · away</em>}
      </span>
      <span className="mt-score__n">{value}</span>
      {meta !== undefined && <span className="mt-score__meta">{meta}</span>}
    </div>
  )
}
