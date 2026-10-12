import type { OpsStyle } from '../components/OpsFace'

/*
 * Art for the Tower road map (dev lab /dev/towermap): a house for each game, a touch of each owner
 * beside it, and the bits of land in between. Everything is drawn at a slant from above (a
 * flattened isometric view) in the app's flat colours with ink outlines.
 */

export type P = [number, number]
const INK = '#121016'
const S = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' as const }

export const pts = (p: P[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const up = (p: P, k: number): P => [p[0], p[1] - k]

/** a hex colour, darker by `k` (0–1) */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * (1 - k))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

/** A seeded random, so the map is the same every time. */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

/* ── a box seen from above at a slant, and points on its faces ── */

interface Box {
  L: P
  F: P
  R: P
  B: P
  h: number
}
const box = (x: number, y: number, w: number, h: number, dk = 0.52): Box => ({ L: [x - w, y], F: [x, y + w * dk], R: [x + w, y], B: [x, y - w * dk], h })
/** u along the front-left wall (0 at the left corner), v up it (0 ground, 1 top) */
const onLeft = (b: Box, u: number, v: number) => up(lerp(b.L, b.F, u), v * b.h)
const onRight = (b: Box, u: number, v: number) => up(lerp(b.F, b.R, u), v * b.h)
/** u towards the front corner, v towards the back corner, on the flat top */
const onTop = (b: Box, u: number, v: number): P => up([b.L[0] + u * (b.F[0] - b.L[0]) + v * (b.B[0] - b.L[0]), b.L[1] + u * (b.F[1] - b.L[1]) + v * (b.B[1] - b.L[1])], b.h)
const cell = (f: (u: number, v: number) => P, u0: number, v0: number, u1: number, v1: number) => pts([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)])

function Shadow({ b, k = 1 }: { b: Box; k?: number }) {
  return <polygon points={pts([b.L, b.F, b.R, b.B].map(([a, c]) => [a + 8 * k, c + 4 * k]))} fill="#000" opacity="0.13" />
}

/** The walls and top of a box. */
function Walls({ b, left, right, top }: { b: Box; left: string; right?: string; top?: string }) {
  return (
    <>
      <polygon points={pts([b.L, b.F, up(b.F, b.h), up(b.L, b.h)])} fill={left} {...S} />
      <polygon points={pts([b.F, b.R, up(b.R, b.h), up(b.F, b.h)])} fill={right ?? shade(left, 0.25)} {...S} />
      {top && <polygon points={pts([up(b.L, b.h), up(b.F, b.h), up(b.R, b.h), up(b.B, b.h)])} fill={top} {...S} />}
    </>
  )
}

/** A hip roof on a box; `faces` colours its four slopes (front-left, front-right, back-left, back-right). */
function Roof({ b, rise, faces }: { b: Box; rise: number; faces: [string, string, string, string] }) {
  const t = (p: P) => up(p, b.h)
  const apex = up([(b.L[0] + b.R[0]) / 2, (b.B[1] + b.F[1]) / 2], b.h + rise)
  return (
    <>
      <polygon points={pts([t(b.L), t(b.B), apex])} fill={faces[2]} {...S} />
      <polygon points={pts([t(b.B), t(b.R), apex])} fill={faces[3]} {...S} />
      <polygon points={pts([t(b.L), t(b.F), apex])} fill={faces[0]} {...S} />
      <polygon points={pts([t(b.F), t(b.R), apex])} fill={faces[1]} {...S} />
    </>
  )
}

const Door = ({ b, u = 0.32, c = '#3b2a1c' }: { b: Box; u?: number; c?: string }) => <polygon points={cell((a, v) => onLeft(b, a, v), u, 0, u + 0.24, 0.62)} fill={c} {...S} strokeWidth={1} />
const Window = ({ b, u = 0.4, c = '#ffe9a8' }: { b: Box; u?: number; c?: string }) => <polygon points={cell((a, v) => onRight(b, a, v), u, 0.38, u + 0.26, 0.74)} fill={c} {...S} strokeWidth={1} />

/* ── a house for each game ── */

