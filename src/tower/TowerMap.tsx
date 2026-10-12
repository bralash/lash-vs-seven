import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Chip } from '../components/Chip'
import { OpsFace, type OpsStyle } from '../components/OpsFace'
import { levelLabel } from '../match/bot'
import { TOP, twistLine, type Floor } from './floors'
import { Bush, Flowers, GameHouse, Goat, GROUND, Mound, OwnerTouch, pts, Rock, rng, shade, Tree, type P, type Zone } from './mapArt'
import { TowerCrown } from './TowerCrown'
import '../styles/towermap.css'

/*
 * Ops' Tower as a road trip: a road winds up from floor 1 at the bottom to Ops' tower in the city at
 * the top. Each guardian lives in a house built around their game, with a touch of their own beside
 * it; the land changes as you climb (fields, savanna, forest, city), and the road crosses a river,
 * pushes through the bush and crosses a forest stream. You wait on the road at your floor.
 *
 * The road and houses live in a 400-wide strip that scales to the screen, up to ROAD_MAX px; on a
 * wider screen the land carries on out to both sides, so the map always fills the page.
 */

/* ── the map's geometry (SVG units) ── */
const W = 400
const GAP = 172
const BOTTOM = 150
const TOP_ROOM = 330
const H = BOTTOM + (TOP - 1) * GAP + TOP_ROOM
/** the widest the road's strip gets on screen */
const ROAD_MAX = 560
/** where floor n's stop is on the road */
const stop = (n: number): P => [n === TOP ? 200 : n % 2 ? 136 : 264, H - BOTTOM - (n - 1) * GAP]
/** which side of the road the house sits on (outwards from the bend) */
const side = (n: number) => (n % 2 ? -1 : 1)
const houseAt = (n: number): P => (n === TOP ? [200, stop(n)[1] - 72] : [stop(n)[0] + side(n) * 80, stop(n)[1] - 4])
const zoneOf = (n: number): Zone => (n <= 3 ? 'field' : n <= 6 ? 'savanna' : n <= 9 ? 'forest' : 'city')
/** the boundary between floor n's land and the next floor's */
const between = (n: number) => (stop(n)[1] + stop(n + 1)[1]) / 2

/* ── the road: cubic curves from stop to stop ── */
type Seg = [P, P, P, P]
const SEGS: Seg[] = (() => {
  const p: P[] = [[200, H + 30], ...Array.from({ length: TOP }, (_, i) => stop(i + 1))]
  return p.slice(1).map((b, i) => {
    const a = p[i]
    const pull = (a[1] - b[1]) * 0.55
    return [a, [a[0], a[1] - pull], [b[0], b[1] + pull], b]
  })
})()
const bez = ([a, b, c, d]: Seg, t: number): P => {
  const m = 1 - t
  const k = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t]
  return [k[0] * a[0] + k[1] * b[0] + k[2] * c[0] + k[3] * d[0], k[0] * a[1] + k[1] * b[1] + k[2] * c[1] + k[3] * d[1]]
}
const ROAD = SEGS.reduce((d, [, b, c, e]) => `${d} C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${e[0]} ${e[1]}`, `M${SEGS[0][0][0]} ${SEGS[0][0][1]}`)
const ROAD_PTS: P[] = SEGS.flatMap((s) => Array.from({ length: 40 }, (_, i) => bez(s, i / 40)))

/* ── water: a river across the fields (between floors 2 and 3), a stream in the forest (7 and 8) ── */
const waterLine = (y0: number, amp: number, phase: number, x0: number, x1: number): P[] => {
  const n = Math.ceil((x1 - x0) / 10)
  return Array.from({ length: n + 1 }, (_, i) => [x0 + i * 10, y0 + Math.sin((x0 + i * 10 + 20) / 10 * 0.42 + phase) * amp])
}
const pathOf = (p: P[]) => `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`
const RIVER = { y: between(2), amp: 13, phase: 0.4 }
const STREAM = { y: between(7), amp: 9, phase: 2.2 }
const waterY = (w: typeof RIVER, x: number) => w.y + Math.sin((x + 20) / 10 * 0.42 + w.phase) * w.amp

