import { useLayoutEffect, useState, type RefObject } from 'react'

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

interface Props {
  /** the positioned board element the line is drawn over */
  boardRef: RefObject<HTMLElement | null>
  /** cell indices in order along the line — the strike runs from the first to the last */
  line: number[]
  /** selector for the board's cells — matched by their data-i index if they have one, else by DOM order */
  cellSelector: string
  /** line thickness as a fraction of a cell (default 0.12) */
  weight?: number
  /** paper-coloured line with an ink edge — for boards whose pieces are dark (Connect Four) */
  outlined?: boolean
}

/**
 * The strike through a winning run (three in Tic-Tac-Toe, four in Connect Four…).
 * Drawn in real pixels from the measured cell centres (gaps included), so it runs dead through
 * the middle of every piece at any board size. Re-measures if the board is resized.
 */
export function WinLine({ boardRef, line, cellSelector, weight = 0.12, outlined = false }: Props) {
  const [g, setG] = useState<Geometry | null>(null)

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    const measure = () => {
      const cells = board.querySelectorAll<HTMLElement>(cellSelector)
      const centre = (i: number) => {
        const el = board.querySelector<HTMLElement>(`${cellSelector}[data-i="${i}"]`) ?? cells[i]
        // offsets are relative to the board (its offsetParent), unaffected by transforms/animations
        let x = el.offsetLeft + el.offsetWidth / 2
        let y = el.offsetTop + el.offsetHeight / 2
        let p = el.offsetParent as HTMLElement | null
        while (p && p !== board) {
          x += p.offsetLeft
          y += p.offsetTop
          p = p.offsetParent as HTMLElement | null
        }
        return { x, y, size: el.offsetWidth }
      }
      const a = centre(line[0])
      const b = centre(line[line.length - 1])
      // overshoot past the outer pieces so it reads as a strike, not a connector
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const ux = (b.x - a.x) / dist
      const uy = (b.y - a.y) / dist
      const over = a.size * 0.34
      const x1 = a.x - ux * over
      const y1 = a.y - uy * over
      const x2 = b.x + ux * over
      const y2 = b.y + uy * over
      setG({ w: board.offsetWidth, h: board.offsetHeight, x1, y1, x2, y2, sw: Math.max(6, a.size * weight), len: Math.hypot(x2 - x1, y2 - y1) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(board)
    return () => ro.disconnect()
  }, [boardRef, line, cellSelector, weight])

  if (!g) return null
  return (
    <svg
      className={`mt-winline${outlined ? ' mt-winline--outlined' : ''}`}
      viewBox={`0 0 ${g.w} ${g.h}`}
      style={{ ['--len' as string]: g.len, ['--sw' as string]: g.sw }}
      aria-hidden="true"
    >
      {/* outlined = the same line drawn twice in place: a wider ink edge, then the paper core */}
      {outlined && <line className="mt-winline__edge" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />}
      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
    </svg>
  )
}
