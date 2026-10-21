import { squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { holeById } from './holes'
import { LENGTH, R, WALL, WIDTH, inArea, inPoly, nearest, simulate, wallsOf, type Hole, type Pt, type Shot } from './physics'
import { HOLES_PER_MATCH, cardOf, type Live } from './rules'

/*
 * Ops putts from inside the match screen, once the last shot has stopped rolling (the shared brain
 * would fire while the ball is still moving), so the turn-by-turn brain has nothing to do.
 *
 * She knows how far each spot is from the cup the way a ball has to go round (a walk over a grid
 * from the cup, round the walls and the water, sand counting extra), tries shots all the way round
 * at a range of strengths, and takes the one that ends nearest by that walk. Then her hand shakes.
 */
export const golfBrain: Brain = () => null

/** how long she lines a shot up (ms): [least, most] */
export const OPS_THINK: Record<Level, [number, number]> = {
  easy: [900, 1700],
  medium: [900, 1600],
  hard: [800, 1400],
}

/** how far off she can be: aim (radians), power, and how many of her best she picks among */
const SLIP: Record<Level, { aim: number; power: number; top: number }> = {
  easy: { aim: 0.08, power: 0.24, top: 5 },
  medium: { aim: 0.055, power: 0.16, top: 1 },
  hard: { aim: 0.035, power: 0.1, top: 1 },
}

/* ── the walk to the cup ── */
const CELL = 0.02
const GW = Math.ceil(WIDTH / CELL)
const GH = Math.ceil(LENGTH / CELL)
const fields = new Map<string, Float32Array>()

function fieldOf(h: Hole) {
  let f = fields.get(h.id)
  if (f) return f
  const segs = wallsOf(h)
  const open = new Uint8Array(GW * GH)
  const cost = new Float32Array(GW * GH).fill(1)
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) * CELL
      const y = (j + 0.5) * CELL
      if (!inPoly(h.green, x, y)) continue
      if (segs.some((s) => Math.hypot(...sub(nearest(s, x, y), x, y)) < R + WALL)) continue
      if ((h.bumpers ?? []).some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br + R)) continue
      if ((h.water ?? []).some((a) => inArea(a, x, y, R * 0.5))) continue
      open[j * GW + i] = 1
      if ((h.sand ?? []).some((a) => inArea(a, x, y))) cost[j * GW + i] = 3
    }
  f = new Float32Array(GW * GH).fill(Infinity)
  const ci = Math.min(GW - 1, Math.floor(h.cup[0] / CELL))
  const cj = Math.min(GH - 1, Math.floor(h.cup[1] / CELL))
  f[cj * GW + ci] = 0
  // a small Dijkstra over 8 neighbours (the grid is a few thousand cells, a sorted queue is plenty)
  const q: number[] = [cj * GW + ci]
  const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
  while (q.length) {
    let bi = 0
    for (let k = 1; k < q.length; k++) if (f[q[k]] < f[q[bi]]) bi = k
    const c = q[bi]
    q[bi] = q[q.length - 1]
    q.pop()
    const ci2 = c % GW
    const cj2 = (c - ci2) / GW
    for (const [di, dj, l] of steps) {
      const ni = ci2 + di
      const nj = cj2 + dj
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue
      const k = nj * GW + ni
      if (!open[k]) continue
      const d = f[c] + l * CELL * cost[k]
      if (d < f[k]) {
        if (f[k] === Infinity) q.push(k)
        f[k] = d
      }
    }
  }
  fields.set(h.id, f)
  return f
}
const sub = (p: Pt, x: number, y: number): Pt => [p[0] - x, p[1] - y]

/** how far a ball at (x, y) has to go round to the cup */
export function walk(h: Hole, x: number, y: number) {
  const f = fieldOf(h)
  const i = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)))
  const j = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)))
  let best = f[j * GW + i]
  // a ball hard against a wall sits in a closed cell: take the best one next to it
  if (best === Infinity)
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const ii = i + di
        const jj = j + dj
        if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue
        best = Math.min(best, f[jj * GW + ii] + Math.hypot(di, dj) * CELL)
      }
  return best === Infinity ? 3 : best
}