/** Tic-tac-toe: a flat-roofed house with the grid on the roof, mid-game. */
function TttHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 25, 22)
  const top = (u: number, v: number) => onTop(b, u, v)
  const marks: [number, number, 'x' | 'o'][] = [[0, 0, 'x'], [1, 1, 'x'], [2, 0, 'o'], [0, 2, 'o'], [2, 2, 'x']]
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#f8f3e8" top="#ffd23f" />
      <Door b={b} />
      <Window b={b} />
      {[1 / 3, 2 / 3].map((k) => (
        <g key={k} stroke={INK} strokeWidth="1.4">
          <line x1={top(k, 0)[0]} y1={top(k, 0)[1]} x2={top(k, 1)[0]} y2={top(k, 1)[1]} />
          <line x1={top(0, k)[0]} y1={top(0, k)[1]} x2={top(1, k)[0]} y2={top(1, k)[1]} />
        </g>
      ))}
      {marks.map(([i, j, m]) => {
        const c = top((i + 0.5) / 3, (j + 0.5) / 3)
        return m === 'x' ? (
          <g key={`${i}${j}`} stroke="#ff5a1f" strokeWidth="2" strokeLinecap="round">
            <line x1={c[0] - 4} y1={c[1] - 2} x2={c[0] + 4} y2={c[1] + 2} />
            <line x1={c[0] + 4} y1={c[1] - 2} x2={c[0] - 4} y2={c[1] + 2} />
          </g>
        ) : (
          <ellipse key={`${i}${j}`} cx={c[0]} cy={c[1]} rx="3.6" ry="2" fill="none" stroke="#2d5bff" strokeWidth="1.8" />
        )
      })}
    </g>
  )
}

/** Connect Four: the house is the board, stood on its feet, discs in its windows. */
function C4House({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 24, 46, 0.34)
  const disc = (i: number, j: number) => ((i * 7 + j * 3) % 5 === 0 ? '#ff5a1f' : (i + j * 2) % 4 === 1 ? '#ffd23f' : '#f8f3e8')
  return (
    <g>
      <Shadow b={b} k={1.6} />
      <Walls b={b} left="#2d5bff" top="#1d3fc0" />
      {[0, 1, 2, 3].map((i) =>
        [0, 1, 2, 3, 4].map((j) => {
          const c = onLeft(b, 0.14 + i * 0.24, 0.12 + j * 0.18)
          return <ellipse key={`${i}${j}`} cx={c[0]} cy={c[1]} rx="3.4" ry="3.6" fill={j < 2 || (i + j) % 3 ? disc(i, j) : '#f8f3e8'} stroke={INK} strokeWidth="1" />
        }),
      )}
      {[0, 1].map((i) =>
        [0, 1, 2, 3, 4].map((j) => {
          const c = onRight(b, 0.3 + i * 0.4, 0.12 + j * 0.18)
          return <ellipse key={`r${i}${j}`} cx={c[0]} cy={c[1]} rx="2.6" ry="3.2" fill={shade(disc(i + 2, j), 0.25)} stroke={INK} strokeWidth="1" />
        }),
      )}
      {/* a disc about to drop in */}
      <circle className="tm-bob" cx={onTop(b, 0.5, 0.5)[0]} cy={onTop(b, 0.5, 0.5)[1] - 10} r="4.4" fill="#ff5a1f" stroke={INK} strokeWidth="1.4" />
    </g>
  )
}

/** Hangman: a wooden hut with a thatch roof, and the word board on its post outside. */
function HangHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 22, 19)
  const gx = x + 30
  const gy = y + 6
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#b07a4a" />
      {[0.33, 0.66].map((v) => (
        <g key={v} stroke={shade('#b07a4a', 0.4)} strokeWidth="1">
          <line x1={onLeft(b, 0, v)[0]} y1={onLeft(b, 0, v)[1]} x2={onLeft(b, 1, v)[0]} y2={onLeft(b, 1, v)[1]} />
          <line x1={onRight(b, 0, v)[0]} y1={onRight(b, 0, v)[1]} x2={onRight(b, 1, v)[0]} y2={onRight(b, 1, v)[1]} />
        </g>
      ))}
      <Door b={b} />
      <Window b={b} c="#f2d58c" />
      <Roof b={b} rise={20} faces={['#e3b04b', '#c9952f', '#d9a441', '#b8862a']} />
      {/* the gallows-shaped word board */}
      <path d={`M${gx} ${gy} L${gx} ${gy - 46} L${gx - 16} ${gy - 46} L${gx - 16} ${gy - 40}`} fill="none" stroke="#6a4a2a" strokeWidth="3" strokeLinejoin="round" />
      <rect x={gx - 27} y={gy - 40} width="22" height="11" fill="#f8f3e8" stroke={INK} strokeWidth="1.2" />
      <text x={gx - 16} y={gy - 31.5} textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="7" fontWeight="700" fill={INK}>
        _A_E
      </text>
    </g>
  )
}

