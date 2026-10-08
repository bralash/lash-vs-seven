import type { MouseEvent } from 'react'
import { HOME, HOME_COL, OFFSET, TRACK, YARD, cellOf, type Color } from './engine'

export const COLOR_HEX: Record<Color, string> = {
  red: '#e8291c',
  blue: '#2d5bff',
  green: '#1f9d55',
  yellow: '#ffd23f',
}
export const COLOR_NAME: Record<Color, string> = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow' }

/** Turn the board so this colour's yard sits bottom-left (red is top-left on the flat board). */
const TURN: Record<Color, number> = { yellow: 0, red: -90, blue: 180, green: 90 }

export interface TokenView {
  c: Color
  i: number
  pos: number
}

export interface Dest {
  pos: number
  dir: 'forward' | 'back'
}

interface Props {
  colors: Color[]
  bottom: Color
  tokens: TokenView[]
  /** tokens the player on turn can pick */
  pickable: { c: Color; i: number }[]
  selected: { c: Color; i: number } | null
  /** forward / back choice for the selected token */
  dests: Dest[]
  /** yards that light up on a 6 (a token there can come out) */
  pulse: Color[]
  onToken: (c: Color, i: number) => void
  onDest: (dir: 'forward' | 'back') => void
}

/** Where a token stands, in board cells (centre). */
export function spot(t: TokenView): [number, number] {
  if (t.pos === 0) {
    const [ox, oy] = YARD[t.c]
    return [ox + 2 + (t.i % 2) * 2, oy + 2 + Math.floor(t.i / 2) * 2]
  }
  if (t.pos >= HOME) {
    const [dx, dy] = HOME_DIR[t.c]
    return [7.5 + dx * 0.95, 7.5 + dy * 0.95]
  }
  const [c, r] = cellOf(t.c, t.pos)!
  return [c + 0.5, r + 0.5]
}
const HOME_DIR: Record<Color, [number, number]> = { red: [-1, 0], blue: [0, -1], green: [1, 0], yellow: [0, 1] }

/** a tap within this many squares of a token (or arrow) counts as tapping it — a square is ~21px on a phone */
const REACH = 1.2

