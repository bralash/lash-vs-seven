import type { ReactNode } from 'react'
import { OpsFace } from '../components/OpsFace'
import { usePlayerLook, useScoreMood } from './looks'
import type { Seated } from './types'

interface Props {
  p: Seated | null
  you: boolean
  /** highlight the card without the "you" label — pass-and-play marks whose turn it is */
  active?: boolean
  /** the big number (points, rounds won…) */
  value: ReactNode
  /** small caption under it, e.g. "3 words" */
  meta?: ReactNode
}

/**
 * One player's card in the match HUD: name (+ you / away), big score, caption, and the player's Ops
 * in the empty side, reacting to how they're doing. Seat colour on top.
 */
export function ScoreCard({ p, you, active, value, meta }: Props) {
  const look = usePlayerLook(p?.id)
  const mood = useScoreMood(p?.id, value, !!active)
  if (!p) return <div className="mt-score" />
  return (
    <div className={`mt-score mt-score--${p.seat}${you || active ? ' mt-score--you' : ''}${look ? ' mt-score--ops' : ''}`}>
      <span className="mt-score__name">
        {p.name}
        {you && <em> · you</em>}
        {!p.online && <em> · away</em>}
      </span>
      <span className="mt-score__row">
        <span className="mt-score__n">{value}</span>
        {look && (
          <span className="mt-score__ops" aria-hidden="true">
            <OpsFace look={look} mood={mood} size={40} />
          </span>
        )}
      </span>
      {meta !== undefined && <span className="mt-score__meta">{meta}</span>}
    </div>
  )
}
