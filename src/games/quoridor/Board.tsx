import { useState, type PointerEvent } from 'react'
import type { Seat } from '../../lobby/rooms'
import { N, blocksOf, colOf, pawnMoves, rowOf, wallOf, wallProblem, type Live } from './engine'

/** Groove width between squares, and one square plus its groove, in board units (a square is 1). */
const G = 0.26
const U = 1 + G
const SIDE = N + (N - 1) * G
const PAD = 0.28

export interface Preview {
  down: boolean
  at: number
}

interface Props {
  live: Live
  /** whose hands the board is in: their pawn's moves are shown and their walls go down */
  seat: Seat
  /** may `seat` act right now? */
  active: boolean
  /** draw it from seat 1's side (online), so your pawn always starts at the bottom */
  flipped: boolean
  preview: Preview | null
  onPreview: (p: Preview | null) => void
  onMove: (to: number) => void
  onWall: (p: Preview) => void
}

const problemText = {
  'none left': 'No walls left',
  off: 'Off the board',
  overlap: 'Crosses another wall',
  sealed: 'Would shut a pawn in',
} as const

/** Why the previewed wall can't go down, or null if it can. */
export function previewProblem(live: Live, seat: Seat, p: Preview) {
  const why = wallProblem(live, seat, p.down, p.at)
  return why ? problemText[why] : null
}

/**
 * Tap a lit square to move there. Tap a groove between squares to try a wall there: it shows as a
 * ghost, along whichever groove you were nearer; tap the same spot again (or Place) to put it down.
 * With a mouse, the ghost follows the pointer and a click places it.
 */
export function QuoridorBoard({ live, seat, active, flipped, preview, onPreview, onMove, onWall }: Props) {
  const [hover, setHover] = useState<Preview | null>(null)
  const targets = active ? pawnMoves(live.pos, seat, blocksOf(live.walls ?? [])) : []
  const canWall = active && live.left[seat] > 0

  // board square / wall anchor ↔ where it's drawn
  const sq = (i: number) => (flipped ? N * N - 1 - i : i)
  const anchor = (at: number) => (flipped ? 63 - at : at)
  const xy = (i: number) => {
    const d = sq(i)
    return [colOf(d) * U, rowOf(d) * U]
  }

  /** What a point on the board means: a square to move to, a wall spot, or nothing. */
  const read = (e: PointerEvent<SVGSVGElement>): { to: number } | { wall: Preview } | null => {
    const svg = e.currentTarget
    const m = svg.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const { x, y } = p
    const dc = Math.floor(x / U)
    const dr = Math.floor(y / U)
    if (dc >= 0 && dc < N && dr >= 0 && dr < N && x - dc * U <= 1 && y - dr * U <= 1) {
      const i = sq(dr * N + dc)
      if (targets.includes(i)) return { to: i }
    }
    if (!canWall) return null
    const C = Math.min(7, Math.max(0, Math.round((x - 1 - G / 2) / U)))
    const R = Math.min(7, Math.max(0, Math.round((y - 1 - G / 2) / U)))
    const dx = Math.abs(x - (C * U + 1 + G / 2))
    const dy = Math.abs(y - (R * U + 1 + G / 2))
    // the middle of a square isn't near any groove
    if (Math.min(dx, dy) > 0.5) return null
    return { wall: { down: dx < dy, at: anchor(R * 8 + C) } }
  }

  const same = (a: Preview | null, b: Preview | null) => !!a && !!b && a.down === b.down && a.at === b.at

  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!active) return
    const hit = read(e)
    if (!hit) return onPreview(null)
    if ('to' in hit) {
      onPreview(null)
      return onMove(hit.to)
    }
    const ok = !previewProblem(live, seat, hit.wall)
    // a mouse places straight away; a finger tries it first, then taps it again to place
    if (ok && (e.pointerType === 'mouse' || same(hit.wall, preview))) {
      onPreview(null)
      setHover(null)
      return onWall(hit.wall)
    }
    onPreview(hit.wall)
  }
  const onMoveOver = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || !canWall) return
    const hit = read(e)
    setHover(hit && 'wall' in hit ? hit.wall : null)
  }

  const ghost = preview ?? hover
  const ghostBad = ghost ? !!previewProblem(live, seat, ghost) : false
  const wallRect = (down: boolean, at: number) => {
    const a = anchor(at)
    const R = Math.floor(a / 8)
    const C = a % 8
    return down ? { x: C * U + 1, y: R * U, width: G, height: 2 + G } : { x: C * U, y: R * U + 1, width: 2 + G, height: G }
  }

  const walls = live.walls ?? []
  const lastWall = live.last?.wall
  // goal rows as drawn: orange races for the top unless flipped
  const goalOf = (dr: number): Seat | null => (dr === 0 ? (flipped ? 1 : 0) : dr === N - 1 ? (flipped ? 0 : 1) : null)

  return (
    <svg
      className={`qr-board${active ? ' qr-board--live' : ''}${live.result ? ' qr-board--over' : ''}`}
      viewBox={`${-PAD} ${-PAD} ${SIDE + PAD * 2} ${SIDE + PAD * 2}`}
      role="img"
      aria-label="Quoridor board"
      onPointerUp={onUp}
      onPointerMove={onMoveOver}
      onPointerLeave={() => setHover(null)}
    >
      <rect x={-PAD} y={-PAD} width={SIDE + PAD * 2} height={SIDE + PAD * 2} className="qr-frame" />
      {Array.from({ length: N * N }, (_, d) => {
        const dr = Math.floor(d / N)
        const dc = d % N
        const i = sq(d)
        const goal = goalOf(dr)
        const last = live.last?.from === i || live.last?.to === i
        return (
          <rect
            key={d}
            x={dc * U}
            y={dr * U}
            width={1}
            height={1}
            className={`qr-sq${goal !== null ? ` qr-sq--goal${goal}` : ''}${last ? ' qr-sq--last' : ''}`}
          />
        )
      })}

      {targets.map((i) => {
        const [x, y] = xy(i)
        return <circle key={`t${i}`} cx={x + 0.5} cy={y + 0.5} r={0.17} className={`qr-dot qr-dot--${seat}`} />
      })}

      {([0, 1] as Seat[]).map((s) => {
        const [x, y] = xy(live.pos[s])
        return (
          <g key={`p${s}`} className="qr-pawn-move" style={{ transform: `translate(${x + 0.5}px, ${y + 0.5}px)` }}>
            <circle r={0.36} className={`qr-pawn qr-pawn--${s}${active && s === seat ? ' qr-pawn--on' : ''}`} />
          </g>
        )
      })}

      {walls.map((code) => {
        const w = wallOf(code)
        return <rect key={code} {...wallRect(w.down, w.at)} className={`qr-wall qr-wall--${w.seat}${code === lastWall ? ' qr-wall--new' : ''}`} />
      })}

      {ghost && <rect {...wallRect(ghost.down, ghost.at)} className={`qr-wall qr-ghost qr-wall--${seat}${ghostBad ? ' qr-ghost--bad' : ''}`} />}
    </svg>
  )
}

/** A small pawn for the HUD (whose turn). */
export function Pawn({ seat }: { seat: Seat }) {
  return (
    <svg className="qr-mini" viewBox="-1 -1 2 2" aria-hidden="true">
      <circle r={0.8} className={`qr-pawn qr-pawn--${seat}`} />
    </svg>
  )
}
