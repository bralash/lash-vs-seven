import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chip } from '../components/Chip'
import { OpsFace, useCrewLook } from '../components/OpsFace'
import { levelLabel } from '../match/bot'
import { floorsFor, TOP, twistLine, type Floor } from '../tower/floors'
import { TowerCrown } from '../tower/TowerCrown'
import { Hearts } from '../tower/TowerSheet'
import '../styles/tower.css'
import '../styles/towermap.css'

/*
 * Dev-only sandbox (route: /dev/towermap): Ops' Tower as a road trip instead of a building. A road
 * winds up the page from floor 1 at the bottom to Ops' tower in the city at the top; each guardian
 * lives in a house on their own little island along the way, and the land changes as you climb
 * (fields, savanna, forest, city). Your character waits on the road at your floor.
 */

/* ── the map's geometry (SVG units; the map scales to the screen's width) ── */
const W = 400
const GAP = 168
const BOTTOM = 150
const TOP_ROOM = 330
const H = BOTTOM + (TOP - 1) * GAP + TOP_ROOM
/** where floor n's stop is on the road */
const stop = (n: number) => ({ x: n === TOP ? 200 : n % 2 ? 132 : 268, y: H - BOTTOM - (n - 1) * GAP })
/** which side of the road the house sits on (outwards from the bend) */
const side = (n: number) => (n % 2 ? -1 : 1)
const house = (n: number) => {
  const s = stop(n)
  return n === TOP ? { x: 200, y: s.y - 70 } : { x: s.x + side(n) * 78, y: s.y - 6 }
}

type Zone = 'field' | 'savanna' | 'forest' | 'city'
const zoneOf = (n: number): Zone => (n <= 3 ? 'field' : n <= 6 ? 'savanna' : n <= 9 ? 'forest' : 'city')
const GROUND: Record<Zone, { top: string; side: string }> = {
  field: { top: '#9ed36a', side: '#5f9a3c' },
  savanna: { top: '#f4c27a', side: '#c98a3a' },
  forest: { top: '#5cb06a', side: '#2f7a45' },
  city: { top: '#d9d2c4', side: '#9d958a' },
}
const WALLS = ['#ff5a1f', '#2d5bff', '#ffd23f', '#9b3fd6', '#1f9d55', '#e8291c', '#f3ead8', '#17a2b8', '#ff8fb1']

/** a hex colour, darker by `k` (0–1) */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * (1 - k))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

/** a small seeded random, so the map looks the same every time */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** An island: a lumpy flat top with its earth showing underneath, like a low-poly tile. */
function Island({ x, y, rx, seed, zone }: { x: number; y: number; rx: number; seed: number; zone: Zone }) {
  const r = rng(seed)
  const ry = rx * 0.52
  const n = 11
  const ring: [number, number][] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const k = 0.82 + r() * 0.3
    return [x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]
  })
  const drop = 12
  const g = GROUND[zone]
  return (
    <g className="tm-island">
      <polygon points={pts(ring.map(([a, b]) => [a, b + drop]))} fill={g.side} />
      {/* the front edge, joining the top to the earth below */}
      {ring.map(([a, b], i) => {
        const [c, d] = ring[(i + 1) % n]
        if (b < y - ry * 0.2 && d < y - ry * 0.2) return null
        return <polygon key={i} points={pts([[a, b], [c, d], [c, d + drop], [a, b + drop]])} fill={i % 2 ? g.side : shade(g.side, 0.12)} />
      })}
      <polygon points={pts(ring)} fill={g.top} />
      {/* a few facets catching the light */}
      {ring.slice(0, 4).map(([a, b], i) => (
        <polygon key={`f${i}`} points={pts([[x, y], [a, b], ring[(i + 1) % n]])} fill="#fff" opacity={0.05 + r() * 0.07} />
      ))}
    </g>
  )
}

