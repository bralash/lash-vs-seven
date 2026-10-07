import { useEffect, useRef, useState } from 'react'
import type { Seat } from '../../lobby/rooms'
import { legalMoves, sideOf, sowPath, type Live } from './engine'

/** Pause between seeds: big pits sow a little faster so a lap doesn't drag. */
const seedMs = (count: number) => Math.max(70, 150 - count * 4)
const TAKE_MS = 650

/** How long the last move takes to play out on screen (results wait for it). */
export function sowMs(live: Live) {
  const l = live.last
  if (!l) return 0
  const n = l.before[l.pit]
  return (n + 1) * seedMs(n) + ((l.took ?? []).length ? TAKE_MS + 300 : 0)
}

export interface Sowing {
  /** what each pit shows right now (mid-animation, or the real position) */
  pits: number[]
  from: number | null
  /** the pit that just received a seed */
  lit: number | null
  /** pits being captured */
  taking: number[]
  busy: boolean
}

/**
 * Replays each new move seed by seed — the database already holds the result, this just shows
 * how it got there. A refresh mid-game shows the position as it is, without replaying.
 */
export function useSowing(live: Live, onSeed?: () => void, onTake?: () => void): Sowing {
  const [view, setView] = useState<Sowing>({ pits: live.pits, from: null, lit: null, taking: [], busy: false })
  const seen = useRef(live.moves)
  const cbs = useRef({ onSeed, onTake })
  cbs.current = { onSeed, onTake }

  useEffect(() => {
    if (live.moves === seen.current) {
      // same move (or a fresh match) — just make sure we're showing the real position
      if (!live.last || live.moves === 0) setView({ pits: live.pits, from: null, lit: null, taking: [], busy: false })
      return
    }
    seen.current = live.moves
    const l = live.last
    if (!l) {
      setView({ pits: live.pits, from: null, lit: null, taking: [], busy: false })
      return
    }
    const timers: number[] = []
    const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms))
    const count = l.before[l.pit]
    const path = sowPath(l.pit, count)
    const step = seedMs(count)
    const pits = [...l.before]
    pits[l.pit] = 0
    setView({ pits: [...pits], from: l.pit, lit: null, taking: [], busy: true })
    path.forEach((slot, i) =>
      at((i + 1) * step, () => {
        pits[slot]++
        setView((v) => ({ ...v, pits: [...pits], lit: slot }))
        cbs.current.onSeed?.()
      }),
    )
    const sown = (path.length + 1) * step
    const took = l.took ?? []
    if (took.length) {
      at(sown, () => {
        setView((v) => ({ ...v, lit: null, taking: took }))
        cbs.current.onTake?.()
      })
      at(sown + TAKE_MS, () => setView({ pits: live.pits, from: null, lit: null, taking: [], busy: false }))
    } else {
      at(sown, () => setView({ pits: live.pits, from: null, lit: null, taking: [], busy: false }))
    }
    return () => timers.forEach(clearTimeout)
    // live.pits/last change together with live.moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.moves])

  return view
}

interface Props {
  live: Live
  view: Sowing
  /** whose row is drawn along the bottom (online: yours; pass & play: seat 0) */
  bottom: Seat
  /** the seat allowed to sow now, or null */
  active: Seat | null
  onSow: (pit: number) => void
}

/**
 * Two rows of six pits. Sowing runs counter-clockwise: along the bottom row left to right, then
 * back along the top row right to left. Pits show their seeds (or a number once there are lots).
 */
export function OwareBoard({ live, view, bottom, active, onSow }: Props) {
  const top = (1 - bottom) as Seat
  const legal = new Set(active !== null && !view.busy ? legalMoves(live.pits, active) : [])
  const rows: [Seat, number[]][] = [
    [top, [...sideOf(top)].reverse()],
    [bottom, sideOf(bottom)],
  ]
  const taking = new Set(view.taking)

  return (
    <div className={`ow-board${legal.size ? ' ow-board--live' : ''}`} role="grid" aria-label="Oware board">
      {rows.map(([seat, pits]) => (
        <div key={seat} className={`ow-row ow-row--${seat}`} role="row">
          {pits.map((i) => {
            const n = view.pits[i]
            const can = legal.has(i)
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={[
                  'ow-pit',
                  can && 'ow-pit--legal',
                  view.from === i && 'ow-pit--from',
                  view.lit === i && 'ow-pit--lit',
                  taking.has(i) && `ow-pit--take ow-pit--take-${live.last?.seat ?? 0}`,
                  !view.busy && live.last?.pit === i && 'ow-pit--last',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => can && onSow(i)}
                disabled={!can}
                aria-label={`${n} seed${n === 1 ? '' : 's'}${can ? ', sow from here' : ''}`}
              >
                <Seeds n={n} />
                <span className="ow-pit__n">{n}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Up to 12 seeds drawn loose in the pit; past that, just the number. */
function Seeds({ n }: { n: number }) {
  if (n === 0) return null
  if (n > 12) return <span className="ow-pit__big">{n}</span>
  return (
    <span className={`ow-seeds ow-seeds--${n > 6 ? 'lots' : n > 2 ? 'some' : 'few'}`} aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <i key={k} />
      ))}
    </span>
  )
}