/** Land for a run of floors: a band across the map with a jagged top edge, facets catching the light. */
function Land({ y0, y1, zone, seed, x0, x1 }: { y0: number; y1: number; zone: Zone; seed: number; x0: number; x1: number }) {
  const r = rng(seed)
  const n = Math.ceil((x1 - x0) / 26) + 1
  const edge: P[] = Array.from({ length: n }, (_, i) => [x0 - 10 + i * 26, y0 + (r() - 0.5) * 22])
  const g = GROUND[zone]
  const facets = Array.from({ length: Math.round((26 * (x1 - x0)) / W) }, () => {
    const x = x0 + r() * (x1 - x0)
    const y = y0 + 10 + r() * (y1 - y0 - 10)
    const s = 18 + r() * 34
    return { p: [[x, y], [x + s, y + s * 0.3], [x + s * 0.3, y + s * 0.62]] as P[], o: 0.04 + r() * 0.07, light: r() > 0.5 }
  })
  return (
    <g>
      <polygon points={pts([...edge, [x1 + 10, y1 + 30], [x0 - 10, y1 + 30]])} fill={g.top} />
      <polyline points={pts(edge)} fill="none" stroke={g.side} strokeWidth="5" opacity="0.55" />
      {facets.map((f, i) => (
        <polygon key={i} points={pts(f.p)} fill={f.light ? '#fff' : '#000'} opacity={f.o * (f.light ? 1 : 0.6)} />
      ))}
    </g>
  )
}

/** A plot of flattened ground for a house: lumpy, a little lighter than the land around it. */
function Plot({ x, y, rx, zone, seed }: { x: number; y: number; rx: number; zone: Zone; seed: number }) {
  const r = rng(seed)
  const ring: P[] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    const k = 0.85 + r() * 0.25
    return [x + Math.cos(a) * rx * k, y + Math.sin(a) * rx * 0.5 * k]
  })
  return (
    <g>
      <polygon points={pts(ring.map(([a, b]) => [a, b + 4]))} fill={GROUND[zone].side} opacity="0.7" />
      <polygon points={pts(ring)} fill={GROUND[zone].plot} />
    </g>
  )
}

/** A lagoon around a house that sits on the water (Battleship's lighthouse). */
function Lagoon({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x + 14} cy={y + 12} rx="86" ry="40" fill="#bfe3ff" />
      <ellipse cx={x + 14} cy={y + 12} rx="80" ry="36" fill="#4fa3e0" />
      <ellipse className="tm-ripple" cx={x + 40} cy={y + 30} rx="10" ry="2.4" fill="none" stroke="#bfe3ff" strokeWidth="1.2" />
      <ellipse className="tm-ripple tm-ripple--late" cx={x - 30} cy={y + 24} rx="8" ry="2" fill="none" stroke="#bfe3ff" strokeWidth="1.2" />
      {/* the little island the lighthouse stands on */}
      <ellipse cx={x - 4} cy={y + 6} rx="30" ry="13" fill="#c98a3a" />
      <ellipse cx={x - 4} cy={y + 3} rx="30" ry="13" fill="#f7d9a6" />
    </g>
  )
}

/** A bridge where the road crosses water: the road drawn again, inside the water only, as a deck. */
function Bridge({ id, water, deck, rail }: { id: string; water: string; deck: string; rail: string }) {
  return (
    <g>
      <defs>
        <mask id={id}>
          <path d={water} stroke="#fff" strokeWidth="46" fill="none" />
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <path d={ROAD} fill="none" stroke={rail} strokeWidth="38" />
        <path d={ROAD} fill="none" stroke={deck} strokeWidth="31" />
        <path d={ROAD} fill="none" stroke={shade(deck, 0.3)} strokeWidth="31" strokeDasharray="1.6 4.4" />
      </g>
    </g>
  )
}

