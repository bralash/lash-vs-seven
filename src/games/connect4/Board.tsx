import { useRef, useState } from 'react'
import type { Seat } from '../../lobby/rooms'
import { WinLine } from '../../match/WinLine'
import { COLS, ROWS, dropRow, idx, type Live } from './engine'

interface Props {
  live: Live
  mySeat: Seat
  myTurn: boolean
  onDrop: (col: number) => void
}

/**
 * Columns are the tap targets (the whole height of a column drops a disc), so it's easy to
 * play with a thumb. The newest disc falls from above the board to its row.
 */
export function C4Board({ live, mySeat, myTurn, onDrop }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const line = live.result?.line
  const state = live.result ? (live.result.winner === -1 ? ' c4-board--draw' : ' c4-board--won') : ''

  return (
    <div className="c4">
      {/* desktop: a ghost disc rides above the column you're pointing at */}
      <div className="c4-rail" aria-hidden="true">
        {Array.from({ length: COLS }, (_, c) => (
          <span key={c} className="c4-rail__slot">
            {myTurn && hover === c && dropRow(live.board, c) >= 0 && <span className={`c4-disc c4-disc--${mySeat} c4-disc--ghost`} />}
          </span>
        ))}
      </div>

      <div ref={boardRef} className={`c4-board${myTurn ? ' c4-board--live' : ''}${state}`} role="grid" aria-label="Connect Four board">
        {Array.from({ length: COLS }, (_, c) => {
          const full = dropRow(live.board, c) < 0
          return (
            <button
              key={`${live.game}-${c}`}
              type="button"
              className="c4-col"
              onClick={() => onDrop(c)}
              onPointerEnter={() => setHover(c)}
              onPointerLeave={() => setHover((h) => (h === c ? null : h))}
              disabled={!myTurn || full}
              aria-label={full ? `Column ${c + 1}, full` : `Drop in column ${c + 1}`}
            >
              {Array.from({ length: ROWS }, (_, r) => {
                const i = idx(r, c)
                const v = live.board[i]
                const step = line ? line.indexOf(i) : -1
                return (
                  <span key={r} className={`c4-hole${step >= 0 ? ' c4-hole--win' : ''}`} data-i={i} style={step >= 0 ? { ['--step' as string]: step } : undefined}>
                    {v !== '.' && (
                      <span
                        className={`c4-disc c4-disc--${v}${i === live.last ? ' c4-disc--drop' : ''}`}
                        // fall distance in rows, from just above the board
                        style={i === live.last ? { ['--fall' as string]: r + 1 } : undefined}
                      />
                    )}
                  </span>
                )
              })}
            </button>
          )
        })}
        {line && live.result!.winner !== -1 && (
          <WinLine key={`${live.game}-${line.join()}`} boardRef={boardRef} line={line} cellSelector=".c4-hole" weight={0.2} outlined />
        )}
      </div>
    </div>
  )
}

/** A small disc for the HUD (whose turn) — draw shows an "=". */
export function Disc({ seat }: { seat: Seat | null }) {
  if (seat === null) return <span className="c4-mini c4-mini--draw">=</span>
  return <span className={`c4-mini c4-disc c4-disc--${seat}`} aria-hidden="true" />
}
