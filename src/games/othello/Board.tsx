import type { Seat } from '../../lobby/rooms'
import { N, legalMoves, type Live } from './engine'

interface Props {
  live: Live
  mySeat: Seat
  myTurn: boolean
  /** show where you can play */
  hints: boolean
  onPlay: (cell: number) => void
}

/**
 * Tap a square to place a disc. The new disc pops in, then the captured ones flip in a wave
 * outward from it. Your legal moves show as small dots in your colour (if hints are on).
 */
export function OthelloBoard({ live, mySeat, myTurn, hints, onPlay }: Props) {
  const moves = myTurn ? new Set(legalMoves(live.board, mySeat)) : new Set<number>()
  const flipped = new Set(live.flipped ?? [])
  const lr = Math.floor(live.last / N)
  const lc = live.last % N
  const over = live.result
  const loser = over && over.winner !== -1 ? String(1 - over.winner) : null

  return (
    <div className={`ot-board${myTurn ? ' ot-board--live' : ''}${over ? ' ot-board--over' : ''}`} role="grid" aria-label="Othello board">
      {live.board.split('').map((v, i) => {
        const r = Math.floor(i / N)
        const c = i % N
        const legal = moves.has(i)
        const flip = flipped.has(i)
        // the wave: each flipped disc waits by its distance from the one just placed
        const dist = Math.max(Math.abs(r - lr), Math.abs(c - lc))
        return (
          <button
            key={i}
            type="button"
            className={`ot-cell${legal ? ' ot-cell--legal' : ''}${i === live.last ? ' ot-cell--last' : ''}`}
            onClick={() => legal && onPlay(i)}
            disabled={!legal}
            aria-label={`${'ABCDEFGH'[c]}${r + 1}${v === '.' ? (legal ? ', play here' : '') : `, ${v === '0' ? 'orange' : 'blue'}`}`}
          >
            {v !== '.' && (
              <span
                // a new key restarts the flip animation whenever this disc is flipped again
                key={flip ? `f${live.last}` : i === live.last ? 'new' : 'still'}
                className={`ot-disc ot-disc--${v}${flip ? ' ot-disc--flip' : ''}${i === live.last ? ' ot-disc--new' : ''}${v === loser ? ' ot-disc--lost' : ''}`}
                style={flip ? { ['--d' as string]: dist } : undefined}
              />
            )}
            {legal && hints && <span className={`ot-hint ot-hint--${mySeat}`} aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

/** A small disc for the HUD (whose turn) — draw shows an "=". */
export function Disc({ seat }: { seat: Seat | null }) {
  if (seat === null) return <span className="ot-mini ot-mini--draw">=</span>
  return <span className={`ot-mini ot-disc ot-disc--${seat}`} aria-hidden="true" />
}