/** Trees for each kind of land: pines, round trees, baobabs; the city gets lamp posts. */
function Tree({ x, y, kind, s = 1 }: { x: number; y: number; kind: Zone; s?: number }) {
  if (kind === 'savanna')
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-5 0 L-3 -16 L3 -16 L5 0 Z" fill="#8a6a4a" />
        <path d="M-3 -16 L-9 -22 M0 -16 L0 -24 M3 -16 L9 -22" stroke="#8a6a4a" strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="0" cy="-25" rx="13" ry="5" fill="#7d9b3a" />
        <ellipse cx="3" cy="-25" rx="9" ry="4" fill="#5e7d2a" />
      </g>
    )
  if (kind === 'field')
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x="-1.5" y="-8" width="3" height="8" fill="#7a5a3a" />
        <circle cx="0" cy="-14" r="8" fill="#7cc35a" />
        <path d="M0 -22 A8 8 0 0 1 0 -6 Z" fill="#5ea043" />
      </g>
    )
  if (kind === 'city')
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x="-1" y="-20" width="2" height="20" fill="#3b3742" />
        <rect x="-4" y="-23" width="8" height="4" fill="#ffd23f" stroke="#3b3742" strokeWidth="1" />
      </g>
    )
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-1.5" y="-6" width="3" height="6" fill="#6a4a2a" />
      <path d="M0 -30 L-9 -5 L0 -5 Z" fill="#3f9a55" />
      <path d="M0 -30 L9 -5 L0 -5 Z" fill="#2c6e3c" />
    </g>
  )
}

/** A guardian's house: a little box with a hip roof, seen from above at an angle. */
function House({ x, y, wall, roof, w = 26, h = 22, big }: { x: number; y: number; wall: string; roof: string; w?: number; h?: number; big?: boolean }) {
  const d = w * 0.52
  const L: [number, number] = [x - w, y]
  const F: [number, number] = [x, y + d]
  const R: [number, number] = [x + w, y]
  const B: [number, number] = [x, y - d]
  const up = (p: [number, number], k = h): [number, number] => [p[0], p[1] - k]
  const apex: [number, number] = [x, y - h - (big ? 34 : 22)]
  return (
    <g className="tm-house">
      {/* shadow on the ground */}
      <polygon points={pts([L, F, R, B].map(([a, b]) => [a + 7, b + 4]))} fill="#000" opacity="0.12" />
      <polygon points={pts([L, F, up(F), up(L)])} fill={wall} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={pts([F, R, up(R), up(F)])} fill={shade(wall.startsWith('#') ? wall : '#888888', 0.28)} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
      {/* door and window */}
      <polygon points={pts([[x - w * 0.55, y + d * 0.45], [x - w * 0.3, y + d * 0.7], [x - w * 0.3, y + d * 0.7 - h * 0.62], [x - w * 0.55, y + d * 0.45 - h * 0.62]])} fill="#3b2a1c" />
      <polygon points={pts([[x + w * 0.3, y + d * 0.7 - h * 0.4], [x + w * 0.62, y + d * 0.38 - h * 0.4], [x + w * 0.62, y + d * 0.38 - h * 0.78], [x + w * 0.3, y + d * 0.7 - h * 0.78]])} fill="#ffe9a8" stroke="#121016" strokeWidth="1" />
      {/* the roof */}
      <polygon points={pts([up(L), up(B), apex])} fill={shade(roof, 0.1)} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={pts([up(B), up(R), apex])} fill={shade(roof, 0.35)} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={pts([up(L), up(F), apex])} fill={roof} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={pts([up(F), up(R), apex])} fill={shade(roof, 0.22)} stroke="#121016" strokeWidth="1.6" strokeLinejoin="round" />
    </g>
  )
}