/** shots a unit of walk is worth, roughly */
const PER_UNIT = 1.3

/** How many more shots she expects after this one (fewer is better), as a negative number. */
function score(h: Hole, from: Pt, s: Shot) {
  const out = simulate(h, from, s, false)
  if (out.holed) return 0
  if (out.wet) return -2 - walk(h, from[0], from[1]) * PER_UNIT
  const d = walk(h, out.end[0], out.end[1])
  return -1 - Math.max(0, d - 0.1) * PER_UNIT
}

const shake = (s: Shot, level: Level): Shot => ({
  angle: s.angle + (Math.random() * 2 - 1) * SLIP[level].aim,
  power: Math.max(0.05, Math.min(1, s.power * (1 + (Math.random() * 2 - 1) * SLIP[level].power))),
  phase: s.phase,
})

/** Her shot from `from` on `hole`, struck with the blocker at `phase`. */
export function opsShot(h: Hole, from: Pt, phase: number, level: Level): Shot {
  const tried: { s: Shot; v: number }[] = []
  const try1 = (angle: number, power: number) => {
    const s = { angle, power: Math.max(0.05, Math.min(1, power)), phase }
    tried.push({ s, v: score(h, from, s) })
  }
  const ANGLES = 72
  const powers = [0.14, 0.22, 0.3, 0.4, 0.5, 0.6, 0.72, 0.86, 1]
  for (let a = 0; a < ANGLES; a++) for (const p of powers) try1((a / ANGLES) * Math.PI * 2, p)
  // and straight at the cup at every strength, which the grid of angles can step over
  const direct = Math.atan2(h.cup[1] - from[1], h.cup[0] - from[0])
  for (let p = 0.06; p <= 1; p += 0.04) try1(direct, p)
  tried.sort((a, b) => b.v - a.v)
  // her best few, judged by how they come out with her hand shaking (a perfect bank that only
  // drops if struck exactly is worth less than a safe one): Easy doesn't think that far
  let best = tried.slice(0, SLIP[level].top)
  if (level !== 'easy') {
    const tries = level === 'hard' ? 8 : 4
    best = tried.slice(0, level === 'hard' ? 12 : 6).map((t) => {
      let v = 0
      for (let k = 0; k < tries; k++) v += score(h, from, shake(t.s, level))
      return { s: t.s, v: v / tries }
    })
    best.sort((a, b) => b.v - a.v)
  }
  const pick = level === 'easy' ? best[Math.floor(Math.random() * best.length)] : best[0]
  return shake(pick.s, level)
}

const live = (s: Record<string, unknown>) => (s as { live?: Live }).live

/** her lead in shots (more is better for her), this hole counted by how far each ball still has to go */
function lead(l: Live) {
  const sum = (s: Seat) => cardOf(l, s).slice(0, HOLES_PER_MATCH).reduce((a, b) => a + b, 0)
  let d = sum(0) - sum(1)
  if (!l.result) {
    const h = holeById(l.holes[l.at])
    const left = (s: Seat) => l.balls[s].n + (l.balls[s].done ? 0 : 1 + walk(h, l.balls[s].x, l.balls[s].y) * 1.2)
    d += left(0) - left(1)
  }
  return d
}

/** How Ops reads a match: shots ahead or behind, and the moments (in, an ace, a splash). */
export const golfSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${l.shot?.n ?? 0}` : ''
  },
  turn: (s) => {
    const l = live(s)
    return l && !l.result ? l.turn : null
  },
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    return squash(lead(l), 2.5)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = live(prev)
    const b = live(next)
    const sh = b?.shot
    if (!a || !b || !sh || sh.n === a.shot?.n) return null
    const shots = sh.at === a.at ? b.balls[sh.by].n : (sh.by === 0 ? b.c0 : b.c1)?.[sh.at]
    if (sh.by === 1) {
      if (sh.holed) return { moment: 'took', said: shots === 1 ? 'ACE!' : 'In!' }
      if (sh.wet) return { moment: 'unlucky', said: 'Splash…' }
    } else {
      if (sh.holed && shots === 1) return { moment: 'lost', said: 'No way' }
      if (sh.wet) return { moment: 'lucky', said: 'Swim!' }
    }
    return null
  },
}