/** Dots & Boxes: a white house drawn in dots, some lines joined, a box or two taken. */
function DotsHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 25, 24)
  const n = 4
  const dots: P[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) dots.push(onLeft(b, i / n, j / n), onRight(b, i / n, j / n), onTop(b, i / n, j / n))
  const line = (f: (u: number, v: number) => P, a: [number, number], c: [number, number], col: string) => {
    const p = f(a[0] / n, a[1] / n)
    const q = f(c[0] / n, c[1] / n)
    return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} strokeWidth="1.8" strokeLinecap="round" />
  }
  const L = (u: number, v: number) => onLeft(b, u, v)
  const T = (u: number, v: number) => onTop(b, u, v)
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#f8f3e8" top="#f3ead8" />
      <polygon points={cell(L, 1 / n, 1 / n, 2 / n, 2 / n)} fill="#ff5a1f" opacity="0.85" />
      <polygon points={cell(T, 2 / n, 1 / n, 3 / n, 2 / n)} fill="#2d5bff" opacity="0.85" />
      {line(L, [1, 1], [2, 1], '#ff5a1f')}
      {line(L, [1, 2], [2, 2], '#ff5a1f')}
      {line(L, [1, 1], [1, 2], '#ff5a1f')}
      {line(L, [2, 1], [2, 2], '#ff5a1f')}
      {line(L, [3, 0], [3, 2], '#2d5bff')}
      {line(T, [0, 3], [2, 3], '#2d5bff')}
      {dots.map(([a, c], i) => (
        <circle key={i} cx={a} cy={c} r="1.1" fill={INK} />
      ))}
      <Door b={b} u={0.52} c="#2d5bff" />
    </g>
  )
}

/** Ludo: a roof in the four colours, and a big die by the door. */
function LudoHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 24, 18)
  const d = box(x - 34, y + 12, 8, 13, 0.52)
  const pip = (p: P) => <circle cx={p[0]} cy={p[1]} r="1.3" fill={INK} />
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#f8f3e8" />
      <Door b={b} />
      <Window b={b} />
      <Roof b={b} rise={22} faces={['#e8291c', '#2d5bff', '#1f9d55', '#ffd23f']} />
      <Shadow b={d} k={0.6} />
      <Walls b={d} left="#ffffff" right="#e4ddd0" top="#ffffff" />
      {pip(onTop(d, 0.5, 0.5))}
      {pip(onLeft(d, 0.3, 0.7))}
      {pip(onLeft(d, 0.7, 0.3))}
      {pip(onRight(d, 0.25, 0.75))}
      {pip(onRight(d, 0.5, 0.5))}
      {pip(onRight(d, 0.75, 0.25))}
    </g>
  )
}

/** Uno: card walls (a 7 and a +2), a fan of cards on the roof, one leaning on the wall. */
function UnoHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 23, 26)
  const L = (u: number, v: number) => onLeft(b, u, v)
  const R = (u: number, v: number) => onRight(b, u, v)
  const top = onTop(b, 0.5, 0.5)
  const card = (rot: number, fill: string, k: number) => (
    <g key={k} transform={`translate(${top[0]} ${top[1] - 2}) rotate(${rot}) skewX(-20) scale(1 .62)`}>
      <rect x="-6" y="-22" width="12" height="18" fill={fill} stroke={INK} strokeWidth="1.4" />
      <ellipse cx="0" cy="-13" rx="3.6" ry="6" fill="#f8f3e8" />
    </g>
  )
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#e8291c" right="#e0b21f" top="#2f2b38" />
      <polygon points={cell(L, 0.18, 0.15, 0.82, 0.85)} fill="#f8f3e8" />
      <text x={L(0.5, 0.42)[0]} y={L(0.5, 0.42)[1]} textAnchor="middle" fontFamily="Bowlby One, sans-serif" fontSize="13" fill="#e8291c">
        7
      </text>
      <polygon points={cell(R, 0.18, 0.15, 0.82, 0.85)} fill="#f8f3e8" />
      <text x={R(0.5, 0.42)[0]} y={R(0.5, 0.42)[1]} textAnchor="middle" fontFamily="Bowlby One, sans-serif" fontSize="9" fill="#c9951a">
        +2
      </text>
      {card(-30, '#1f9d55', 0)}
      {card(0, '#2d5bff', 1)}
      {card(30, '#ffd23f', 2)}
      {/* a card leaning on the front */}
      <polygon points={pts([[x - 30, y + 14], [x - 20, y + 19], [x - 16, y - 2], [x - 26, y - 7]])} fill="#1f9d55" {...S} />
      <ellipse cx={x - 23} cy={y + 6} rx="2.4" ry="4" fill="#f8f3e8" transform={`rotate(20 ${x - 23} ${y + 6})`} />
    </g>
  )
}