/** Ops' tower at the top of the map: tall, dark, lit windows, an antenna. */
function OpsTower({ x, y }: { x: number; y: number }) {
  const w = 34
  const d = w * 0.52
  const h = 150
  const L: [number, number] = [x - w, y]
  const F: [number, number] = [x, y + d]
  const R: [number, number] = [x + w, y]
  const B: [number, number] = [x, y - d]
  const up = (p: [number, number], k = h): [number, number] => [p[0], p[1] - k]
  const rows = Array.from({ length: 9 }, (_, i) => i)
  return (
    <g className="tm-opstower">
      <polygon points={pts([L, F, R, B].map(([a, b]) => [a + 16, b + 8]))} fill="#000" opacity="0.14" />
      <polygon points={pts([L, F, up(F), up(L)])} fill="#25222c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([F, R, up(R), up(F)])} fill="#17151c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([up(L), up(F), up(R), up(B)])} fill="#2f2b38" stroke="#121016" strokeWidth="2" />
      {rows.map((i) =>
        [0.25, 0.6].map((k) => (
          <g key={`${i}-${k}`}>
            <polygon
              className={(i + k * 10) % 3 === 0 ? 'tm-blink' : undefined}
              points={pts([
                [x - w + w * k, y + d * k - 18 - i * 15],
                [x - w + w * (k + 0.22), y + d * (k + 0.22) - 18 - i * 15],
                [x - w + w * (k + 0.22), y + d * (k + 0.22) - 26 - i * 15],
                [x - w + w * k, y + d * k - 26 - i * 15],
              ])}
              fill="#ffd23f"
            />
            <polygon
              points={pts([
                [x + w * k, y + d - d * k - 18 - i * 15],
                [x + w * (k + 0.22), y + d - d * (k + 0.22) - 18 - i * 15],
                [x + w * (k + 0.22), y + d - d * (k + 0.22) - 26 - i * 15],
                [x + w * k, y + d - d * k - 26 - i * 15],
              ])}
              fill="#c9a12e"
            />
          </g>
        )),
      )}
      <path d={`M${x} ${y - h} L${x} ${y - h - 46}`} stroke="#121016" strokeWidth="3" />
      <circle className="tm-beacon" cx={x} cy={y - h - 48} r="5" fill="#e8291c" stroke="#121016" strokeWidth="1.5" />
    </g>
  )
}

