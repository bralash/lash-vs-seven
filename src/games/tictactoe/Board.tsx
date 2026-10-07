import { useLayoutEffect, useRef, useState } from 'react'
import type { Seat } from '../../lobby/rooms'
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
        <WinLine key={`${live.game}-${line.join()}`} boardRef={boardRef} line={line} />
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

/* ── The strike through a winning three ──────────────────────────────── */

interface Geometry {
  w: number
  h: number
  x1: number
  y1: number
  x2: number
  y2: number
  /** stroke width, scaled to the cell size */
  sw: number
  len: number
}

/**
 * Drawn in real pixels from the measured cell centres (gaps included), so it runs dead through
 * the middle of all three marks at any board size. Re-measures if the board is resized.
 */
function WinLine({ boardRef, line }: { boardRef: React.RefObject<HTMLDivElement | null>; line: number[] }) {
  const [g, setG] = useState<Geometry | null>(null)

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    const measure = () => {
      const cells = board.querySelectorAll<HTMLElement>('.ttt-cell')
      const centre = (i: number) => {
        const el = cells[i]
        return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, size: el.offsetWidth }
      }
      const a = centre(line[0])
      const b = centre(line[2])
      // overshoot past the outer marks so it reads as a strike, not a connector
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const ux = (b.x - a.x) / dist
      const uy = (b.y - a.y) / dist
      const over = a.size * 0.34
      const x1 = a.x - ux * over
      const y1 = a.y - uy * over
      const x2 = b.x + ux * over
      const y2 = b.y + uy * over
      setG({ w: board.offsetWidth, h: board.offsetHeight, x1, y1, x2, y2, sw: Math.max(6, a.size * 0.12), len: Math.hypot(x2 - x1, y2 - y1) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(board)
    return () => ro.disconnect()
  }, [boardRef, line])

  if (!g) return null
  return (
    <svg
      className="ttt-winline"
      viewBox={`0 0 ${g.w} ${g.h}`}
      style={{ ['--len' as string]: g.len, ['--sw' as string]: g.sw }}
      aria-hidden="true"
    >
      <line className="ttt-winline__ink" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
    </svg>
  )
}