/** Where the owner's touch goes: clear of the house's own extras (the die, the word board, the jetty). */
function touchAt(f: Floor): P {
  const [x, y] = houseAt(f.n)
  if (f.game === 'battleship') return [x - 18, y + 10]
  if (f.game === 'hangman') return [x - 36, y + 16]
  return [x + 36, y + 16]
}

/** A block of flats in the city. */
function CityBlock({ x, y, h, c }: { x: number; y: number; h: number; c: string }) {
  const w = 22
  const d = w * 0.52
  const L: P = [x - w, y]
  const F: P = [x, y + d]
  const R: P = [x + w, y]
  const B: P = [x, y - d]
  const up = (p: P): P => [p[0], p[1] - h]
  const rows = Math.floor(h / 14)
  return (
    <g>
      <polygon points={pts([L, F, R, B].map(([a, b]) => [a + 12, b + 6]))} fill="#000" opacity="0.12" />
      <polygon points={pts([L, F, up(F), up(L)])} fill="#ece6da" stroke="#121016" strokeWidth="1.6" />
      <polygon points={pts([F, R, up(R), up(F)])} fill="#cfc8bb" stroke="#121016" strokeWidth="1.6" />
      <polygon points={pts([up(L), up(F), up(R), up(B)])} fill={c} stroke="#121016" strokeWidth="1.6" />
      {Array.from({ length: rows }, (_, i) =>
        [0.2, 0.6].map((k) => (
          <polygon
            key={`${i}${k}`}
            points={pts([
              [L[0] + w * k, L[1] + d * k - 8 - i * 14],
              [L[0] + w * (k + 0.24), L[1] + d * (k + 0.24) - 8 - i * 14],
              [L[0] + w * (k + 0.24), L[1] + d * (k + 0.24) - 15 - i * 14],
              [L[0] + w * k, L[1] + d * k - 15 - i * 14],
            ])}
            fill={(i + k * 5) % 3 ? '#bfe3ff' : '#ffe9a8'}
          />
        )),
      )}
    </g>
  )
}

/** Ops' tower at the top of the map: tall, dark, lit windows, an antenna with a beacon. */
function OpsTower({ x, y }: { x: number; y: number }) {
  const w = 34
  const d = w * 0.52
  const h = 150
  const L: P = [x - w, y]
  const F: P = [x, y + d]
  const R: P = [x + w, y]
  const B: P = [x, y - d]
  const up = (p: P, k = h): P => [p[0], p[1] - k]
  const win = (k: number, i: number, right: boolean): P[] => {
    const at = (kk: number, dy: number): P => (right ? [x + w * kk, y + d - d * kk - dy - i * 15] : [x - w + w * kk, y + d * kk - dy - i * 15])
    return [at(k, 18), at(k + 0.22, 18), at(k + 0.22, 26), at(k, 26)]
  }
  return (
    <g className="tm-opstower">
      <polygon points={pts([L, F, R, B].map(([a, b]) => [a + 18, b + 9]))} fill="#000" opacity="0.16" />
      <polygon points={pts([L, F, up(F), up(L)])} fill="#25222c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([F, R, up(R), up(F)])} fill="#17151c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([up(L), up(F), up(R), up(B)])} fill="#2f2b38" stroke="#121016" strokeWidth="2" />
      {Array.from({ length: 9 }, (_, i) =>
        [0.25, 0.6].map((k) => (
          <g key={`${i}-${k}`}>
            <polygon className={(i + k * 10) % 3 === 0 ? 'tm-blink' : undefined} points={pts(win(k, i, false))} fill="#ffd23f" />
            <polygon points={pts(win(k, i, true))} fill="#c9a12e" />
          </g>
        )),
      )}
      <path d={`M${x} ${y - h} L${x} ${y - h - 46}`} stroke="#121016" strokeWidth="3" />
      <circle className="tm-beacon" cx={x} cy={y - h - 48} r="5" fill="#e8291c" stroke="#121016" strokeWidth="1.5" />
    </g>
  )
}

