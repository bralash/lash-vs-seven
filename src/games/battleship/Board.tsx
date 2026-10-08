import { useState, type MouseEvent } from 'react'
import { useSound } from '../../lib/sound'
import { CELLS, FLEET, SIZE, cellsOf, fits, randomLayout, type Layout, type Placed, type Sunk } from './engine'
import { ShipSprite, shipImage } from './Ships'

const COLS = 'ABCDEFGHIJ'
export const cellName = (i: number) => `${COLS[i % SIZE]}${Math.floor(i / SIZE) + 1}`

/* ── The secret fleet, on this device only ──────────────────────────── */

export interface Secret {
  layout: string
  salt: string
}
const secretKey = (id: string) => `lvs_bs_${id}`
export function loadSecret(id: string): Secret | null {
  try {
    const raw = sessionStorage.getItem(secretKey(id))
    return raw ? (JSON.parse(raw) as Secret) : null
  } catch {
    return null
  }
}
export function saveSecret(id: string, s: Secret) {
  try {
    sessionStorage.setItem(secretKey(id), JSON.stringify(s))
  } catch {
    /* storage blocked: the fleet lives in memory for this page only */
  }
}

/* ── One player's waters ────────────────────────────────────────────── */

interface WatersProps {
  /** ships drawn whole: your own fleet, or every ship once revealed */
  ships?: Placed[]
  /** enemy ships found and sunk (drawn as wrecks) */
  sunk?: Sunk[]
  shots?: number[]
  hits?: number[]
  /** a shot waiting for its answer */
  pending?: number
  /** tapping a square does something */
  onTap?: (cell: number) => void
  /** squares that can be fired at glow on hover */
  armed?: boolean
  /** placement: the picked-up ship, and a square that just refused a move */
  selected?: string | null
  bad?: number[]
  label: string
}

const PAD = 0.62
const GAP = 0.06

