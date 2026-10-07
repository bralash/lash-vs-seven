import { useRef, useState, type PointerEvent } from 'react'
import type { Seat } from '../../lobby/rooms'
import { lineCount, segment, type Live } from './engine'

/** viewBox units: one box is U wide, with a margin M around the dots */
const U = 100
const M = 26
const DOT = 22

interface Props {
  live: Live
  mySeat: Seat
  myTurn: boolean
  /** players' initials, written in the boxes they claim */
  initials: [string, string]
  onPlay: (line: number) => void
}

const ends = (n: number, i: number) => {
  const { horizontal, r, c } = segment(n, i)
  const x1 = M + c * U
  const y1 = M + r * U
  return horizontal ? [x1, y1, x1 + U, y1] : [x1, y1, x1, y1 + U]
}

/**
 * Press anywhere on the board and the nearest free line lights up in your colour; slide to change
 * it, lift to draw it (slide off the board to cancel). So you always see the line before it lands,
 * and you never have to hit a thin target exactly.
 */
export function DotsBoard({ live, mySeat, myTurn, initials, onPlay }: Props) {
  const n = live.size
  const svgRef = useRef<SVGSVGElement>(null)
  const [aim, setAim] = useState<{ line: number; pressed: boolean } | null>(null)
  const W = n * U + 2 * M
  const over = !!live.result

  const nearest = (e: PointerEvent): number | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    let best: number | null = null
    let bestD = U * 0.5
    for (let i = 0; i < lineCount(n); i++) {
      if (live.lines[i] !== '.') continue
      const [x1, y1, x2, y2] = ends(n, i)
      // distance to the segment (lines are axis-aligned)
      const dx = Math.max(Math.min(x1, x2) - p.x, 0, p.x - Math.max(x1, x2))
      const dy = Math.max(Math.min(y1, y2) - p.y, 0, p.y - Math.max(y1, y2))
      const d = Math.hypot(dx, dy)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!myTurn) return
    try {
      // keep receiving the slide even if the finger leaves the board
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no capture available: the press still works without it */
    }
    const line = nearest(e)
    setAim(line === null ? null : { line, pressed: true })
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!myTurn) return
    // a mouse just hovering previews faintly; a finger or held button is a real aim
    const pressed = e.buttons > 0 || e.pointerType !== 'mouse'
    // a slide off the board cancels
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return setAim(null)
    const line = nearest(e)
    setAim(line === null ? null : { line, pressed })
  }
  const up = (e: PointerEvent<SVGSVGElement>) => {
    if (!myTurn || !aim?.pressed) return
    const line = nearest(e)
    setAim(null)
    if (line !== null && line === aim.line) onPlay(line)
  }

  // never show an aim that has since been drawn or that isn't ours to make
  const shownAim = myTurn && aim && live.lines[aim.line] === '.' ? aim : null
  const loser = live.result && live.result.winner !== -1 ? String(1 - live.result.winner) : null

  return (
    <div className={`db-board${myTurn ? ' db-board--live' : ''}${over ? ' db-board--over' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${W}`}
        className="db-svg"
        role="img"
        aria-label={`Dots and Boxes board, ${n} by ${n}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setAim(null)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setAim(null)}
      >
        {/* claimed boxes: a light tint of the owner's colour, under the lines */}
        {live.boxes.split('').map((v, b) => {
          if (v === '.') return null
          const x = M + (b % n) * U
          const y = M + Math.floor(b / n) * U
          const fresh = !!live.closed?.includes(b)
          return (
            <g key={b} className={`db-box db-box--${v}${fresh ? ' db-box--new' : ''}${v === loser ? ' db-box--lost' : ''}`}>
              <rect x={x} y={y} width={U} height={U} />
              <text x={x + U / 2} y={y + U / 2 + 1} textAnchor="middle" dominantBaseline="central">
                {initials[Number(v)]}
              </text>
            </g>
          )
        })}

        {/* the newest line sits on a yellow glow, so you can always see the last move */}
        {live.last >= 0 && live.lines[live.last] !== '.' && (
          <line
            key={`glow-${live.last}`}
            className="db-glow"
            {...(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }))(ends(n, live.last))}
          />
        )}

        {/* lines: faint guides where they can go, and each drawn line in the colour of whoever drew it */}
        {Array.from({ length: lineCount(n) }, (_, i) => {
          const [x1, y1, x2, y2] = ends(n, i)
          const v = live.lines[i]
          if (v === '.') return <line key={i} className="db-guide" x1={x1} y1={y1} x2={x2} y2={y2} />
          const last = i === live.last
          return (
            <line
              key={`${i}${last ? '-last' : ''}`}
              className={`db-line db-line--${v}${last ? ' db-line--last' : ''}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              pathLength={1}
            />
          )
        })}

        {shownAim && (
          <line
            className={`db-aim db-aim--${mySeat}${shownAim.pressed ? ' db-aim--pressed' : ''}`}
            {...(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }))(ends(n, shownAim.line))}
          />
        )}

        {/* dots on top, so every line meets them cleanly */}
        {Array.from({ length: (n + 1) * (n + 1) }, (_, d) => (
          <rect
            key={d}
            className="db-dot"
            x={M + (d % (n + 1)) * U - DOT / 2}
            y={M + Math.floor(d / (n + 1)) * U - DOT / 2}
            width={DOT}
            height={DOT}
          />
        ))}
      </svg>
    </div>
  )
}

/** A small seat-coloured square for the HUD (whose turn) — draw shows an "=". */
export function Swatch({ seat }: { seat: Seat | null }) {
  if (seat === null) return <span className="db-mini db-mini--draw">=</span>
  return <span className={`db-mini db-mini--${seat}`} aria-hidden="true" />
}