/** Battleship: a lighthouse on the lagoon, a grey warship tied up at the jetty. */
function ShipHouse({ x, y }: { x: number; y: number }) {
  const bands = 4
  const h = 54
  const wb = 10
  const wt = 7
  const at = (k: number, s: -1 | 1): P => [x + s * (wb + (wt - wb) * k), y - h * k]
  const sx = x + 34
  const sy = y + 20
  return (
    <g>
      {/* the jetty */}
      <polygon points={pts([[x + 8, y + 6], [x + 34, y + 19], [x + 30, y + 21], [x + 4, y + 8]])} fill="#a9744a" {...S} strokeWidth={1.2} />
      {/* the ship */}
      <g className="tm-rock">
        <polygon points={pts([[sx - 22, sy - 2], [sx + 18, sy - 14], [sx + 28, sy - 10], [sx + 22, sy - 4], [sx - 14, sy + 8]])} fill="#8e96a3" {...S} />
        <polygon points={pts([[sx - 22, sy - 2], [sx - 14, sy + 8], [sx - 12, sy + 11], [sx - 22, sy + 2]])} fill="#5f6672" {...S} strokeWidth={1} />
        <polygon points={pts([[sx - 4, sy - 7], [sx + 8, sy - 12], [sx + 8, sy - 20], [sx - 4, sy - 15]])} fill="#c3c8d0" {...S} strokeWidth={1.2} />
        <line x1={sx + 2} y1={sy - 16} x2={sx + 2} y2={sy - 28} stroke={INK} strokeWidth="1.5" />
        <line x1={sx + 12} y1={sy - 12} x2={sx + 22} y2={sy - 17} stroke={INK} strokeWidth="2" />
      </g>
      <ellipse cx={x + 4} cy={y + 3} rx="16" ry="6" fill="#000" opacity="0.12" />
      {Array.from({ length: bands }, (_, i) => (
        <polygon key={i} points={pts([at(i / bands, -1), at(i / bands, 1), at((i + 1) / bands, 1), at((i + 1) / bands, -1)])} fill={i % 2 ? '#f8f3e8' : '#e8291c'} {...S} />
      ))}
      <rect x={x - 8} y={y - h - 11} width="16" height="11" fill="#ffd23f" {...S} />
      <polygon points={pts([[x - 10, y - h - 11], [x + 10, y - h - 11], [x, y - h - 22]])} fill="#2f2b38" {...S} />
      <polygon className="tm-beam" points={pts([[x + 8, y - h - 6], [x + 60, y - h - 22], [x + 60, y - h + 8]])} fill="#ffe9a8" opacity="0.5" />
    </g>
  )
}

/** Othello: a green board-house, its roof one big disc, black side and white side. */
function OthelloHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 23, 16)
  const c = onTop(b, 0.5, 0.5)
  const rx = 27
  const ry = 13
  const lift = 9
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#1f7a4d" />
      {[0.25, 0.5, 0.75].map((u) => (
        <g key={u} stroke={shade('#1f7a4d', 0.45)} strokeWidth="1">
          <line x1={onLeft(b, u, 0)[0]} y1={onLeft(b, u, 0)[1]} x2={onLeft(b, u, 1)[0]} y2={onLeft(b, u, 1)[1]} />
          <line x1={onRight(b, u, 0)[0]} y1={onRight(b, u, 0)[1]} x2={onRight(b, u, 1)[0]} y2={onRight(b, u, 1)[1]} />
        </g>
      ))}
      <Door b={b} c="#f8f3e8" />
      {/* the disc: its edge, then the black-and-white top */}
      <ellipse cx={c[0]} cy={c[1] - lift + 5} rx={rx} ry={ry} fill="#2f2b38" {...S} />
      <ellipse cx={c[0]} cy={c[1] - lift} rx={rx} ry={ry} fill="#f8f3e8" {...S} />
      <path d={`M${c[0] - rx} ${c[1] - lift} A${rx} ${ry} 0 0 1 ${c[0] + rx} ${c[1] - lift} Z`} fill="#121016" />
    </g>
  )
}