/** The 10×10 sea: ships, wrecks, splashes and hits. One tap handler for the whole board. */
export function WatersGrid({ ships, sunk, shots = [], hits = [], pending, onTap, armed, selected, bad, label }: WatersProps) {
  const hitSet = new Set(hits)
  const last = shots[shots.length - 1]
  const off = PAD
  const view = `${-off} ${-off} ${SIZE + off + 0.04} ${SIZE + off + 0.04}`
  const tap = (e: MouseEvent<SVGSVGElement>) => {
    if (!onTap) return
    const m = e.currentTarget.getScreenCTM()
    if (!m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const c = Math.floor(p.x)
    const r = Math.floor(p.y)
    if (c < 0 || r < 0 || c >= SIZE || r >= SIZE) return
    onTap(r * SIZE + c)
  }
  const sunkIds = new Set((sunk ?? []).map((s) => s.id))
  // squares of sunk ships get a small hit mark, so the wreck shows through
  const wrecked = new Set([...(sunk ?? []).flatMap((s) => s.cells), ...(ships ?? []).filter((p) => sunkIds.has(p.id)).flatMap((p) => cellsOf(p) ?? [])])

  return (
    <svg
      className={`bs-grid${armed ? ' bs-grid--armed' : ''}${onTap ? ' bs-grid--tap' : ''}`}
      viewBox={view}
      onClick={tap}
      role="img"
      aria-label={label}
    >
      <rect x={-off} y={-off} width={SIZE + off + 0.04} height={SIZE + off + 0.04} className="bs-grid__bg" />
      {Array.from({ length: SIZE }, (_, k) => (
        <g key={k} className="bs-grid__label">
          <text x={k + 0.5} y={-0.18} textAnchor="middle">{COLS[k]}</text>
          <text x={-0.3} y={k + 0.62} textAnchor="middle">{k + 1}</text>
        </g>
      ))}
      {Array.from({ length: CELLS }, (_, i) => (
        <rect key={i} x={(i % SIZE) + GAP} y={Math.floor(i / SIZE) + GAP} width={1 - GAP * 2} height={1 - GAP * 2} className="bs-sea" />
      ))}

      {/* whole ships: yours, or everyone's once revealed */}
      {ships?.map((p) => (
        <Hull key={p.id} p={p} sunk={sunkIds.has(p.id)} cls={`bs-ship${p.id === selected ? ' bs-ship--sel' : ''}`} />
      ))}
      {/* enemy wrecks */}
      {!ships &&
        sunk?.map((s) => {
          const down = s.cells.length > 1 && s.cells[1] - s.cells[0] === SIZE
          return <Hull key={s.id} p={{ id: s.id, at: s.cells[0], down }} sunk cls="bs-ship" />
        })}

      {bad?.map((c) => (
        <rect key={`bad${c}`} x={(c % SIZE) + GAP} y={Math.floor(c / SIZE) + GAP} width={1 - GAP * 2} height={1 - GAP * 2} className="bs-bad" />
      ))}

      {shots.map((c) => {
        const x = (c % SIZE) + 0.5
        const y = Math.floor(c / SIZE) + 0.5
        return hitSet.has(c) ? (
          <g key={c} className={`bs-hit${c === last ? ' bs-hit--last' : ''}${wrecked.has(c) ? ' bs-hit--wreck' : ''}`}>
            <circle cx={x} cy={y} r={0.3} />
            <path d={`M${x - 0.17} ${y - 0.17}L${x + 0.17} ${y + 0.17}M${x + 0.17} ${y - 0.17}L${x - 0.17} ${y + 0.17}`} />
          </g>
        ) : (
          <circle key={c} cx={x} cy={y} r={0.13} className={`bs-miss${c === last ? ' bs-miss--last' : ''}`} />
        )
      })}

      {pending !== undefined && (
        <g className="bs-aim">
          <circle cx={(pending % SIZE) + 0.5} cy={Math.floor(pending / SIZE) + 0.5} r={0.34} />
          <path
            d={`M${(pending % SIZE) + 0.5} ${Math.floor(pending / SIZE) + 0.05}v0.25M${(pending % SIZE) + 0.5} ${Math.floor(pending / SIZE) + 0.7}v0.25M${(pending % SIZE) + 0.05} ${Math.floor(pending / SIZE) + 0.5}h0.25M${(pending % SIZE) + 0.7} ${Math.floor(pending / SIZE) + 0.5}h0.25`}
          />
        </g>
      )}
    </svg>
  )
}

function Hull({ p, sunk, cls }: { p: Placed; sunk?: boolean; cls: string }) {
  const cells = cellsOf(p)
  if (!cells) return null
  return <ShipSprite id={p.id} len={cells.length} col={p.at % SIZE} row={Math.floor(p.at / SIZE)} down={p.down} sunk={sunk} cls={cls} />
}

/* ── Placing the fleet ──────────────────────────────────────────────── */

/**
 * Tap-only placement: the fleet starts shuffled; tap a ship to pick it up, tap it again to turn it,
 * tap a square to move it there.
 */
export function FleetPlacer({ onLock, who }: { onLock: (layout: Layout) => void; who?: string }) {
  const [layout, setLayout] = useState<Layout>(() => randomLayout())
  const [sel, setSel] = useState<string | null>(null)
  const [bad, setBad] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const { play } = useSound()

  const refuse = (cells: number[]) => {
    play('error')
    setBad(cells)
    setTimeout(() => setBad([]), 450)
  }
  const put = (p: Placed) => setLayout((l) => l.map((q) => (q.id === p.id ? p : q)))

  const onTap = (cell: number) => {
    const here = layout.find((p) => cellsOf(p)!.includes(cell))
    if (here && here.id !== sel) {
      setSel(here.id)
      play('tap')
      return
    }
    if (here && here.id === sel) {
      // turn it, keeping the tapped square inside the ship if the corner spot doesn't fit
      const len = cellsOf(here)!.length
      const down = !here.down
      const tries = [here.at, ...Array.from({ length: len }, (_, k) => cell - k * (down ? SIZE : 1))]
      const ok = tries.map((at) => ({ ...here, at, down })).find((p) => fits(layout, p))
      if (ok) {
        put(ok)
        play('tap')
      } else refuse(cellsOf(here)!)
      return
    }
    if (!sel) return
    // move the picked-up ship here, nudged back from the edge if it would run off
    const ship = layout.find((p) => p.id === sel)!
    const len = cellsOf(ship)!.length
    const r = Math.floor(cell / SIZE)
    const c = cell % SIZE
    const at = ship.down ? Math.min(r, SIZE - len) * SIZE + c : r * SIZE + Math.min(c, SIZE - len)
    const p = { ...ship, at }
    if (fits(layout, p)) {
      put(p)
      play('tap')
    } else refuse(cellsOf(p) ?? [cell])
  }

  return (
    <div className="bs-place">
      <p className="bs-place__hint">
        {sel ? 'Tap a square to move it · tap it again to turn it' : 'Tap a ship to pick it up'}
      </p>
      <WatersGrid ships={layout} selected={sel} bad={bad} onTap={onTap} label={`${who ?? 'Your'} fleet, being placed`} />
      <div className="bs-place__actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setLayout(randomLayout())
            setSel(null)
            play('tap')
          }}
        >
          Shuffle
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            onLock(layout)
          }}
        >
          Ready <span className="keycap">↵</span>
        </button>
      </div>
    </div>
  )
}

/* ── Ships still afloat ─────────────────────────────────────────────── */

export function FleetStatus({ sunk, label }: { sunk: Sunk[]; label: string }) {
  const down = new Set(sunk.map((s) => s.id))
  return (
    <ul className="bs-fleet" aria-label={label}>
      {FLEET.map((s) => (
        <li key={s.id} className={down.has(s.id) ? 'bs-fleet__ship bs-fleet__ship--sunk' : 'bs-fleet__ship'} title={s.name}>
          <img src={shipImage(s.id, down.has(s.id))} alt="" style={{ width: s.len * 14 }} />
          <span className="visually-hidden">
            {s.name}
            {down.has(s.id) ? ' (sunk)' : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