export type FloorState = 'cleared' | 'current' | 'locked'

export interface MapClimb {
  at: number
  champ?: boolean
  got?: Record<string, true>
}

export function TowerMap({ floors, climb, me, onPlay }: { floors: Floor[]; climb: MapClimb; me: OpsStyle; onPlay: (f: Floor) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(390)
  const [picked, setPicked] = useState<Floor | null>(null)

  // how wide the page is: the road's strip scales up to ROAD_MAX, the land fills the rest
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWide(el.clientWidth || 390)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min(wide, ROAD_MAX) / W
  // extra land each side of the strip, in map units (a bit over, so nothing shows at the edges)
  const E = Math.max(0, Math.ceil((wide / scale - W) / 2 / 10) * 10)
  const x0 = -E
  const x1 = W + E
  const VW = W + 2 * E

  const stateOf = (n: number): FloorState => (n < climb.at || (climb.champ && n < TOP) ? 'cleared' : n === climb.at ? 'current' : 'locked')
  const shipFloor = floors.find((f) => f.game === 'battleship')?.n
  const season = floors.map((f) => f.guardian).join()

  // open the page at your stop (once the map has its size): jump straight there, no long scroll down from Ops
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current) return
    const t = setTimeout(() => {
      const r = box.current?.querySelector<HTMLElement>('.tm-me')?.getBoundingClientRect()
      if (!r) return
      scrolled.current = true
      window.scrollTo({ top: window.scrollY + r.top - innerHeight * 0.55, behavior: 'instant' })
    }, 120)
    return () => clearTimeout(t)
  }, [climb.at, wide])

  /** Trees, bushes, rocks and the rest, placed clear of the road, the houses and the water. */
  const scenery = useMemo(() => {
    const r = rng(season.length * 31 + 7)
    const houses = Array.from({ length: TOP }, (_, i) => houseAt(i + 1))
    const clear = (x: number, y: number) =>
      ROAD_PTS.every(([a, b]) => (a - x) ** 2 + (b - y) ** 2 > 30 * 30) &&
      houses.every(([a, b], i) => (a - x) ** 2 + ((b - y) * 1.4) ** 2 > (i === TOP - 1 ? 120 : i + 1 === shipFloor ? 96 : 58) ** 2) &&
      Math.abs(y - waterY(RIVER, x)) > 26 &&
      Math.abs(y - waterY(STREAM, x)) > 20
    const out: { k: string; x: number; y: number; zone: Zone; s: number; f?: boolean }[] = []
    const yTop = stop(TOP)[1] + 70
    const want = Math.round((150 * VW) / W)
    for (let tries = 0; tries < want * 10 && out.length < want; tries++) {
      const x = x0 + 8 + r() * (VW - 16)
      const y = yTop + r() * (H - yTop - 10)
      if (!clear(x, y)) continue
      const n = Math.max(1, Math.min(TOP - 1, Math.round((H - BOTTOM - y) / GAP) + 1))
      const zone = zoneOf(n)
      const roll = r()
      const k =
        zone === 'field'
          ? roll < 0.45 ? 'tree' : roll < 0.7 ? 'bush' : roll < 0.88 ? 'flowers' : 'rock'
          : zone === 'savanna'
            ? roll < 0.35 ? 'tree' : roll < 0.55 ? 'bush' : roll < 0.7 ? 'mound' : roll < 0.85 ? 'goat' : 'rock'
            : roll < 0.75 ? 'tree' : roll < 0.92 ? 'bush' : 'rock'
      out.push({ k, x, y, zone, s: 0.75 + r() * 0.4, f: r() > 0.5 })
    }
    // the bush the road pushes through, between floors 5 and 6
    for (let i = 1; i < 12; i++) {
      const [x, y] = bez(SEGS[5], i / 12)
      for (const d of [-1, 1]) {
        const bx = x + d * (24 + r() * 10)
        const by = y + (r() - 0.5) * 8
        if (houses.every(([a, b]) => (a - bx) ** 2 + (b - by) ** 2 > 44 ** 2)) out.push({ k: 'bushy', x: bx, y: by, zone: 'savanna', s: 0.9 + r() * 0.3 })
      }
    }
    // more of the city out to the sides on a wide screen
    const blocks: { x: number; y: number; h: number; c: string }[] = []
    const cityY = houseAt(TOP)[1]
    const colours = ['#9b3fd6', '#1f9d55', '#2d5bff', '#ff5a1f', '#ffd23f', '#e8291c']
    for (let x = -60, i = 0; x > x0 + 20; x -= 64, i++) blocks.push({ x, y: cityY - 10 + (i % 2) * 50, h: 40 + ((i * 17) % 40), c: colours[i % colours.length] })
    for (let x = 460, i = 3; x < x1 - 20; x += 64, i++) blocks.push({ x, y: cityY - 10 + (i % 2) * 50, h: 40 + ((i * 17) % 40), c: colours[i % colours.length] })
    return { items: out.sort((a, b) => a.y - b.y), blocks }
  }, [season, shipFloor, x0, VW])

  const pos = (x: number, y: number): CSSProperties => ({ left: `${((x - x0) / VW) * 100}%`, top: `${(y / H) * 100}%` })
  const meStop = stop(climb.champ ? TOP : climb.at)
  const cityY = houseAt(TOP)[1]
  const river = pathOf(waterLine(RIVER.y, RIVER.amp, RIVER.phase, x0 - 20, x1 + 20))
  const stream = pathOf(waterLine(STREAM.y, STREAM.amp, STREAM.phase, x0 - 20, x1 + 20))
  const current = floors.find((f) => f.n === climb.at)

  return (
    <div className="tm-map" ref={box} style={{ '--road': `${W * scale}px` } as CSSProperties}>
      <svg viewBox={`${x0} 0 ${VW} ${H}`} className="tm-svg" aria-hidden="true">
        {/* the land, from the city at the top down to the fields */}
        <rect x={x0} y="0" width={VW} height={H} fill={GROUND.city.top} />
        {Array.from({ length: Math.ceil(VW / 70) + 3 }, (_, i) => (
          <line key={i} x1={x0 + i * 70 - 60} y1={0} x2={x0 + i * 70 + 110} y2={between(9)} stroke="#c8c0b1" strokeWidth="1.2" opacity="0.7" />
        ))}
        <Land y0={between(9)} y1={between(6)} zone="forest" seed={3} x0={x0} x1={x1} />
        <Land y0={between(6)} y1={between(3)} zone="savanna" seed={5} x0={x0} x1={x1} />
        <Land y0={between(3)} y1={H} zone="field" seed={9} x0={x0} x1={x1} />

        {/* water */}
        <path d={river} className="tm-water__bank" strokeWidth="44" />
        <path d={river} className="tm-water" strokeWidth="34" />
        <path d={river} className="tm-water__glint" />
        <path d={stream} className="tm-water__bank" strokeWidth="30" />
        <path d={stream} className="tm-water" strokeWidth="22" />
        <path d={stream} className="tm-water__glint" />
        {shipFloor && <Lagoon x={houseAt(shipFloor)[0]} y={houseAt(shipFloor)[1]} />}

        {/* plots for the houses */}
        {floors.slice(0, TOP - 1).map((f) => (f.game === 'battleship' ? null : <Plot key={f.n} x={houseAt(f.n)[0]} y={houseAt(f.n)[1] + 4} rx={52} zone={zoneOf(f.n)} seed={f.n * 17} />))}

        {/* the road, and its bridges */}
        <path d={ROAD} className="tm-road__edge" />
        <path d={ROAD} className="tm-road" />
        <path d={ROAD} className="tm-road__line" />
        <Bridge id="tm-bridge-river" water={river} deck="#c08a55" rail="#5a3a20" />
        <Bridge id="tm-bridge-stream" water={stream} deck="#b9b2a6" rail="#5f6672" />

        {/* trees, bushes and the rest */}
        {scenery.items.map((s, i) => {
          if (s.k === 'tree') return <Tree key={i} x={s.x} y={s.y} kind={s.zone} s={s.s} />
          if (s.k === 'bush') return <Bush key={i} x={s.x} y={s.y} s={s.s * 0.8} c={s.zone === 'savanna' ? '#8aa84a' : '#4c9a4a'} />
          if (s.k === 'bushy') return <Bush key={i} x={s.x} y={s.y} s={s.s} c="#6f9a3a" />
          if (s.k === 'flowers') return <Flowers key={i} x={s.x} y={s.y} />
          if (s.k === 'mound') return <Mound key={i} x={s.x} y={s.y} />
          if (s.k === 'goat') return <Goat key={i} x={s.x} y={s.y} flip={s.f} />
          return <Rock key={i} x={s.x} y={s.y} s={s.s} />
        })}

        {/* the city: Ops' tower and the buildings round it */}
        {scenery.blocks.map((b, i) => (
          <CityBlock key={i} {...b} />
        ))}
        <CityBlock x={46} y={cityY - 30} h={70} c="#9b3fd6" />
        <CityBlock x={356} y={cityY - 24} h={62} c="#1f9d55" />
        <CityBlock x={86} y={cityY + 40} h={56} c="#2d5bff" />
        <CityBlock x={318} y={cityY + 46} h={40} c="#ff5a1f" />
        <Tree x={140} y={cityY + 80} kind="city" />
        <Tree x={262} y={cityY + 82} kind="city" />
        <OpsTower x={200} y={cityY} />

        {/* the houses, each with its owner's touch */}
        {floors.slice(0, TOP - 1).map((f) => {
          const [hx, hy] = houseAt(f.n)
          const [tx, ty] = touchAt(f)
          return (
            <g key={f.n} className={stateOf(f.n) === 'locked' ? 'tm-house--locked' : undefined}>
              <GameHouse game={f.game} x={hx} y={hy} />
              <OwnerTouch look={f.guardian} x={tx} y={ty} />
            </g>
          )
        })}

        {/* checkpoint flags beside the road */}
        {floors
          .filter((f) => f.checkpoint)
          .map((f) => {
            const [sx, sy] = stop(f.n)
            const fx = sx - side(f.n) * 44
            return (
              <g key={f.n}>
                <path d={`M${fx} ${sy + 4} L${fx} ${sy - 34}`} stroke="#121016" strokeWidth="2.5" />
                <path className="tm-wave" d={`M${fx} ${sy - 34} L${fx + 22} ${sy - 28} L${fx} ${sy - 21} Z`} fill="#1f9d55" stroke="#121016" strokeWidth="1.5" />
              </g>
            )
          })}

        {/* a trotro doing laps */}
        <g className="tm-trotro" style={{ offsetPath: `path('${ROAD}')` } as CSSProperties}>
          <rect x="-9" y="-6" width="18" height="11" rx="2" fill="#ffd23f" stroke="#121016" strokeWidth="1.5" />
          <rect x="-6" y="-4" width="12" height="4" fill="#bfe3ff" />
        </g>
      </svg>

      {/* clouds drifting over */}
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`tm-cloud tm-cloud--${i}`} style={{ top: `${12 + i * 31}%` }} viewBox="0 0 120 70" aria-hidden="true">
          {/* its shadow on the ground, then the cloud */}
          <ellipse cx="66" cy="62" rx="44" ry="7" fill="#000" opacity="0.07" />
          <path d="M18 38 a14 14 0 0 1 10 -24 a20 20 0 0 1 36 -6 a16 16 0 0 1 28 10 a12 12 0 0 1 6 22 Z" fill="#fff" stroke="#121016" strokeWidth="1.5" opacity="0.92" />
        </svg>
      ))}

      {/* the stops: a sign over each house, tap for the floor */}
      {floors.map((f) => {
        const st = stateOf(f.n)
        const [hx, hy] = houseAt(f.n)
        const boss = f.n === TOP
        // guardians above the first few floors stay a mystery until you get there
        const hidden = st === 'locked' && !boss && f.n > 3
        return (
          <button
            key={f.n}
            type="button"
            className={`tm-stop tm-stop--${st}${boss ? ' tm-stop--boss' : ''}`}
            style={pos(hx, hy - (boss ? 128 : f.game === 'connect4' ? 84 : f.game === 'battleship' ? 92 : 66))}
            onClick={() => setPicked(f)}
            aria-label={`Floor ${f.n}: ${boss ? 'Ops' : hidden ? 'a mystery guardian' : f.guardianName}, ${st === 'current' ? 'your floor' : st}`}
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
      <span className="tm-me" style={pos(meStop[0], meStop[1])}>
        <OpsFace look={me} mood={climb.champ ? 'win' : 'think'} size={38} />
        {climb.champ && (
          <span className="tm-me__crown">
            <TowerCrown size={22} />
          </span>
        )}
      </span>

      {/* the floor you're on: play it straight from the map (between the house and the road, clear of the screen edge) */}
      {current && (
        <button type="button" className="btn btn--primary tm-go" style={current.n === TOP ? pos(houseAt(TOP)[0], houseAt(TOP)[1] - 104) : pos((houseAt(current.n)[0] + stop(current.n)[0]) / 2, houseAt(current.n)[1] + 30)} onClick={() => onPlay(current)}>
          {current.n === TOP ? (climb.champ ? 'Rematch' : 'Face Ops') : 'Play'}
        </button>
      )}

      {/* on the body, so the page's entrance animation can't move it */}
      {picked && createPortal(<FloorSheet f={picked} st={stateOf(picked.n)} paid={!!climb.got?.[picked.n]} champ={climb.champ} onPlay={() => onPlay(picked)} onClose={() => setPicked(null)} />, document.body)}
    </div>
  )
}

/** A floor's details: who lives there, what you play, the twist and the chips. */
function FloorSheet({ f, st, paid, champ, onPlay, onClose }: { f: Floor; st: FloorState; paid: boolean; champ?: boolean; onPlay: () => void; onClose: () => void }) {
  const boss = f.n === TOP
  const hidden = st === 'locked' && !boss && f.n > 3
  return (
    <div className="tm-sheet-wrap" onClick={onClose}>
      <div className="tm-sheet" role="dialog" aria-label={`Floor ${f.n}`} onClick={(e) => e.stopPropagation()}>
        <div className="tm-sheet__face">{hidden ? <span className="tm-stop__q">?</span> : <OpsFace look={f.guardian} mood={st === 'cleared' ? 'lose' : 'smug'} size={72} />}</div>
        <p className="tower__kicker">
          Floor {f.n}
          {f.checkpoint ? ' · checkpoint' : ''}
        </p>
        <h2 className="tm-sheet__title">{boss ? 'Ops herself' : hidden ? 'Who lives here?' : `${f.guardianName}’s place`}</h2>
        <p className="tm-sheet__line">
          {f.gameName} · {levelLabel(f.level)}
          {f.twists.length > 0 && ` · ${twistLine(f)}`}
        </p>
        <p className={`tm-sheet__line${paid ? ' tm-sheet__line--paid' : ''}`}>
          <Chip v={f.reward >= 100 ? 100 : f.reward >= 25 ? 25 : 5} size={18} /> {paid ? `${f.reward} chips collected this season` : `${f.reward} chips the first time`}
        </p>
        {st === 'current' ? (
          <button type="button" className="btn btn--primary btn--block" onClick={onPlay}>
            {boss ? (champ ? 'Rematch Ops' : 'Face Ops') : `Play ${f.guardianName}`}
          </button>
        ) : (
          <p className="hint">{st === 'cleared' ? 'Beaten this season.' : 'Beat the floors before it to get here.'}</p>
        )}
      </div>
    </div>
  )
}
