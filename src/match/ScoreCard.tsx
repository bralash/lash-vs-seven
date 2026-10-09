import type { ReactNode } from 'react'
import { OpsFace } from '../components/OpsFace'
import { usePlayerLook, useScoreMood } from './looks'
import { Splat, useHit, useThrowAt } from './Throws'
import type { Seated } from './types'

interface Props {
  p: Seated | null
  you: boolean
  /** highlight the card without the "you" label — pass-and-play marks whose turn it is */
  active?: boolean
  /** it's this player's go (online too): their Ops thinks, without the highlight */
  turn?: boolean
  /** what her grin or sulk goes by, when `value` isn't a score where more is better (null: she stays calm) */
  score?: number | null
  /** the big number (points, rounds won…) */
  value: ReactNode
  /** small caption under it, e.g. "3 words" */
  meta?: ReactNode
}

/**
 * One player's card in the match HUD: name (+ you / away), big score, caption, and the player's Ops
 * in the empty side, reacting to how they're doing. Tap someone else's Ops to throw something at it.
 * Seat colour on top.
 */
export function ScoreCard({ p, you, active, turn, score, value, meta }: Props) {
  const look = usePlayerLook(p?.id)
  const mood = useScoreMood(p?.id, score === undefined ? value : score, !!(active || turn))
  const throwAt = useThrowAt(p?.id, !!active)
  const hit = useHit(p?.id)
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
          <span className={`mt-score__ops${hit ? ' mt-score__ops--hit' : ''}`} data-ops-face={p.id} data-ops-turn={active || undefined}>
            {throwAt ? (
              <button type="button" className="mt-score__throw" onClick={throwAt} aria-label={`Throw something at ${p.name}`}>
                <OpsFace look={look} mood={hit ? 'ouch' : mood} size={40} />
              </button>
            ) : (
              <span aria-hidden="true">
                <OpsFace look={look} mood={hit ? 'ouch' : mood} size={40} />
              </span>
            )}
            {hit && <Splat key={hit.n} hit={hit} />}
          </span>
        )}
      </span>
      {meta !== undefined && <span className="mt-score__meta">{meta}</span>}
    </div>
  )
}
