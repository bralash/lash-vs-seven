/*
 * Mini golf from above. A course is 1 wide and LENGTH long (y grows down the screen); its green is
 * a polygon walled all round, with more walls, round bumpers, sand (slows the ball), water (back to
 * where you shot from, +1) and at most one moving blocker, a bar that slides to and fro.
 *
 * Fixed 1/240 s steps, so the same shot from the same spot (and the same blocker phase) plays out the
 * same on every phone; the shooter's end position is kept anyway, so any drift doesn't last.
 */

export const WIDTH = 1
export const LENGTH = 1.6
/** ball radius */
export const R = 0.024
/** cup radius (a touch bigger than real) */
export const CUP = 0.042
/** half the thickness of a wall */
export const WALL = 0.012
/** half the thickness of the moving bar */
export const BAR = 0.016

export const MAX_SPEED = 2.6
const DRAG = 1.0
const SAND_DRAG = 5.5
const WALL_BOUNCE = 0.78
const BUMPER_BOUNCE = 1.0
/** extra speed a bumper gives the ball, away from it */
const BUMPER_KICK = 0.25
/** slower than this over the cup and it drops */
const CAPTURE = 0.45
/** faster than that, the lip still takes some of the pace */
const LIP = 0.85

const STEP = 1 / 240
/** frames are kept at 60 a second for the screen */
export const FRAME_DT = 1 / 60
const STEPS_PER_FRAME = 4
const MAX_TIME = 14

export type Pt = [number, number]
/** [x, y, w, h] is a rectangle, [x, y, r] a circle */
export type Area = [number, number, number, number] | [number, number, number]

export interface Mover {
  /** the bar's middle slides between a and b and back */
  a: Pt
  b: Pt
  /** its length, and its angle (0 = across) */
  len: number
  angle?: number
  /** seconds there and back */
  period: number
}

export interface Hole {
  id: string
  name: string
  par: number
  /** 1 easy, 2 middling, 3 hard */
  tier: 1 | 2 | 3
  green: Pt[]
  tee: Pt
  cup: Pt
  /** [x1, y1, x2, y2] */
  walls?: [number, number, number, number][]
  /** [x, y, r] */
  bumpers?: [number, number, number][]
  sand?: Area[]
  water?: Area[]
  mover?: Mover
}

export interface Shot {
  angle: number
  /** 0–1 */
  power: number
  /** where the moving blocker was in its swing when the ball was struck (seconds) */
  phase: number
}

export type Ev =
  | { t: number; k: 'wall'; speed: number }
  | { t: number; k: 'bump'; speed: number }
  | { t: number; k: 'lip' }
  | { t: number; k: 'in' }
  | { t: number; k: 'splash' }

export interface Outcome {
  /** the ball's x, y at each screen frame */
  frames: Pt[]
  end: Pt
  events: Ev[]
  holed: boolean
  /** into the water: the ball goes back to where it was struck from */
  wet: boolean
}

export const speedOf = (power: number) => MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.25)

/** The blocker's two ends at time t. */
export function barAt(m: Mover, t: number): [Pt, Pt, Pt] {
  const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / m.period)
  const cx = m.a[0] + (m.b[0] - m.a[0]) * k
  const cy = m.a[1] + (m.b[1] - m.a[1]) * k
  const a = m.angle ?? 0
  const hx = (Math.cos(a) * m.len) / 2
  const hy = (Math.sin(a) * m.len) / 2
  return [[cx - hx, cy - hy], [cx + hx, cy + hy], [cx, cy]]
}
/** how fast the blocker moves at time t */
function barVel(m: Mover, t: number): Pt {
  const w = (2 * Math.PI) / m.period
  const dk = 0.5 * w * Math.sin(w * t)
  return [(m.b[0] - m.a[0]) * dk, (m.b[1] - m.a[1]) * dk]
}

export const inArea = (a: Area, x: number, y: number, grow = 0) =>
  a.length === 4 ? x > a[0] - grow && x < a[0] + a[2] + grow && y > a[1] - grow && y < a[1] + a[3] + grow : Math.hypot(x - a[0], y - a[1]) < a[2] + grow

export function inPoly(poly: Pt[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Every wall of a hole as a segment: the green's edges and the walls on it. */
export function wallsOf(h: Hole): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (let i = 0; i < h.green.length; i++) {
    const a = h.green[i]
    const b = h.green[(i + 1) % h.green.length]
    out.push([a[0], a[1], b[0], b[1]])
  }
  return out.concat(h.walls ?? [])
}

/** the nearest point to (x, y) on a segment */
export function nearest(s: readonly number[], x: number, y: number): Pt {
  const dx = s[2] - s[0]
  const dy = s[3] - s[1]
  const l2 = dx * dx + dy * dy
  const k = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l2)) : 0
  return [s[0] + dx * k, s[1] + dy * k]
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

