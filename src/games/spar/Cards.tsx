import { Modal } from '../../components/Modal'
import { SUITS, TRICKS, cardLabel, isRed, rankLabel, suitOf, trickAt, trickWinner, type Play } from './engine'

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

/* ── An opponent's hand, face down ───────────────────────────────────── */

/** `label`: show their name over the cards (with more than one opponent) */
export function Backs({ n, seat, name, label }: { n: number; seat: number; name: string; label?: boolean }) {
  const backs = (
    <div className={`sp-backs sp-backs--${seat}`} aria-label={`${name}: ${n} card${n === 1 ? '' : 's'} left`}>
      {Array.from({ length: n }, (_, i) => (
        <Back key={i} size="sm" />
      ))}
    </div>
  )
  if (!label) return backs
  return (
    <div className={`sp-opp sp-opp--${seat}`}>
      <span className="sp-opp__who">{name}</span>
      {backs}
    </div>
  )
}

/* ── Tricks so far: a pip per trick, in the winner's colour ──────────── */

export function TrickPips({ winners, current }: { winners: number[]; current: number }) {
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

/* ── The stack: every finished trick this round, to go through before you play ── */

/**
 * Like turning over the pile on the table: trick by trick, who played what (the lead first), and
 * who took it. Only finished tricks; the one being played is on the table already.
 */
export function PlayedStack({ plays, n, name, onClose }: { plays: Play[]; n: number; name: (s: number) => string; onClose: () => void }) {
  const done = Math.floor(plays.length / n)
  return (
    <Modal title="Played so far" onClose={onClose}>
      <ol className="sp-stack">
        {Array.from({ length: done }, (_, t) => {
          const trick = trickAt(plays, t, n)
          const w = trickWinner(trick)
          return (
            <li key={t} className="sp-stack__trick">
              <p className="sp-stack__head">
                <span>
                  Trick {t + 1}
                  {t === TRICKS - 1 && ' · last'}
                </span>
                <span>
                  <span className={`sp-stack__dot sp-stack__dot--${w}`} aria-hidden="true" /> {name(w)} took it
                </span>
              </p>
              <div className="sp-stack__plays">
                {trick.map((p, i) => (
                  <div key={p.s} className={`sp-stack__play sp-stack__play--${p.s}${p.s === w ? ' sp-stack__play--won' : ''}`}>
                    <Card k={p.c} />
                    <span className="sp-stack__who">
                      {name(p.s)}
                      {i === 0 && <em> · led</em>}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