/** The road from the bottom of the map through every stop and up into the city. */
function roadPath() {
  const p = [{ x: 200, y: H + 20 }, ...Array.from({ length: TOP }, (_, i) => stop(i + 1))]
  let d = `M${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]
    const b = p[i]
    const pull = (a.y - b.y) * 0.55
    d += ` C${a.x} ${a.y - pull} ${b.x} ${b.y + pull} ${b.x} ${b.y}`
  }
  return d
}

type St = 'cleared' | 'current' | 'locked'

export default function TowerMapLab() {
  const floors = useMemo(() => floorsFor(681), [])
  const [at, setAt] = useState(4)
  const [hearts, setHearts] = useState(2)
  const [champ, setChamp] = useState(false)
  const [phone, setPhone] = useState(true)
  const [picked, setPicked] = useState<Floor | null>(null)
  // your character (a robot if you haven't picked one)
  const me = useCrewLook() ?? 'bot'
  const road = useMemo(roadPath, [])
  const mapRef = useRef<HTMLDivElement>(null)

  const stateOf = (n: number): St => (n < at || (champ && n < TOP) ? 'cleared' : n === at ? 'current' : 'locked')

  // bring your stop into view whenever it moves
  useEffect(() => {
    const el = mapRef.current?.querySelector<HTMLElement>('.tm-stop--current')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [at, phone])

  // islands, trees and bits of scenery, the same every time
  const scenery = useMemo(() => {
    const r = rng(42)
    const out: { x: number; y: number; zone: Zone; rx: number; seed: number; trees: { x: number; y: number; s: number }[] }[] = []
    for (let n = 1; n < TOP; n++) {
      const h = house(n)
      const z = zoneOf(n)
      out.push({ x: h.x, y: h.y + 4, zone: z, rx: 58, seed: n * 13, trees: [{ x: h.x - 32 + (r() - 0.5) * 8, y: h.y + 16, s: 0.9 }, { x: h.x + 30, y: h.y - 16, s: 0.75 }] })
      // a loose island on the other side of the road
      const o = stop(n)
      const ox = o.x - side(n) * 92
      out.push({ x: ox, y: o.y + 50, zone: z, rx: 34 + r() * 14, seed: n * 31, trees: [{ x: ox - 8, y: o.y + 52, s: 0.8 }, { x: ox + 12, y: o.y + 44, s: 0.65 }] })
    }
    return out
  }, [])

  const width = phone ? 390 : 640
  const pos = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })
  const meStop = stop(champ ? TOP : at)

  return (
    <div className="page tm-lab">
      <div className="tm-controls">
        <label>
          At floor <b>{at}</b>
          <input type="range" min={1} max={TOP} value={at} onChange={(e) => setAt(Number(e.target.value))} />
        </label>
        <span className="tm-controls__group">
          Hearts
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className={`tm-chipbtn${hearts === n ? ' is-on' : ''}`} onClick={() => setHearts(n)}>
              {n}
            </button>
          ))}
        </span>
        <label className="tm-controls__group">
          <input type="checkbox" checked={champ} onChange={(e) => setChamp(e.target.checked)} /> Champion
        </label>
        <label className="tm-controls__group">
          <input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} /> Phone width
        </label>
      </div>

      <div className="tm-frame" style={{ width: `min(${width}px, 100%)` }}>
        <header className="tm-head">
          <div>
            <p className="tower__kicker">October season · 20 days left</p>
            <h1 className="tm-title">Ops’ Tower</h1>
          </div>
          <div className="tm-status">
            <span>
              Floor <b>{champ ? TOP : at}</b>/{TOP}
            </span>
            <Hearts n={hearts} size={18} />
          </div>
        </header>

        <div className="tm-map" ref={mapRef}>
          <svg viewBox={`0 0 ${W} ${H}`} className="tm-svg" aria-hidden="true">
            {/* the city at the top */}
            <Island x={200} y={house(TOP).y + 26} rx={150} seed={7} zone="city" />
            <House x={92} y={house(TOP).y + 30} wall="#cfc8bb" roof="#2d5bff" w={20} h={34} />
            <House x={312} y={house(TOP).y + 34} wall="#f3ead8" roof="#ff5a1f" w={22} h={26} />
            <Tree x={130} y={house(TOP).y + 70} kind="city" />
            <Tree x={272} y={house(TOP).y + 72} kind="city" />

            {scenery.map((s, i) => (
              <g key={i}>
                <Island x={s.x} y={s.y} rx={s.rx} seed={s.seed} zone={s.zone} />
                {s.trees.map((t, j) => (
                  <Tree key={j} x={t.x} y={t.y} kind={s.zone} s={t.s} />
                ))}
              </g>
            ))}

            {/* the road: edge, tarmac, centre line; the part you've driven is lit */}
            <path d={road} className="tm-road__edge" />
            <path d={road} className="tm-road" />
            <path d={road} className="tm-road__line" />

            {/* the houses */}
            {floors.slice(0, TOP - 1).map((f) => {
              const h = house(f.n)
              const wall = WALLS[(f.n - 1) % WALLS.length]
              return <House key={f.n} x={h.x} y={h.y} wall={wall} roof={stateOf(f.n) === 'locked' ? '#6f6a7a' : '#121016'} />
            })}
            <OpsTower x={200} y={house(TOP).y} />

            {/* checkpoint flags beside the road */}
            {floors
              .filter((f) => f.checkpoint)
              .map((f) => {
                const s = stop(f.n)
                const fx = s.x - side(f.n) * 44
                return (
                  <g key={f.n} className="tm-flag">
                    <path d={`M${fx} ${s.y + 4} L${fx} ${s.y - 34}`} stroke="#121016" strokeWidth="2.5" />
                    <path d={`M${fx} ${s.y - 34} L${fx + 22} ${s.y - 28} L${fx} ${s.y - 21} Z`} fill="#1f9d55" stroke="#121016" strokeWidth="1.5" />
                  </g>
                )
              })}

            {/* a trotro doing laps */}
            <g className="tm-trotro" style={{ offsetPath: `path('${road}')` } as CSSProperties}>
              <rect x="-9" y="-6" width="18" height="11" rx="2" fill="#ffd23f" stroke="#121016" strokeWidth="1.5" />
              <rect x="-6" y="-4" width="12" height="4" fill="#bfe3ff" />
            </g>
          </svg>

          {/* the stops: a sign over each house, tap for the floor */}
          {floors.map((f) => {
            const st = stateOf(f.n)
            const h = house(f.n)
            const boss = f.n === TOP
            const hidden = st === 'locked' && !boss && f.n > at + 2
            return (
              <button
                key={f.n}
                type="button"
                className={`tm-stop tm-stop--${st}${boss ? ' tm-stop--boss' : ''}`}
                style={pos(h.x, h.y - (boss ? 128 : 70))}
                onClick={() => setPicked(f)}
                aria-label={`Floor ${f.n}: ${boss ? 'Ops' : f.guardianName}, ${st}`}
              >
                <span className="tm-stop__n">{f.n}</span>
                <span className="tm-stop__face">{hidden ? <span className="tm-stop__q">?</span> : <OpsFace look={f.guardian} mood={st === 'cleared' ? 'lose' : st === 'current' ? 'smug' : 'idle'} size={boss ? 54 : 40} />}</span>
                {st === 'cleared' && <span className="tm-stop__tick">✓</span>}
                {st === 'locked' && !hidden && <span className="tm-stop__lock">🔒</span>}
                {f.checkpoint && <span className="tm-stop__cp">Checkpoint</span>}
              </button>
            )
          })}

          {/* you, on the road at your floor */}
          <span className="tm-me" style={pos(meStop.x, meStop.y)}>
            <OpsFace look={me} mood={champ ? 'win' : 'think'} size={38} />
            {champ && (
              <span className="tm-me__crown">
                <TowerCrown size={22} />
              </span>
            )}
          </span>

          {/* the current floor's call to action, right under its sign */}
          {!champ && (
            <button type="button" className="btn btn--primary tm-go" style={pos(house(at).x, house(at).y + (at === TOP ? -110 : 30))} onClick={() => setPicked(floors[at - 1])}>
              {at === TOP ? 'Face Ops' : 'Play'}
            </button>
          )}
        </div>
      </div>

      {picked && (
        <div className="tm-sheet-wrap" onClick={() => setPicked(null)}>
          <div className="tm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tm-sheet__face">
              <OpsFace look={picked.guardian} mood={stateOf(picked.n) === 'cleared' ? 'lose' : 'smug'} size={72} />
            </div>
            <p className="tower__kicker">
              Floor {picked.n} {picked.checkpoint ? '· checkpoint' : ''}
            </p>
            <h2 className="tm-sheet__title">{picked.n === TOP ? 'Ops herself' : `${picked.guardianName}’s place`}</h2>
            <p className="tm-sheet__line">
              {picked.gameName} · {levelLabel(picked.level)}
              {picked.twists.length > 0 && ` · ${twistLine(picked)}`}
            </p>
            <p className="tm-sheet__line">
              <Chip v={picked.reward >= 100 ? 100 : picked.reward >= 25 ? 25 : 5} size={18} /> {picked.reward} chips the first time
            </p>
            {stateOf(picked.n) === 'current' ? (
              <button type="button" className="btn btn--primary btn--block" onClick={() => setPicked(null)}>
                {picked.n === TOP ? 'Face Ops' : `Play ${picked.guardianName}`}
              </button>
            ) : (
              <p className="hint">{stateOf(picked.n) === 'cleared' ? 'Beaten. You can’t replay a floor this season.' : 'Beat the floors before it to get here.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