/** Checkers: a little chequered castle with a crown flying over it (kinged). */
function CheckersHouse({ x, y }: { x: number; y: number }) {
  const b = box(x, y, 22, 26)
  const n = 4
  const sq = (f: (u: number, v: number) => P, k: string) =>
    Array.from({ length: n * n }, (_, i) => {
      const u = i % n
      const v = Math.floor(i / n)
      return <polygon key={`${k}${i}`} points={cell(f, u / n, v / n, (u + 1) / n, (v + 1) / n)} fill={(u + v) % 2 ? '#e8291c' : '#2f2b38'} />
    })
  const merlon = (p: P, k: number) => {
    const m = box(p[0], p[1], 4.5, 6)
    return (
      <g key={k}>
        <Walls b={m} left="#2f2b38" right="#17151c" top="#e8291c" />
      </g>
    )
  }
  const pole = onTop(b, 0.5, 0.5)
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left="#2f2b38" />
      {sq((u, v) => onLeft(b, u, v), 'l')}
      {sq((u, v) => onRight(b, u, v), 'r')}
      <polygon points={pts([up(b.L, b.h), up(b.F, b.h), up(b.R, b.h), up(b.B, b.h)])} fill="#25222c" {...S} />
      <polygon points={pts([b.L, b.F, up(b.F, b.h), up(b.L, b.h)])} fill="none" {...S} />
      <polygon points={pts([b.F, b.R, up(b.R, b.h), up(b.F, b.h)])} fill="none" {...S} />
      {[onTop(b, 0.12, 0.88), onTop(b, 0.12, 0.12), onTop(b, 0.88, 0.88), onTop(b, 0.88, 0.12)].map(merlon)}
      <line x1={pole[0]} y1={pole[1]} x2={pole[0]} y2={pole[1] - 30} stroke={INK} strokeWidth="2" />
      <path d={`M${pole[0]} ${pole[1] - 30} l14 3 l-14 6 Z`} fill="#ffd23f" stroke={INK} strokeWidth="1.2" />
      <path d={`M${pole[0] + 3} ${pole[1] - 24} l1.5 -3 l1.5 2 l1.5 -3 l1.5 3 l1 -2 v3 Z`} fill="#e8291c" />
    </g>
  )
}

/** Anything else: a plain house with a hip roof. */
function PlainHouse({ x, y, wall = '#f8f3e8' }: { x: number; y: number; wall?: string }) {
  const b = box(x, y, 24, 20)
  return (
    <g>
      <Shadow b={b} />
      <Walls b={b} left={wall} />
      <Door b={b} />
      <Window b={b} />
      <Roof b={b} rise={20} faces={['#2f2b38', '#17151c', '#2f2b38', '#17151c']} />
    </g>
  )
}

export function GameHouse({ game, x, y }: { game: string; x: number; y: number }) {
  switch (game) {
    case 'tictactoe':
      return <TttHouse x={x} y={y} />
    case 'connect4':
      return <C4House x={x} y={y} />
    case 'hangman':
      return <HangHouse x={x} y={y} />
    case 'dots':
      return <DotsHouse x={x} y={y} />
    case 'ludo':
      return <LudoHouse x={x} y={y} />
    case 'uno':
      return <UnoHouse x={x} y={y} />
    case 'battleship':
      return <ShipHouse x={x} y={y} />
    case 'othello':
      return <OthelloHouse x={x} y={y} />
    case 'checkers':
      return <CheckersHouse x={x} y={y} />
    default:
      return <PlainHouse x={x} y={y} />
  }
}

/* ── a touch of each owner, beside their house ── */

