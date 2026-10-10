import type { CSSProperties } from 'react'
import { COLOUR_NAMES, cardLabel, colourOf, faceOf, isWild, kindOf } from './engine'

/** what's printed on a card */
function mark(k: number) {
  switch (kindOf(k)) {
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇄'
    case 'draw2':
      return '+2'
    case 'wild4':
      return '+4'
    case 'wild':
      return 'W'
    default:
      return faceOf(k)
  }
}

/* ── One card, face up ───────────────────────────────────────────────── */

/** `named`: the colour called with a Wild, shown as a band once it's on the pile. */
export function UnoCard({ k, size = 'md', named, className = '' }: { k: number; size?: 'sm' | 'md' | 'lg'; named?: number | null; className?: string }) {
  const wild = isWild(k)
  const m = mark(k)
  const under = m === '6' || m === '9'
  const label = `${cardLabel(k)}${wild && named !== undefined && named !== null ? ` (${COLOUR_NAMES[named]})` : ''}`
  return (
    <span
      className={`uno-card uno-card--${size}${wild ? ' uno-card--wild' : ` uno-card--c${colourOf(k)}`}${m.length > 1 && !wild ? ' uno-card--wide' : ''} ${className}`}
      role="img"
      aria-label={label}
      style={wild && named !== undefined && named !== null ? ({ '--named': `var(--u${named})` } as CSSProperties) : undefined}
    >
      <span className="uno-card__corner" aria-hidden="true">{m}</span>
      <span className="uno-card__face" aria-hidden="true">
        <span className={under ? 'uno-card__under' : undefined}>{m}</span>
      </span>
      <span className="uno-card__corner uno-card__corner--end" aria-hidden="true">{m}</span>
      {wild && named !== undefined && named !== null && <span className="uno-card__named" aria-hidden="true" />}
    </span>
  )
}

/** Face down. */
export function UnoBack({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <span className={`uno-card uno-card--back uno-card--${size} ${className}`} aria-hidden="true" />
}

/* ── Your hand: tap to lift, tap again to play ───────────────────────── */

export function UnoHand({
  cards,
  pending,
  legal,
  enabled,
  selected,
  onPick,
}: {
  cards: { key: string; c: number }[]
  /** cards on their way (still being unlocked by the other phones) */
  pending: number
  /** the cards (by key) you may play now */
  legal: string[]
  enabled: boolean
  selected: string | null
  onPick: (key: string, c: number) => void
}) {
  const n = cards.length + pending
  return (
    <div className="uno-hand" role="group" aria-label={`Your cards: ${n}`} style={{ '--n': Math.max(n, 2) } as CSSProperties}>
      {cards.map(({ key, c }) => {
        const ok = enabled && legal.includes(key)
        return (
          <button
            key={key}
            type="button"
            className={`uno-hand__card${selected === key ? ' uno-hand__card--up' : ''}${enabled && !ok ? ' uno-hand__card--no' : ''}`}
            disabled={!ok}
            aria-pressed={selected === key}
            onClick={() => onPick(key, c)}
          >
            <UnoCard k={c} size="lg" />
          </button>
        )
      })}
      {Array.from({ length: pending }, (_, i) => (
        <span key={`p${i}`} className="uno-hand__card uno-hand__card--coming">
          <UnoBack size="lg" />
        </span>
      ))}
    </div>
  )
}

/* ── Naming the colour for a Wild ────────────────────────────────────── */

export function ColourPick({ onPick, onCancel }: { onPick: (col: number) => void; onCancel: () => void }) {
  return (
    <div className="uno-pick" role="group" aria-label="Name a colour">
      <p className="label">Name a colour</p>
      <div className="uno-pick__row">
        {COLOUR_NAMES.map((name, col) => (
          <button key={name} type="button" className={`uno-pick__c uno-pick__c--${col}`} onClick={() => onPick(col)}>
            {name}
          </button>
        ))}
      </div>
      <button type="button" className="uno-pick__cancel" onClick={onCancel}>
        Not this card
      </button>
    </div>
  )
}
