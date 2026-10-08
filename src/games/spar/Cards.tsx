import type { Seat } from '../../lobby/rooms'
import { SUITS, cardLabel, isRed, rankLabel, suitOf } from './engine'

/* ── One card, face up ───────────────────────────────────────────────── */

export function Card({ k, size = 'md', className = '' }: { k: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = SUITS[suitOf(k)]
  return (
    <span className={`sp-card sp-card--${size}${isRed(k) ? ' sp-card--red' : ''} ${className}`} aria-label={cardLabel(k)} role="img">
      <span className="sp-card__corner" aria-hidden="true">
        {rankLabel(k)}
        <span>{s}</span>
      </span>
      <span className="sp-card__pip" aria-hidden="true">
        {s}
      </span>
    </span>
  )
}

/** Face down. */
export function Back({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <span className={`sp-card sp-card--back sp-card--${size} ${className}`} aria-hidden="true" />
}

/* ── Your hand: tap to lift, tap again to play ───────────────────────── */

export function Hand({
  cards,
  legal,
  enabled,
  selected,
  onPick,
}: {
  cards: number[]
  /** cards you're allowed to play right now (following suit) */
  legal: number[]
  enabled: boolean
  selected: number | null
  onPick: (k: number) => void
}) {
  return (
    <div className="sp-hand" role="group" aria-label="Your cards">
      {cards.map((k) => {
        const ok = enabled && legal.includes(k)
        return (
          <button
            key={k}
            type="button"
            className={`sp-hand__card${selected === k ? ' sp-hand__card--up' : ''}${enabled && !ok ? ' sp-hand__card--no' : ''}`}
            disabled={!ok}
            aria-pressed={selected === k}
            onClick={() => onPick(k)}
          >
            <Card k={k} size="lg" />
          </button>
        )
      })}
    </div>
  )
}

/* ── The opponent's hand, face down ──────────────────────────────────── */

export function Backs({ n, seat, name }: { n: number; seat: Seat; name: string }) {
  return (
    <div className={`sp-backs sp-backs--${seat}`} aria-label={`${name}: ${n} card${n === 1 ? '' : 's'} left`}>
      {Array.from({ length: n }, (_, i) => (
        <Back key={i} size="sm" />
      ))}
    </div>
  )
}

/* ── Tricks so far: a pip per trick, in the winner's colour ──────────── */

export function TrickPips({ winners, current }: { winners: Seat[]; current: number }) {
  return (
    <ol className="sp-pips" aria-label={`Trick ${Math.min(current + 1, 5)} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className={`sp-pips__pip${winners[i] !== undefined ? ` sp-pips__pip--${winners[i]}` : ''}${i === current ? ' sp-pips__pip--now' : ''}${i === 4 ? ' sp-pips__pip--last' : ''}`}
        />
      ))}
    </ol>
  )
}
