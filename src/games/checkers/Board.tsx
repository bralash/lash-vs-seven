import { useState } from 'react'
import type { Seat } from '../../lobby/rooms'
import { N, isKing, legalSteps, ownerOf, type Live } from './engine'

interface Props {
  live: Live
  mySeat: Seat
  myTurn: boolean
  /** draw the board from seat 1's side, so your own pieces are always at the bottom (online) */
  flipped: boolean
  onStep: (from: number, to: number) => void
}

/**
 * Tap one of your pieces, then where it goes. Pieces that can move are outlined on your turn (and
 * when a capture is forced, only the ones that can capture are). Mid-way through a multi-jump the
 * jumping piece stays selected. The last move slides in, and anything it captured fades away.
 */
export function CheckersBoard({ live, mySeat, myTurn, flipped, onStep }: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const steps = myTurn ? legalSteps(live) : []
  const movable = new Set(steps.map((s) => s.from))
  // a multi-jump keeps its piece; a single movable piece is picked for you
  const selected = live.chain ?? (picked !== null && movable.has(picked) ? picked : movable.size === 1 ? [...movable][0] : null)
  const targets = new Map(steps.filter((s) => s.from === selected).map((s) => [s.to, s]))
  const forced = steps.some((s) => s.captured !== undefined)

  // board index ↔ display position
  const idxAt = (d: number) => (flipped ? N * N - 1 - d : d)
  const rc = (i: number) => {
    const d = flipped ? N * N - 1 - i : i
    return [Math.floor(d / N), d % N]
  }

  const tap = (i: number) => {
    if (!myTurn) return
    const step = targets.get(i)
    if (step && selected !== null) {
      onStep(selected, i)
      setPicked(null)
    } else if (live.chain === undefined) setPicked(movable.has(i) ? i : null)
  }

  const last = live.last
  const mover = last ? ownerOf(live.board[last.to]) : null

  return (
    <div className={`ck-board${myTurn ? ' ck-board--live' : ''}${live.result ? ' ck-board--over' : ''}`} role="grid" aria-label="Checkers board">
      {Array.from({ length: N * N }, (_, d) => {
        const i = idxAt(d)
        const [r, c] = rc(i)
        const dark = (r + c) % 2 === 1
        const v = live.board[i]
        const owner = ownerOf(v)
        const target = targets.get(i)
        let slide: Record<string, number> | undefined
        if (last && i === last.to) {
          const [fr, fc] = rc(last.from)
          slide = { '--dx': fc - c, '--dy': fr - r }
        }
        const cls = [
          'ck-sq',
          dark ? 'ck-sq--dark' : 'ck-sq--light',
          last && (i === last.from || i === last.to) ? 'ck-sq--last' : '',
          i === selected ? 'ck-sq--sel' : '',
          target ? 'ck-sq--target' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={i}
            type="button"
            className={cls}
            onClick={() => tap(i)}
            disabled={!dark || !myTurn || (!movable.has(i) && !target)}
            aria-label={`${'ABCDEFGH'[i % N]}${N - Math.floor(i / N)}${owner === null ? '' : `, ${owner === 0 ? 'orange' : 'blue'}${isKing(v) ? ' king' : ''}`}${target ? ', move here' : ''}`}
          >
            {owner !== null && (
              <span
                key={slide ? `s${last!.from}-${last!.to}` : 'p'}
                className={`ck-piece ck-piece--${owner}${isKing(v) ? ' ck-piece--king' : ''}${movable.has(i) && selected === null ? ' ck-piece--can' : ''}${
                  forced && movable.has(i) ? ' ck-piece--must' : ''
                }${slide ? ' ck-piece--slide' : ''}`}
                style={slide}
              >
                {isKing(v) && <Crown />}
              </span>
            )}
            {/* what the last move captured, fading out where it stood */}
            {last?.captured === i && mover !== null && <span key={`g${last.from}-${last.to}`} className={`ck-piece ck-piece--${1 - mover} ck-ghost`} aria-hidden="true" />}
            {target && <span className={`ck-dot ck-dot--${mySeat}${target.captured !== undefined ? ' ck-dot--capture' : ''}`} aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

function Crown() {
  return (
    <svg className="ck-crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18 L5 7 L9.5 12 L12 5 L14.5 12 L19 7 L21 18 Z" />
    </svg>
  )
}

/** A small piece for the HUD (whose turn) — draw shows an "=". */
export function Piece({ seat }: { seat: Seat | null }) {
  if (seat === null) return <span className="ck-mini ck-mini--draw">=</span>
  return <span className={`ck-mini ck-piece ck-piece--${seat}`} aria-hidden="true" />
}
