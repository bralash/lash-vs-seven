import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chip } from '../components/Chip'
import { OpsFace, useCrewLook } from '../components/OpsFace'
import { levelLabel } from '../match/bot'
import { floorsFor, TOP, twistLine, type Floor } from '../tower/floors'
import { TowerCrown } from '../tower/TowerCrown'
import { Hearts } from '../tower/TowerSheet'
import { Bush, Flowers, GameHouse, Goat, GROUND, Mound, OwnerTouch, pts, Rock, rng, shade, Tree, type P, type Zone } from './towerMapArt'
import '../styles/tower.css'
import '../styles/towermap.css'

/*
 * Dev-only sandbox (route: /dev/towermap): Ops' Tower as a road trip instead of a building. A road
 * winds up the page from floor 1 at the bottom to Ops' tower in the city at the top. Each guardian
 * lives in a house built around their game, with a touch of their own beside it. The land changes
 * as you climb (fields, savanna, forest, city), and the road crosses a river on a wooden bridge,
 * pushes through the bush, and crosses a forest stream on a stone one. Your character waits on the
 * road at your floor.
 */

/* ── the map's geometry (SVG units; the map scales to the screen's width) ── */
const W = 400
const GAP = 172
const BOTTOM = 150
const TOP_ROOM = 330
const H = BOTTOM + (TOP - 1) * GAP + TOP_ROOM
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
const waterLine = (y0: number, amp: number, phase: number): P[] => Array.from({ length: 45 }, (_, i) => [-20 + i * 10, y0 + Math.sin(i * 0.42 + phase) * amp])
const RIVER = waterLine(between(2), 13, 0.4)
const STREAM = waterLine(between(7), 9, 2.2)
const pathOf = (p: P[]) => `M${p.map(([x, y]) => `${x} ${y}`).join(' L')}`
const waterY = (line: P[], x: number) => line[Math.max(0, Math.min(line.length - 1, Math.round((x + 20) / 10)))][1]