/** small spreads so tokens sharing a square stay visible */
const SPREAD: [number, number][][] = [
  [[0, 0]],
  [[-0.17, -0.12], [0.17, 0.12]],
  [[-0.2, -0.16], [0.2, -0.16], [0, 0.18]],
  [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
]

export function LudoBoard({ colors, bottom, tokens, pickable, selected, dests, pulse, onToken, onDest }: Props) {
  const a = (TURN[bottom] * Math.PI) / 180
  const cos = Math.round(Math.cos(a))
  const sin = Math.round(Math.sin(a))
  /** rotate a board point about the centre (whole quarter turns, so squares stay squares) */
  const pt = (x: number, y: number): [number, number] => [7.5 + (x - 7.5) * cos - (y - 7.5) * sin, 7.5 + (x - 7.5) * sin + (y - 7.5) * cos]
  const cell = (c: number, r: number) => {
    const [x, y] = pt(c + 0.5, r + 0.5)
    return { x: x - 0.5, y: y - 0.5 }
  }
  const rect = (c: number, r: number, w: number, h: number) => {
    const [x1, y1] = pt(c, r)
    const [x2, y2] = pt(c + w, r + h)
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
  }
  const on = (c: Color) => colors.includes(c)
  const fill = (c: Color) => (on(c) ? COLOR_HEX[c] : '#3a3644')

  // group tokens by where they stand
  const groups = new Map<string, TokenView[]>()
  for (const t of tokens) {
    const [x, y] = spot(t)
    const k = `${x},${y}`
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const canPick = (t: TokenView) => pickable.some((p) => p.c === t.c && p.i === t.i)

  const sel = selected && tokens.find((t) => t.c === selected.c && t.i === selected.i)

  // everything tappable, where it's drawn (filled in below) — one handler on the board takes the
  // nearest, so a thumb doesn't have to land on a 15px token
  const targets: { x: number; y: number; act: () => void }[] = []
  const yards = pulse.map((c) => {
    const [ox, oy] = YARD[c]
    const t = tokens.find((t) => t.c === c && t.pos === 0 && canPick(t))
    return { box: rect(ox, oy, 6, 6), act: t && (() => onToken(t.c, t.i)) }
  })
  const tap = (e: MouseEvent<SVGSVGElement>) => {
    // keyboard / screen-reader activation has no position: use the element itself
    if (e.detail === 0) {
      const el = (e.target as Element).closest('[data-tap]')
      if (el) targets[Number(el.getAttribute('data-tap'))]?.act()
      return
    }
    const m = e.currentTarget.getScreenCTM()
    if (!m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    // a lit-up yard: anywhere in it brings a token out
    const yard = yards.find(({ box: b }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
    if (yard?.act) return yard.act()
    let best: (typeof targets)[number] | undefined
    let bestD = REACH
    for (const t of targets) {
      const d = Math.hypot(t.x - p.x, t.y - p.y)
      if (d < bestD) [best, bestD] = [t, d]
    }
    best?.act()
  }

  return (
    <svg className={`ld-board${pickable.length ? ' ld-board--pick' : ''}`} onClick={tap} viewBox="-0.25 -0.25 15.5 15.5" role="img" aria-label="Ludo board">
      <rect x={-0.25} y={-0.25} width={15.5} height={15.5} className="ld-board__bg" />

      {/* yards */}
      {(Object.keys(YARD) as Color[]).map((c) => {
        const [ox, oy] = YARD[c]
        return (
          <g key={c} className={on(c) ? undefined : 'ld-off'}>
            <rect {...rect(ox, oy, 6, 6)} fill={fill(c)} className="ld-yard" />
            <rect {...rect(ox + 1, oy + 1, 4, 4)} className="ld-yard__in" />
            {[0, 1, 2, 3].map((i) => {
              const [x, y] = pt(ox + 2 + (i % 2) * 2, oy + 2 + Math.floor(i / 2) * 2)
              return <circle key={i} cx={x} cy={y} r={0.42} className="ld-yard__spot" stroke={fill(c)} />
            })}
            {pulse.includes(c) && <rect {...rect(ox + 0.12, oy + 0.12, 5.76, 5.76)} className="ld-yard__pulse" />}
          </g>
        )
      })}

      {/* the outer track */}
      {TRACK.map(([c, r], k) => {
        const exit = (Object.keys(OFFSET) as Color[]).find((col) => OFFSET[col] === k)
        return <rect key={k} {...cell(c, r)} width={1} height={1} className="ld-sq" fill={exit ? fill(exit) : undefined} />
      })}
      {/* home columns */}
      {(Object.keys(HOME_COL) as Color[]).flatMap((col) =>
        HOME_COL[col].map(([c, r], k) => <rect key={`${col}${k}`} {...cell(c, r)} width={1} height={1} className="ld-sq ld-sq--home" fill={fill(col)} />),
      )}
      {/* entry arrows on the exit squares */}
      {(Object.keys(OFFSET) as Color[]).map((col) => {
        const [c, r] = TRACK[OFFSET[col]]
        const [x, y] = pt(c + 0.5, r + 0.5)
        return on(col) ? <circle key={col} cx={x} cy={y} r={0.16} className="ld-exit-dot" /> : null
      })}

      {/* the centre: a triangle per colour */}
      {(
        [
          ['red', [6, 6], [6, 9]],
          ['blue', [6, 6], [9, 6]],
          ['green', [9, 6], [9, 9]],
          ['yellow', [6, 9], [9, 9]],
        ] as [Color, [number, number], [number, number]][]
      ).map(([col, p1, p2]) => {
        const pts = [pt(...p1), pt(...p2), pt(7.5, 7.5)].map((p) => p.join(',')).join(' ')
        return <polygon key={col} points={pts} fill={fill(col)} className="ld-centre" />
      })}

      {/* tokens */}
      {[...groups.values()].flatMap((g) =>
        g.map((t, k) => {
          const [bx, by] = spot(t)
          const sp = SPREAD[Math.min(g.length, 4) - 1][Math.min(k, 3)]
          const [x, y] = pt(bx + (g.length > 4 ? 0 : sp[0]), by + (g.length > 4 ? 0 : sp[1]))
          const pick = canPick(t)
          const isSel = !!sel && sel.c === t.c && sel.i === t.i
          const r = g.length > 1 || t.pos >= HOME ? 0.3 : 0.36
          const tapId = pick ? targets.push({ x, y, act: () => onToken(t.c, t.i) }) - 1 : undefined
          return (
            <g
              key={`${t.c}${t.i}`}
              className={`ld-tok${pick ? ' ld-tok--pick' : ''}${isSel ? ' ld-tok--sel' : ''}${t.pos >= HOME ? ' ld-tok--home' : ''}`}
              data-tap={tapId}
              role={pick ? 'button' : undefined}
              aria-label={pick ? `${COLOR_NAME[t.c]} token ${t.i + 1}` : undefined}
            >
              <circle cx={x + 0.07} cy={y + 0.09} r={r} className="ld-tok__shadow" />
              <circle cx={x} cy={y} r={r} fill={COLOR_HEX[t.c]} className="ld-tok__body" />
              <circle cx={x} cy={y} r={r * 0.45} className="ld-tok__eye" />
              {pick && <circle cx={x} cy={y} r={r + 0.14} className="ld-tok__ring" />}
            </g>
          )
        }),
      )}

      {/* forward / back choice */}
      {sel &&
        dests.map((d) => {
          const [bx, by] = spot({ ...sel, pos: d.pos })
          const [x, y] = pt(bx, by)
          const tapId = targets.push({ x, y, act: () => onDest(d.dir) }) - 1
          return (
            <g key={d.dir} className={`ld-dest ld-dest--${d.dir}`} data-tap={tapId} role="button" aria-label={d.dir === 'back' ? 'Move back and capture' : 'Move forward'}>
              <circle cx={x} cy={y} r={0.5} fill={d.dir === 'back' ? '#fff' : COLOR_HEX[sel.c]} stroke={COLOR_HEX[sel.c]} />
              <text x={x} y={y + 0.17} textAnchor="middle" className="ld-dest__arrow" fill={d.dir === 'back' ? COLOR_HEX[sel.c] : '#121016'}>
                {d.dir === 'back' ? '↶' : '→'}
              </text>
            </g>
          )
        })}
    </svg>
  )
}

/* ── The die ─────────────────────────────────────────────────────────── */

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

export function DieFace({ v }: { v: number }) {
  return (
    <span className="ld-die__face" aria-hidden="true">
      {Array.from({ length: 9 }, (_, k) => (
        <i key={k} className={(PIPS[v] ?? []).includes(k) ? 'on' : undefined} />
      ))}
    </span>
  )
}
