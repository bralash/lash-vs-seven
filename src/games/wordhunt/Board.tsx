import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { SIZE, colOf, isAdjacent, rowOf } from './engine'

export interface Flash {
  cells: number[]
  kind: 'good' | 'bad' | 'dupe'
  /** changes on every flash so repeated flashes re-trigger */
  id: number
}

interface Props {
  grid: readonly string[]
  disabled: boolean
  /** blank the letters (e.g. during the countdown) */
  hidden?: boolean
  flash: Flash | null
  onPathChange: (path: number[]) => void
  onTrace: (path: number[]) => void
}

type Point = { x: number; y: number }

/**
 * Hit radius as a fraction of the tile pitch. A tile only "catches" the pointer inside
 * this circle, so a diagonal swipe — which crosses the corner gap ~0.71 pitches from the
 * neighbouring tiles' centres — can't clip the tiles beside it, while a straight swipe
 * still has a generous target.
 */
const HIT = 0.42
/** Pointer movement is sampled at this fraction of the pitch so fast flicks don't skip tiles. */
const SAMPLE = 0.2

export function Board({ grid, disabled, hidden = false, flash, onPathChange, onTrace }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<number[]>([])
  const pathRef = useRef<number[]>([])
  const centers = useRef<Point[]>([])
  const pitch = useRef(60)
  const measuredW = useRef(0)
  const pointer = useRef<number | null>(null)
  const lastPt = useRef<Point | null>(null)

  // The flip-in "deal" only runs when letters appear (new grid, or revealed after the countdown).
  // If it were always on, a tile losing its flash class would fall back to it and flip in again.
  const [dealing, setDealing] = useState(true)
  const gridKey = grid.join('')
  useEffect(() => {
    if (hidden) return
    setDealing(true)
    const t = setTimeout(() => setDealing(false), 900)
    return () => clearTimeout(t)
  }, [gridKey, hidden])

  const update = (next: number[]) => {
    if (next.length > pathRef.current.length) navigator.vibrate?.(8)
    pathRef.current = next
    setPath(next)
    onPathChange(next)
  }

  // Layout offsets, not getBoundingClientRect: tiles animate (flip-in, flash, press-down) and
  // transformed boxes would put the hit circles in the wrong place mid-animation.
  const measure = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    centers.current = Array.from(wrap.querySelectorAll<HTMLElement>('[data-i]')).map((el) => ({
      x: el.offsetLeft + el.offsetWidth / 2,
      y: el.offsetTop + el.offsetHeight / 2,
    }))
    const c = centers.current
    pitch.current = c.length > 1 ? Math.abs(c[1].x - c[0].x) : 60
    measuredW.current = wrap.offsetWidth
  }

  const local = (e: PointerEvent): Point => {
    const box = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  /** Tile whose hit circle contains p, if any. */
  const tileAt = (p: Point) => {
    const r = pitch.current * HIT
    for (let i = 0; i < centers.current.length; i++) {
      const c = centers.current[i]
      if (Math.hypot(p.x - c.x, p.y - c.y) <= r) return i
    }
    return -1
  }

  /** Apply one entered tile to the path: extend, backtrack, or ignore. */
  const enter = (cur: number[], t: number): number[] => {
    if (!cur.length) return [t]
    const last = cur[cur.length - 1]
    if (t === last) return cur
    if (cur.length > 1 && t === cur[cur.length - 2]) return cur.slice(0, -1) // step back
    if (cur.includes(t)) return cur // tiles can't be reused
    if (isAdjacent(last, t)) return [...cur, t]
    // A sloppy straight swipe can miss the middle tile's circle; fill it in.
    const dr = rowOf(t) - rowOf(last)
    const dc = colOf(t) - colOf(last)
    if (Math.abs(dr) <= 2 && Math.abs(dc) <= 2 && (dr % 2 === 0) && (dc % 2 === 0)) {
      const mid = (rowOf(last) + dr / 2) * SIZE + colOf(last) + dc / 2
      if (!cur.includes(mid)) return [...cur, mid, t]
    }
    return cur
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    measure()
    pointer.current = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone — tracking still works without capture */
    }
    const p = local(e)
    lastPt.current = p
    const t = tileAt(p)
    // Pressing in a gap still arms the drag; the first tile entered starts the word.
    update(t >= 0 ? [t] : [])
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointer.current || disabled) return
    // the board can resize mid-drag (rotation, mobile browser bars changing the viewport height)
    if (wrapRef.current && wrapRef.current.offsetWidth !== measuredW.current) measure()
    const to = local(e)
    const from = lastPt.current ?? to
    lastPt.current = to
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (pitch.current * SAMPLE)))
    let cur = pathRef.current
    for (let s = 1; s <= steps; s++) {
      const t = tileAt({ x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps })
      if (t >= 0) cur = enter(cur, t)
    }
    if (cur !== pathRef.current) update(cur)
  }

  const finish = (e: PointerEvent<HTMLDivElement>, submit: boolean) => {
    if (e.pointerId !== pointer.current) return
    pointer.current = null
    lastPt.current = null
    const traced = pathRef.current
    update([])
    if (submit && traced.length) onTrace(traced)
  }

  // Alternating between two identical animations re-triggers the flash without remounting the tile.
  const flashOf = (i: number) => (flash && flash.cells.includes(i) ? ` wh-tile--${flash.kind}-${flash.id % 2}` : '')
  const pts = path.map((i) => centers.current[i]).filter(Boolean)

  return (
    <div
      ref={wrapRef}
      className={`wh-board${disabled ? ' wh-board--locked' : ''}${dealing ? ' wh-board--deal' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => finish(e, true)}
      // the OS took the gesture (scroll, call, notification) — drop the word rather than submit half of it
      onPointerCancel={(e) => finish(e, false)}
      onContextMenu={(e) => e.preventDefault()}
      role="grid"
      aria-label="Letter grid"
      aria-disabled={disabled}
    >
      {Array.from({ length: SIZE }, (_, r) => (
        <div role="row" key={r} className="wh-row">
          {Array.from({ length: SIZE }, (_, c) => {
            const i = r * SIZE + c
            const on = path.includes(i)
            return (
              <div
                key={i}
                role="gridcell"
                data-i={i}
                className={`wh-tile${on ? ' wh-tile--on' : ''}${i === path[path.length - 1] ? ' wh-tile--head' : ''}${flashOf(i)}`}
                style={{ animationDelay: `${i * 25}ms` }}
              >
                {hidden ? '' : grid[i]}
              </div>
            )
          })}
        </div>
      ))}
      <svg className="wh-path" aria-hidden="true">
        {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 10 : 6} />
        ))}
      </svg>
    </div>
  )
}
