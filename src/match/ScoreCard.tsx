import type { ReactNode } from 'react'
import { OpsFace } from '../components/OpsFace'
import { usePlayerLook, useScoreMood } from './looks'
import { useTaunt } from './Taunts'
import { Splat, useHit, useThrowAt } from './Throws'
import { FIRE_MOOD, ULTS, ultOf, useStruck, useUlt } from './Ultimates'
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
 * Under the face, the ultimate's meter: it fills when they win a game, and then a tap on your own
 * face fires it. Hold your own face and your character walks over to taunt someone else's card (Taunts).
 * Seat colour on top.
 */
export function ScoreCard({ p, you, active, turn, score, value, meta }: Props) {
  const look = usePlayerLook(p?.id)
  const mood = useScoreMood(p?.id, score === undefined ? value : score, !!(active || turn))
  const throwAt = useThrowAt(p?.id, !!active)
  const ult = useUlt(p?.id)
  const struck = useStruck(p?.id)
  const hit = useHit(p?.id) ?? struck
  const taunt = useTaunt(p?.id, !!active)
  if (!p) return <div className="mt-score" />
  // what the face pulls: firing its ultimate, glaring at a visitor, just hit, or how the game's going
  const face = ult?.firing ? FIRE_MOOD[ult.firing] : taunt?.visitedBy ? 'angry' : hit ? 'ouch' : mood
  const onTap = taunt?.pick ?? throwAt
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
          <span
            className={`mt-score__ops${hit ? ` mt-score__ops--hit mt-score__ops--${hit.item}` : ''}${ult?.charged ? ' mt-score__ops--charged' : ''}${ult?.firing ? ` mt-score__ops--ult-${ult.firing}` : ''}${taunt?.away ? ' mt-score__ops--away' : ''}${taunt?.holding ? ' mt-score__ops--holding' : ''}${taunt?.visitedBy ? ' mt-score__ops--taunted' : ''}${taunt?.pick ? ' mt-score__ops--pick' : ''}`}
            data-ops-face={p.id}
            data-ops-look={look}
            data-ops-name={p.name}
            data-ops-turn={active || undefined}
            {...taunt?.hold}
          >
            {ult?.fire && !taunt?.pick ? (
              <button type="button" className="mt-score__throw mt-score__fire" onClick={ult.fire} aria-label={`Fire ${ULTS[ultOf(look)].name}`}>
                <OpsFace look={look} mood={mood} size={40} />
              </button>
            ) : onTap ? (
              <button type="button" className="mt-score__throw" onClick={onTap} aria-label={taunt?.pick ? `Send your character to ${p.name}` : `Throw something at ${p.name}`}>
                <OpsFace look={look} mood={face} size={40} />
              </button>
            ) : (
              <span aria-hidden="true">
                <OpsFace look={look} mood={face} size={40} />
              </span>
            )}
            {hit && <Splat key={hit.n} hit={hit} />}
            {ult && (
              <span className="mt-score__ult" title={ult.charged ? `${ULTS[ultOf(look)].name} ready` : 'Win a game to charge the ultimate'} aria-hidden="true">
                <span />
              </span>
            )}
          </span>
        )}
      </span>
      {meta !== undefined && <span className="mt-score__meta">{meta}</span>}
    </div>
  )
}
