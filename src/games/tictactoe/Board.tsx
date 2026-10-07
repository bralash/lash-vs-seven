import { useRef } from 'react'
import type { Seat } from '../../lobby/rooms'
import { WinLine } from '../../match/WinLine'
import { MARK, type Live } from './engine'

interface Props {
  live: Live
  /** whose ghost mark shows on hover */
  mySeat: Seat
  myTurn: boolean
  onTap: (cell: number) => void
}

export function TttBoard({ live, mySeat, myTurn, onTap }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const line = live.result?.line
  const state = live.result ? (live.result.winner === -1 ? ' ttt-board--draw' : ' ttt-board--won') : ''

  return (
    <div ref={boardRef} className={`ttt-board${myTurn ? ' ttt-board--live' : ''}${state}`} role="grid" aria-label="Tic-tac-toe board">
      {[0, 1, 2].map((r) => (
        <div key={r} role="row" className="ttt-row">
          {[0, 1, 2].map((c) => {
            const i = r * 3 + c
            const v = live.board[i]
            const seat = v === '.' ? null : (Number(v) as Seat)
            const step = line ? line.indexOf(i) : -1
            return (
              <button
                key={`${live.game}-${i}`}
                type="button"
                role="gridcell"
                className={`ttt-cell${seat === null ? '' : ` ttt-cell--${seat}`}${i === live.last ? ' ttt-cell--last' : ''}${step >= 0 ? ' ttt-cell--win' : ''}`}
                // the cells light up one after another as the strike passes through them
                style={step >= 0 ? { ['--step' as string]: step } : undefined}
                onClick={() => onTap(i)}
                disabled={!myTurn || seat !== null}
                aria-label={seat === null ? `Empty, row ${r + 1} column ${c + 1}` : `${MARK[seat]}, row ${r + 1} column ${c + 1}`}
              >
                {seat !== null && <Mark seat={seat} />}
                {seat === null && myTurn && (
                  <span className="ttt-ghost" aria-hidden="true">
                    <Mark seat={mySeat} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
      {line && live.result!.winner !== -1 && (
        <WinLine key={`${live.game}-${line.join()}`} boardRef={boardRef} line={line} cellSelector=".ttt-cell" />
      )}
    </div>
  )
}

/* ── Marks ───────────────────────────────────────────────────────────── */

export function Mark({ seat, small }: { seat: Seat | null; small?: boolean }) {
  if (seat === null) return <span className={`ttt-mark ttt-mark--draw${small ? ' ttt-mark--small' : ''}`}>=</span>
  return (
    <svg className={`ttt-mark ttt-mark--${seat}${small ? ' ttt-mark--small' : ''}`} viewBox="0 0 100 100" aria-hidden="true">
      {seat === 0 ? (
        <>
          <path className="ttt-stroke" d="M24 24 L76 76" />
          <path className="ttt-stroke ttt-stroke--2" d="M76 24 L24 76" />
        </>
      ) : (
        <circle className="ttt-stroke" cx="50" cy="50" r="27" />
      )}
    </svg>
  )
}
