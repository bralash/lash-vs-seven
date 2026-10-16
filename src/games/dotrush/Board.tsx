import { useRef, useState, type PointerEvent } from 'react'
import { CELLS, HUES, SIZE, colOf, inside, loopAt, rowOf, touching, type Dot } from './engine'

interface Props {
  dots: Dot[]
  disabled: boolean
  /** blank board (the countdown) */
  hidden?: boolean
  onPathChange?: (path: number[]) => void
  onLine: (path: number[]) => void
}

/** a dot catches the finger inside this much of its square */
const HIT = 0.45
/** fast swipes are sampled this often (fraction of a square) so no dot is skipped */
const SAMPLE = 0.2

export function Board({ dots, disabled, hidden = false, onPathChange, onLine }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<number[]>([])
  const pathRef = useRef<number[]>([])
  const pointer = useRef<number | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  const update = (next: number[]) => {
    if (next.length > pathRef.current.length) navigator.vibrate?.(loopAt(next) >= 0 ? 30 : 8)
    pathRef.current = next
    setPath(next)
    onPathChange?.(next)
  }

  const pitch = () => (wrapRef.current?.clientWidth ?? 300) / SIZE
  const at = (e: PointerEvent) => {
    const box = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const dotAt = (p: { x: number; y: number }) => {
    const w = pitch()
    const c = Math.floor(p.x / w)
    const r = Math.floor(p.y / w)
    if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return -1
    return Math.hypot(p.x - (c + 0.5) * w, p.y - (r + 0.5) * w) <= w * HIT ? r * SIZE + c : -1
  }

  /** one dot entered: extend, step back, or close a loop */
  const enter = (cur: number[], t: number): number[] => {
    if (!cur.length) return [t]
    const end = cur[cur.length - 1]
    if (t === end) return cur
    if (cur.length > 1 && t === cur[cur.length - 2]) return cur.slice(0, -1)
    // once a loop is closed, the only way on is back
    if (loopAt(cur) >= 0) return cur
    if (!touching(end, t) || dots[t].c !== dots[cur[0]].c) return cur
    if (cur.includes(t)) return loopAt([...cur, t]) >= 0 ? [...cur, t] : cur
    return [...cur, t]
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    pointer.current = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* tracking works without capture */
    }
    const p = at(e)
    last.current = p
    const t = dotAt(p)
    update(t >= 0 ? [t] : [])
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointer.current || disabled) return
    const to = at(e)
    const from = last.current ?? to
    last.current = to
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (pitch() * SAMPLE)))
    let cur = pathRef.current
    for (let s = 1; s <= steps; s++) {
      const t = dotAt({ x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps })
      if (t >= 0) cur = cur.length ? enter(cur, t) : [t]
    }
    if (cur !== pathRef.current) update(cur)
  }

  const finish = (e: PointerEvent<HTMLDivElement>, play: boolean) => {
    if (e.pointerId !== pointer.current) return
    pointer.current = null
    last.current = null
    const line = pathRef.current
    update([])
    if (play && line.length >= 2) onLine(line)
  }

  // a closed loop lights every dot of its colour, and marks the ones it goes round as bombs
  const k = loopAt(path)
  const colour = path.length ? dots[path[0]]?.c : -1
  const bombs = k >= 0 ? new Set(inside(path.slice(k, -1)).filter((i) => dots[i].c !== colour)) : new Set<number>()
  const on = new Set(path)
  const centre = (i: number) => `${((colOf(i) + 0.5) / SIZE) * 100} ${((rowOf(i) + 0.5) / SIZE) * 100}`

  return (
    <div
      ref={wrapRef}
      className={`dr-board${disabled ? ' dr-board--locked' : ''}${k >= 0 ? ' dr-board--loop' : ''}`}
      style={k >= 0 ? { ['--loop' as string]: HUES[colour] } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onContextMenu={(e) => e.preventDefault()}
      role="grid"
      aria-label="Dots"
      aria-disabled={disabled}
    >
      <svg className="dr-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {path.length > 1 && <polyline points={path.map(centre).join(' ')} stroke={HUES[colour]} />}
      </svg>
      {!hidden &&
        Array.from({ length: CELLS }, (_, i) => {
          const d = dots[i]
          const lit = on.has(i) || (k >= 0 && d.c === colour)
          return (
            <span
              key={d.id}
              className={`dr-dot${lit ? ' dr-dot--on' : ''}${bombs.has(i) ? ' dr-dot--bomb' : ''}`}
              style={{ left: `${(colOf(i) / SIZE) * 100}%`, top: `${(rowOf(i) / SIZE) * 100}%`, ['--c' as string]: HUES[d.c] }}
            >
              <i />
            </span>
          )
        })}
    </div>
  )
}