const segCache = new WeakMap<Hole, [number, number, number, number][]>()
const segsOf = (h: Hole) => {
  let s = segCache.get(h)
  if (!s) segCache.set(h, (s = wallsOf(h)))
  return s
}

/** Play a shot out from `from`. */
export function simulate(h: Hole, from: Pt, shot: Shot, keepFrames = true): Outcome {
  let [x, y] = from
  const sp = speedOf(shot.power)
  let vx = Math.cos(shot.angle) * sp
  let vy = Math.sin(shot.angle) * sp
  const segs = segsOf(h)
  const frames: Pt[] = [[x, y]]
  const events: Ev[] = []
  let holed = false
  let wet = false
  let t = 0
  let n = 0
  let overCup = false

  while (t < MAX_TIME) {
    t += STEP
    n++
    const s = Math.hypot(vx, vy)
    if (s === 0) break
    const sandy = h.sand?.some((a) => inArea(a, x, y)) ?? false
    const ns = Math.max(0, s - (sandy ? SAND_DRAG : DRAG) * STEP)
    vx *= ns / s
    vy *= ns / s
    x += vx * STEP
    y += vy * STEP

    // walls
    for (const w of segs) {
      const [qx, qy] = nearest(w, x, y)
      const dx = x - qx
      const dy = y - qy
      const min = R + WALL
      if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue
      const d = Math.hypot(dx, dy)
      if (d >= min || d === 0) continue
      const nx = dx / d
      const ny = dy / d
      x = qx + nx * min
      y = qy + ny * min
      const into = vx * nx + vy * ny
      if (into < 0) {
        events.push({ t, k: 'wall', speed: -into })
        vx -= (1 + WALL_BOUNCE) * into * nx
        vy -= (1 + WALL_BOUNCE) * into * ny
      }
    }
    // bumpers
    for (const [bx, by, br] of h.bumpers ?? []) {
      const dx = x - bx
      const dy = y - by
      const d = Math.hypot(dx, dy)
      const min = R + br
      if (d >= min || d === 0) continue
      const nx = dx / d
      const ny = dy / d
      x = bx + nx * min
      y = by + ny * min
      const into = vx * nx + vy * ny
      if (into < 0) {
        events.push({ t, k: 'bump', speed: -into })
        vx -= (1 + BUMPER_BOUNCE) * into * nx - BUMPER_KICK * nx
        vy -= (1 + BUMPER_BOUNCE) * into * ny - BUMPER_KICK * ny
        const v = Math.hypot(vx, vy)
        if (v > MAX_SPEED) (vx *= MAX_SPEED / v), (vy *= MAX_SPEED / v)
      }
    }
    // the moving blocker
    if (h.mover) {
      const pt = shot.phase + t
      const [a, b] = barAt(h.mover, pt)
      const [qx, qy] = nearest([a[0], a[1], b[0], b[1]], x, y)
      const dx = x - qx
      const dy = y - qy
      const d = Math.hypot(dx, dy)
      const min = R + BAR
      if (d < min && d > 0) {
        const nx = dx / d
        const ny = dy / d
        x = qx + nx * min
        y = qy + ny * min
        const [wx, wy] = barVel(h.mover, pt)
        const into = (vx - wx) * nx + (vy - wy) * ny
        if (into < 0) {
          events.push({ t, k: 'wall', speed: -into })
          vx -= (1 + WALL_BOUNCE) * into * nx
          vy -= (1 + WALL_BOUNCE) * into * ny
          const v = Math.hypot(vx, vy)
          if (v > MAX_SPEED) (vx *= MAX_SPEED / v), (vy *= MAX_SPEED / v)
        }
      }
    }
    // water: back where it came from
    if (h.water?.some((a) => inArea(a, x, y))) {
      events.push({ t, k: 'splash' })
      wet = true
      if (keepFrames) frames.push([x, y])
      break
    }
    // the cup
    const dc = Math.hypot(x - h.cup[0], y - h.cup[1])
    if (dc < CUP) {
      const v = Math.hypot(vx, vy)
      if (v < CAPTURE) {
        holed = true
        events.push({ t, k: 'in' })
        x = h.cup[0]
        y = h.cup[1]
        if (keepFrames) frames.push([x, y])
        break
      }
      if (!overCup) {
        overCup = true
        events.push({ t, k: 'lip' })
        vx *= LIP
        vy *= LIP
      }
    } else overCup = false

    if (keepFrames && n % STEPS_PER_FRAME === 0) frames.push([x, y])
  }
  if (keepFrames) frames.push([x, y])
  const end: Pt = wet ? [from[0], from[1]] : [round(x), round(y)]
  return { frames, end, events, holed, wet }
}