export function OwnerTouch({ look, x, y }: { look: OpsStyle; x: number; y: number }) {
  switch (look) {
    case 'bot': // a satellite dish
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - 16} stroke={INK} strokeWidth="2" />
          <path d={`M${x - 9} ${y - 22} A10 10 0 0 0 ${x + 7} ${y - 12} Z`} fill="#cfd6e0" stroke={INK} strokeWidth="1.4" />
          <line x1={x - 1} y1={y - 17} x2={x + 5} y2={y - 24} stroke={INK} strokeWidth="1.2" />
          <circle className="tm-blink2" cx={x + 5} cy={y - 24} r="1.8" fill="#e8291c" />
        </g>
      )
    case 'cyclops': // a big eye on a post, watching the road
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - 14} stroke={INK} strokeWidth="2" />
          <circle cx={x} cy={y - 22} r="8" fill="#f8f3e8" stroke={INK} strokeWidth="1.6" />
          <circle className="tm-look" cx={x + 1} cy={y - 22} r="4" fill="#2d5bff" />
          <circle className="tm-look" cx={x + 1} cy={y - 22} r="1.8" fill={INK} />
        </g>
      )
    case 'die': {
      const d = box(x, y, 7, 12)
      return (
        <g transform={`rotate(-8 ${x} ${y})`}>
          <Walls b={d} left="#ff8fb1" right="#e06a90" top="#ffb3c9" />
          <circle cx={onTop(d, 0.5, 0.5)[0]} cy={onTop(d, 0.5, 0.5)[1]} r="1.3" fill={INK} />
          <circle cx={onLeft(d, 0.3, 0.3)[0]} cy={onLeft(d, 0.3, 0.3)[1]} r="1.2" fill={INK} />
          <circle cx={onLeft(d, 0.7, 0.7)[0]} cy={onLeft(d, 0.7, 0.7)[1]} r="1.2" fill={INK} />
        </g>
      )
    }
    case 'prime': {
      // a glowing Energon cube
      const d = box(x, y, 8, 13)
      return (
        <g className="tm-glow">
          <Walls b={d} left="#62c8ff" right="#2d9ee0" top="#b8e8ff" />
          <polygon points={cell((u, v) => onLeft(d, u, v), 0.25, 0.25, 0.75, 0.75)} fill="#e8faff" opacity="0.7" />
        </g>
      )
    }
    case 'warrior': // a stump with his axe in it
      return (
        <g>
          <ellipse cx={x} cy={y} rx="9" ry="4.5" fill="#7a5a3a" stroke={INK} strokeWidth="1.4" />
          <rect x={x - 9} y={y - 7} width="18" height="7" fill="#8a6a4a" />
          <ellipse cx={x} cy={y - 7} rx="9" ry="4.5" fill="#c9a37a" stroke={INK} strokeWidth="1.4" />
          <line x1={x + 1} y1={y - 8} x2={x + 10} y2={y - 26} stroke="#6a4a2a" strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M${x - 3} ${y - 6} L${x + 4} ${y - 14} L${x + 6} ${y - 6} Z`} fill="#cfd6e0" stroke={INK} strokeWidth="1.2" />
        </g>
      )
    case 'titan': // the gauntlet, stones set in it
      return (
        <g>
          <rect x={x - 7} y={y - 18} width="14" height="16" rx="3" fill="#e0b21f" stroke={INK} strokeWidth="1.5" />
          <rect x={x - 6} y={y - 2} width="12" height="4" fill="#c9951a" stroke={INK} strokeWidth="1.2" />
          {['#e8291c', '#2d5bff', '#1f9d55', '#9b3fd6', '#ff8a00'].map((c, i) => (
            <circle key={c} cx={x - 5 + (i % 3) * 5} cy={y - 14 + Math.floor(i / 3) * 6} r="1.6" fill={c} />
          ))}
        </g>
      )
    case 'spider': // a web strung from the house to a post
    case 'anansi':
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - 34} stroke="#6a4a2a" strokeWidth="2" />
          <g stroke="#f8f3e8" strokeWidth="0.9" fill="none" opacity="0.95">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={x} y1={y - 34} x2={x - 24 + i * 6} y2={y - 34 + 16 - Math.abs(i - 2) * 3} />
            ))}
            {[6, 11, 16].map((r) => (
              <path key={r} d={`M${x - r * 1.3} ${y - 34 + r * 0.6} Q${x - r * 0.7} ${y - 34 + r} ${x} ${y - 34 + r * 0.5}`} />
            ))}
          </g>
          <line x1={x - 10} y1={y - 26} x2={x - 10} y2={y - 16} stroke={INK} strokeWidth="0.8" />
          <g className="tm-dangle">
            <circle cx={x - 10} cy={y - 14} r="2.6" fill={look === 'anansi' ? '#8a4b1f' : '#e8291c'} stroke={INK} strokeWidth="1" />
            <path d={`M${x - 14} ${y - 16} l8 4 M${x - 14} ${y - 12} l8 -4`} stroke={INK} strokeWidth="0.8" />
          </g>
        </g>
      )
    case 'brute': // a smashed wall, rubble everywhere
      return (
        <g>
          {[[-6, 0, 5], [2, 2, 6], [8, -1, 4], [-1, -5, 4]].map(([dx, dy, r], i) => (
            <polygon key={i} points={pts([[x + dx - r, y + dy], [x + dx - r * 0.3, y + dy - r], [x + dx + r, y + dy - r * 0.4], [x + dx + r * 0.6, y + dy + r * 0.5]])} fill={i % 2 ? '#8e96a3' : '#a9b0bb'} stroke={INK} strokeWidth="1.2" />
          ))}
          <path d={`M${x - 14} ${y - 2} l3 -4 l3 3`} stroke="#5aa83a" strokeWidth="2" fill="none" />
        </g>
      )
    case 'ghost':
      return (
        <g className="tm-float" opacity="0.88">
          <path d={`M${x - 8} ${y - 6} V${y - 20} A8 8 0 0 1 ${x + 8} ${y - 20} V${y - 6} l-3 -3 l-2.5 3 l-2.5 -3 l-2.5 3 l-2.5 -3 Z`} fill="#f8f3e8" stroke={INK} strokeWidth="1.4" />
          <circle cx={x - 3} cy={y - 19} r="1.6" fill={INK} />
          <circle cx={x + 3} cy={y - 19} r="1.6" fill={INK} />
          <ellipse cx={x} cy={y + 4} rx="7" ry="2.4" fill="#000" opacity="0.12" />
        </g>
      )
    case 'trotro': {
      // his trotro, parked
      const d = box(x, y, 14, 12, 0.5)
      return (
        <g>
          <Shadow b={d} k={0.6} />
          <Walls b={d} left="#ffd23f" right="#e0b21f" top="#f8f3e8" />
          <polygon points={cell((u, v) => onLeft(d, u, v), 0.1, 0.45, 0.9, 0.85)} fill="#bfe3ff" stroke={INK} strokeWidth="0.8" />
          <polygon points={cell((u, v) => onRight(d, u, v), 0.2, 0.45, 0.8, 0.85)} fill="#9ccbe8" stroke={INK} strokeWidth="0.8" />
          <circle cx={onLeft(d, 0.2, 0)[0]} cy={onLeft(d, 0.2, 0)[1]} r="2.4" fill={INK} />
          <circle cx={onLeft(d, 0.8, 0)[0]} cy={onLeft(d, 0.8, 0)[1]} r="2.4" fill={INK} />
          {/* the roof rack */}
          <rect x={onTop(d, 0.5, 0.5)[0] - 6} y={onTop(d, 0.5, 0.5)[1] - 5} width="12" height="4" fill="#b07a4a" stroke={INK} strokeWidth="0.8" />
        </g>
      )
    }
    case 'bat': // the signal, shining up from his roof
      return (
        <g>
          <polygon className="tm-beam" points={pts([[x - 3, y], [x + 3, y], [x + 22, y - 70], [x - 2, y - 74]])} fill="#ffe9a8" opacity="0.4" />
          <ellipse cx={x + 10} cy={y - 74} rx="14" ry="7" fill="#ffd23f" stroke={INK} strokeWidth="1.2" />
          <path d={`M${x + 1} ${y - 74} q4 -4 6 -1 q1 -3 3 -3 q2 0 3 3 q2 -3 6 1 q-4 1 -5 4 q-2 -2 -4 0 q-2 -2 -4 0 q-1 -3 -5 -4 Z`} fill={INK} />
          <rect x={x - 4} y={y - 4} width="8" height="6" fill="#2f2b38" stroke={INK} strokeWidth="1" />
        </g>
      )
    case 'queen': // the golden stool
      return (
        <g>
          <path d={`M${x - 11} ${y - 14} Q${x} ${y - 8} ${x + 11} ${y - 14} L${x + 9} ${y - 10} Q${x} ${y - 5} ${x - 9} ${y - 10} Z`} fill="#ffd23f" stroke={INK} strokeWidth="1.4" />
          <rect x={x - 4} y={y - 9} width="8" height="7" fill="#e0b21f" stroke={INK} strokeWidth="1.2" />
          <path d={`M${x - 9} ${y - 1} H${x + 9} L${x + 7} ${y + 2} H${x - 7} Z`} fill="#c9951a" stroke={INK} strokeWidth="1.2" />
        </g>
      )
    case 'addo': // the flag, and a pile of Free SHS books
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - 36} stroke={INK} strokeWidth="2" />
          <g className="tm-wave">
            <rect x={x} y={y - 36} width="18" height="4" fill="#e8291c" />
            <rect x={x} y={y - 32} width="18" height="4" fill="#ffd23f" />
            <rect x={x} y={y - 28} width="18" height="4" fill="#1f9d55" />
            <path d={`M${x + 9} ${y - 32.6} l0.9 2 h2 l-1.6 1.2 l0.6 2 l-1.9 -1.2 l-1.9 1.2 l0.6 -2 l-1.6 -1.2 h2 Z`} fill={INK} />
            <rect x={x} y={y - 36} width="18" height="12" fill="none" stroke={INK} strokeWidth="1" />
          </g>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={x + 6 - i} y={y - 4 - i * 4} width="14" height="4" fill={['#2d5bff', '#e8291c', '#1f9d55'][i]} stroke={INK} strokeWidth="1" />
          ))}
        </g>
      )
    default:
      return null
  }
}

/* ── scenery ── */

export type Zone = 'field' | 'savanna' | 'forest' | 'city'
export const GROUND: Record<Zone, { top: string; side: string; plot: string }> = {
  field: { top: '#a7d873', side: '#6aa344', plot: '#c3e69a' },
  savanna: { top: '#f1c27c', side: '#c98a3a', plot: '#f7d9a6' },
  forest: { top: '#5fae6b', side: '#2f7a45', plot: '#86c690' },
  city: { top: '#d9d2c4', side: '#9d958a', plot: '#ece6da' },
}

export function Tree({ x, y, kind, s = 1 }: { x: number; y: number; kind: Zone; s?: number }) {
  if (kind === 'savanna')
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="2" cy="1" rx="10" ry="3" fill="#000" opacity="0.1" />
        <path d="M-5 0 L-3 -16 L3 -16 L5 0 Z" fill="#8a6a4a" stroke={INK} strokeWidth="1" />
        <path d="M-3 -16 L-9 -22 M0 -16 L0 -24 M3 -16 L9 -22" stroke="#8a6a4a" strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="0" cy="-25" rx="13" ry="5" fill="#7d9b3a" stroke={INK} strokeWidth="1" />
        <ellipse cx="3" cy="-25.5" rx="8" ry="3.4" fill="#5e7d2a" />
      </g>
    )
  if (kind === 'field')
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="3" cy="1" rx="8" ry="2.6" fill="#000" opacity="0.1" />
        <rect x="-1.5" y="-8" width="3" height="8" fill="#7a5a3a" />
        <circle cx="0" cy="-14" r="8" fill="#7cc35a" stroke={INK} strokeWidth="1" />
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
      <ellipse cx="3" cy="1" rx="9" ry="2.8" fill="#000" opacity="0.12" />
      <rect x="-1.5" y="-6" width="3" height="6" fill="#6a4a2a" />
      <path d="M0 -32 L-10 -5 L0 -5 Z" fill="#3f9a55" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M0 -32 L10 -5 L0 -5 Z" fill="#2c6e3c" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
    </g>
  )
}

/** A low bush: a few round lumps. */
export function Bush({ x, y, s = 1, c = '#4c9a4a' }: { x: number; y: number; s?: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="2" cy="2" rx="11" ry="3" fill="#000" opacity="0.1" />
      <circle cx="-5" cy="-3" r="5" fill={c} stroke={INK} strokeWidth="0.9" />
      <circle cx="5" cy="-3" r="5" fill={shade(c, 0.15)} stroke={INK} strokeWidth="0.9" />
      <circle cx="0" cy="-7" r="6" fill={c} stroke={INK} strokeWidth="0.9" />
    </g>
  )
}

export function Rock({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="-6,0 -3,-5 3,-6 7,-1 3,2" fill="#a9b0bb" stroke={INK} strokeWidth="0.9" />
      <polygon points="-3,-5 3,-6 7,-1 1,-2" fill="#c3c8d0" />
    </g>
  )
}

export function Flowers({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[[-3, 0, '#ff5a1f'], [2, -2, '#ffd23f'], [5, 1, '#f8f3e8'], [-1, 3, '#ff8fb1']].map(([dx, dy, c], i) => (
        <circle key={i} cx={x + (dx as number)} cy={y + (dy as number)} r="1.5" fill={c as string} />
      ))}
    </g>
  )
}

/** A termite mound, as seen all over the north. */
export function Mound({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x + 3} cy={y + 1} rx="8" ry="2.4" fill="#000" opacity="0.1" />
      <path d={`M${x - 7} ${y} Q${x - 4} ${y - 10} ${x - 1} ${y - 20} Q${x + 1} ${y - 24} ${x + 2} ${y - 16} Q${x + 4} ${y - 8} ${x + 7} ${y} Z`} fill="#c97a42" stroke={INK} strokeWidth="1" />
    </g>
  )
}

/** A goat, grazing. */
export function Goat({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx="0" cy="-5" rx="6" ry="3.4" fill="#f8f3e8" stroke={INK} strokeWidth="0.9" />
      <path d="M5 -6 l4 -3 l1 3 Z" fill="#f8f3e8" stroke={INK} strokeWidth="0.9" />
      <path d="M-4 -2 v3 M-1 -2 v3 M2 -2 v3 M4 -2 v3" stroke={INK} strokeWidth="1" />
      <circle cx="-2" cy="-6" r="1.4" fill="#6a4a2a" />
    </g>
  )
}