/** Land for a run of floors: a band across the map with a jagged top edge, facets catching the light. */
function Land({ y0, y1, zone, seed }: { y0: number; y1: number; zone: Zone; seed: number }) {
  const r = rng(seed)
  const edge: P[] = Array.from({ length: 17 }, (_, i) => [-10 + i * 26, y0 + (r() - 0.5) * 22])
  const g = GROUND[zone]
  const facets = Array.from({ length: 26 }, () => {
    const x = r() * W
    const y = y0 + 10 + r() * (y1 - y0 - 10)
    const s = 18 + r() * 34
    return { p: [[x, y], [x + s, y + s * 0.3], [x + s * 0.3, y + s * 0.62]] as P[], o: 0.04 + r() * 0.07, light: r() > 0.5 }
  })
  return (
    <g>
      <polygon points={pts([...edge, [W + 10, y1 + 30], [-10, y1 + 30]])} fill={g.top} />
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

type St = 'cleared' | 'current' | 'locked'

export default function TowerMapLab() {
  const [season, setSeason] = useState(681)
  const floors = useMemo(() => floorsFor(season), [season])
  const [at, setAt] = useState(4)
  const [hearts, setHearts] = useState(2)
  const [champ, setChamp] = useState(false)
  const [phone, setPhone] = useState(true)
  const [picked, setPicked] = useState<Floor | null>(null)
  // your character (a robot if you haven't picked one)
  const me = useCrewLook() ?? 'bot'
  const mapRef = useRef<HTMLDivElement>(null)

  const stateOf = (n: number): St => (n < at || (champ && n < TOP) ? 'cleared' : n === at ? 'current' : 'locked')
  const shipFloor = floors.find((f) => f.game === 'battleship')?.n

  // bring your stop into view whenever it moves
  useEffect(() => {
    mapRef.current?.querySelector<HTMLElement>('.tm-me')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [at, phone, season])

  /** Trees, bushes, rocks and the rest, placed clear of the road, the houses and the water. */
  const scenery = useMemo(() => {
    const r = rng(season * 31 + 7)
    const houses = Array.from({ length: TOP }, (_, i) => houseAt(i + 1))
    const clear = (x: number, y: number) =>
      ROAD_PTS.every(([a, b]) => (a - x) ** 2 + (b - y) ** 2 > 30 * 30) &&
      houses.every(([a, b], i) => (a - x) ** 2 + ((b - y) * 1.4) ** 2 > (i === TOP - 1 ? 120 : i + 1 === shipFloor ? 96 : 58) ** 2) &&
      Math.abs(y - waterY(RIVER, x)) > 26 &&
      Math.abs(y - waterY(STREAM, x)) > 20
    const out: { k: string; x: number; y: number; zone: Zone; s: number; f?: boolean }[] = []
    const yTop = stop(TOP)[1] + 70
    for (let tries = 0; tries < 1400 && out.length < 150; tries++) {
      const x = 8 + r() * (W - 16)
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
    const seg = SEGS[5]
    for (let i = 1; i < 12; i++) {
      const [x, y] = bez(seg, i / 12)
      for (const d of [-1, 1]) {
        const bx = x + d * (24 + r() * 10)
        const by = y + (r() - 0.5) * 8
        if (houses.every(([a, b]) => (a - bx) ** 2 + (b - by) ** 2 > 44 ** 2)) out.push({ k: 'bushy', x: bx, y: by, zone: 'savanna', s: 0.9 + r() * 0.3 })
      }
    }
    return out.sort((a, b) => a.y - b.y)
  }, [season, shipFloor])

  const width = phone ? 390 : 640
  const pos = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })
  const meStop = stop(champ ? TOP : at)
  const cityY = houseAt(TOP)[1]

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
        <span className="tm-controls__group">
          Season
          {[681, 682, 683].map((s) => (
            <button key={s} type="button" className={`tm-chipbtn${season === s ? ' is-on' : ''}`} onClick={() => setSeason(s)}>
              {s - 680}
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
            {/* the land, from the city at the top down to the fields */}
            <rect x="0" y="0" width={W} height={H} fill={GROUND.city.top} />
            {Array.from({ length: 7 }, (_, i) => (
              <line key={i} x1={i * 70 - 60} y1={0} x2={i * 70 + 110} y2={between(9)} stroke="#c8c0b1" strokeWidth="1.2" opacity="0.7" />
            ))}
            <Land y0={between(9)} y1={between(6)} zone="forest" seed={3} />
            <Land y0={between(6)} y1={between(3)} zone="savanna" seed={5} />
            <Land y0={between(3)} y1={H} zone="field" seed={9} />

            {/* water */}
            <path d={pathOf(RIVER)} className="tm-water__bank" strokeWidth="44" />
            <path d={pathOf(RIVER)} className="tm-water" strokeWidth="34" />
            <path d={pathOf(RIVER)} className="tm-water__glint" />
            <path d={pathOf(STREAM)} className="tm-water__bank" strokeWidth="30" />
            <path d={pathOf(STREAM)} className="tm-water" strokeWidth="22" />
            <path d={pathOf(STREAM)} className="tm-water__glint" />
            {shipFloor && <Lagoon x={houseAt(shipFloor)[0]} y={houseAt(shipFloor)[1]} />}

            {/* plots for the houses */}
            {floors.slice(0, TOP - 1).map((f) => (f.game === 'battleship' ? null : <Plot key={f.n} x={houseAt(f.n)[0]} y={houseAt(f.n)[1] + 4} rx={52} zone={zoneOf(f.n)} seed={f.n * 17} />))}

            {/* the road, and its bridges */}
            <path d={ROAD} className="tm-road__edge" />
            <path d={ROAD} className="tm-road" />
            <path d={ROAD} className="tm-road__line" />
            <Bridge id="tm-bridge-river" water={pathOf(RIVER)} deck="#c08a55" rail="#5a3a20" />
            <Bridge id="tm-bridge-stream" water={pathOf(STREAM)} deck="#b9b2a6" rail="#5f6672" />

            {/* trees, bushes and the rest */}
            {scenery.map((s, i) => {
              if (s.k === 'tree') return <Tree key={i} x={s.x} y={s.y} kind={s.zone} s={s.s} />
              if (s.k === 'bush') return <Bush key={i} x={s.x} y={s.y} s={s.s * 0.8} c={s.zone === 'savanna' ? '#8aa84a' : '#4c9a4a'} />
              if (s.k === 'bushy') return <Bush key={i} x={s.x} y={s.y} s={s.s} c="#6f9a3a" />
              if (s.k === 'flowers') return <Flowers key={i} x={s.x} y={s.y} />
              if (s.k === 'mound') return <Mound key={i} x={s.x} y={s.y} />
              if (s.k === 'goat') return <Goat key={i} x={s.x} y={s.y} flip={s.f} />
              return <Rock key={i} x={s.x} y={s.y} s={s.s} />
            })}

            {/* the city: Ops' tower and the buildings round it */}
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
                  <g key={f.n} className="tm-flag">
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
            const hidden = st === 'locked' && !boss && f.n > at + 2
            return (
              <button
                key={f.n}
                type="button"
                className={`tm-stop tm-stop--${st}${boss ? ' tm-stop--boss' : ''}`}
                style={pos(hx, hy - (boss ? 128 : f.game === 'connect4' ? 84 : f.game === 'battleship' ? 92 : 66))}
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
          <span className="tm-me" style={pos(meStop[0], meStop[1])}>
            <OpsFace look={me} mood={champ ? 'win' : 'think'} size={38} />
            {champ && (
              <span className="tm-me__crown">
                <TowerCrown size={22} />
              </span>
            )}
          </span>

          {/* the current floor's call to action, right under its house */}
          {!champ && (
            <button type="button" className="btn btn--primary tm-go" style={pos(houseAt(at)[0], houseAt(at)[1] + (at === TOP ? -104 : 26))} onClick={() => setPicked(floors[at - 1])}>
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
  return (
    <g className="tm-opstower">
      <polygon points={pts([L, F, R, B].map(([a, b]) => [a + 18, b + 9]))} fill="#000" opacity="0.16" />
      <polygon points={pts([L, F, up(F), up(L)])} fill="#25222c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([F, R, up(R), up(F)])} fill="#17151c" stroke="#121016" strokeWidth="2" />
      <polygon points={pts([up(L), up(F), up(R), up(B)])} fill="#2f2b38" stroke="#121016" strokeWidth="2" />
      {Array.from({ length: 9 }, (_, i) =>
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
