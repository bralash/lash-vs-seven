/*
 * Pool, seen from above with the table standing up: x runs across (0…1), y down its length (0 at
 * the far end, 2 at yours). Balls roll, slow down, knock into each other and the cushions, and drop
 * into the six pockets, worked out in small fixed steps. The same shot from the same position always
 * plays out the same way on one phone; online, the shooter's phone sends where the balls ended up, so
 * phones that work it out a hair differently still agree.
 *
 * A position is 16 balls (0 the cue ball, 1–15 the rest) as a flat list of x, y; a pocketed ball is
 * at -1, -1.
 */

export const BALLS = 16
/** ball radius, in table widths: a third bigger than a real 2¼" ball on a 50" table, so it reads on a phone */
export const R = 0.03
export const WIDTH = 1
export const LENGTH = 2
/** behind this line you break from (the head string), and where the cue ball goes back after a scratch */
export const HEAD_Y = 1.5
export const HEAD_SPOT = { x: 0.5, y: HEAD_Y }
/** the apex of the rack */
export const FOOT_SPOT = { x: 0.5, y: 0.5 }

export type Pos = number[]
export const OFF = -1
export const onTable = (p: Pos, i: number) => p[i * 2] !== OFF

/** the pockets: where each one sits (just outside the cushions) and how close a ball's centre must come */
export const POCKETS = [
  { x: -0.014, y: -0.014, r: 0.076 },
  { x: 1.014, y: -0.014, r: 0.076 },
  { x: -0.04, y: 1, r: 0.07 },
  { x: 1.04, y: 1, r: 0.07 },
  { x: -0.014, y: 2.014, r: 0.076 },
  { x: 1.014, y: 2.014, r: 0.076 },
]
/** along a cushion this close to a corner, or to the middle of a long side, there's a pocket's mouth instead */
export const CORNER_MOUTH = 0.096
export const SIDE_MOUTH = 0.065
/**
 * The jaws: where each cushion ends at a pocket it turns back into the rail, so a ball that catches
 * the edge of a pocket bounces off it (and can rattle between the two) instead of slipping by. Each is
 * a short wall from the cushion's nose back towards the pocket: 45° at the corners, shallower at the sides.
 */
const J = 0.045
const SJ = 0.04
export const JAWS: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [
  // top left, top right
  { a: { x: CORNER_MOUTH, y: 0 }, b: { x: CORNER_MOUTH - J, y: -J } },
  { a: { x: 0, y: CORNER_MOUTH }, b: { x: -J, y: CORNER_MOUTH - J } },
  { a: { x: WIDTH - CORNER_MOUTH, y: 0 }, b: { x: WIDTH - CORNER_MOUTH + J, y: -J } },
  { a: { x: WIDTH, y: CORNER_MOUTH }, b: { x: WIDTH + J, y: CORNER_MOUTH - J } },
  // the sides
  { a: { x: 0, y: 1 - SIDE_MOUTH }, b: { x: -SJ, y: 1 - SIDE_MOUTH + SJ * 0.35 } },
  { a: { x: 0, y: 1 + SIDE_MOUTH }, b: { x: -SJ, y: 1 + SIDE_MOUTH - SJ * 0.35 } },
  { a: { x: WIDTH, y: 1 - SIDE_MOUTH }, b: { x: WIDTH + SJ, y: 1 - SIDE_MOUTH + SJ * 0.35 } },
  { a: { x: WIDTH, y: 1 + SIDE_MOUTH }, b: { x: WIDTH + SJ, y: 1 + SIDE_MOUTH - SJ * 0.35 } },
  // bottom left, bottom right
  { a: { x: CORNER_MOUTH, y: LENGTH }, b: { x: CORNER_MOUTH - J, y: LENGTH + J } },
  { a: { x: 0, y: LENGTH - CORNER_MOUTH }, b: { x: -J, y: LENGTH - CORNER_MOUTH + J } },
  { a: { x: WIDTH - CORNER_MOUTH, y: LENGTH }, b: { x: WIDTH - CORNER_MOUTH + J, y: LENGTH + J } },
  { a: { x: WIDTH, y: LENGTH - CORNER_MOUTH }, b: { x: WIDTH + J, y: LENGTH - CORNER_MOUTH + J } },
]

/** fastest a cue can send the ball (table widths a second): a full-power break */
export const MAX_SPEED = 6.5
/** rolling slows a ball by this much a second, every second */
const ROLL = 0.42
/** and the cloth takes this share of its speed a second as well (a fast ball dies sooner) */
const DRAG = 0.12
const BALL_BOUNCE = 0.95
const CUSHION_BOUNCE = 0.72
const STOP = 0.006
const DT = 1 / 600
/** the shot is sampled this often for the screen */
export const FRAME_DT = 1 / 60
const MAX_T = 14

export interface Shot {
  /** which way the cue points, in radians (0 along +x, π/2 down the table towards you) */
  angle: number
  /** 0…1 */
  power: number
  /** follow (+) or draw (−), −1…1: after the cue ball hits the first ball it rolls on or comes back */
  spin: number
  /** side spin, −1 (left) … 1 (right): the cue ball comes off the cushions wider that way */
  side?: number
}

export type Ev =
  | { t: number; k: 'ball'; a: number; b: number; speed: number }
  | { t: number; k: 'cushion'; a: number; speed: number }
  /** where it was as it dropped, so the screen can show it going down the hole */
  | { t: number; k: 'pot'; a: number; pocket: number; x: number; y: number }

export interface Outcome {
  /** the position every FRAME_DT, from the strike to the last ball stopping */
  frames: Float32Array[]
  end: Pos
  events: Ev[]
  /** the first ball the cue ball touched (null: none) */
  first: number | null
  /** balls pocketed, in order */
  potted: number[]
}

export const speedOf = (power: number) => MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.5)

const inMouth = (x: number, y: number) => {
  const nearEnd = y < CORNER_MOUTH || y > LENGTH - CORNER_MOUTH
  const nearSide = x < CORNER_MOUTH || x > WIDTH - CORNER_MOUTH
  return (nearEnd && nearSide) || ((x < R * 2 || x > WIDTH - R * 2) && Math.abs(y - 1) < SIDE_MOUTH)
}

/** Plays a shot out from `start`. */
export function simulate(start: Pos, shot: Shot): Outcome {
  const p = start.slice()
  const v = new Array<number>(BALLS * 2).fill(0)
  const s0 = speedOf(shot.power)
  const dir = { x: Math.cos(shot.angle), y: Math.sin(shot.angle) }
  v[0] = dir.x * s0
  v[1] = dir.y * s0
  const events: Ev[] = []
  const potted: number[] = []
  let first: number | null = null
  const frames: Float32Array[] = [Float32Array.from(p)]
  let t = 0
  let nextFrame = FRAME_DT
  let spun = false
  /** side spin left on the cue ball: most of it goes into the first cushion, the rest into the next */
  let side = Math.max(-1, Math.min(1, shot.side ?? 0))
  /** a ball (only the cue ball has side) coming off a cushion, given the speed it hit with and which way it was going */
  const english = (i: number, hit: number, ix: number, iy: number) => {
    if (i !== 0 || !side) return
    const l = Math.hypot(ix, iy) || 1
    // the shooter's right, as the ball was travelling
    v[0] += (-iy / l) * side * 0.4 * hit
    v[1] += (ix / l) * side * 0.4 * hit
    side *= 0.5
  }

  const pot = (i: number) => {
    let best = 0
    let bd = Infinity
    POCKETS.forEach((q, k) => {
      const d = Math.hypot(p[i * 2] - q.x, p[i * 2 + 1] - q.y)
      if (d < bd) {
        bd = d
        best = k
      }
    })
    const at = { x: p[i * 2], y: p[i * 2 + 1] }
    p[i * 2] = OFF
    p[i * 2 + 1] = OFF
    v[i * 2] = 0
    v[i * 2 + 1] = 0
    potted.push(i)
    events.push({ t, k: 'pot', a: i, pocket: best, ...at })
  }

  while (t < MAX_T) {
    let moving = false
    for (let i = 0; i < BALLS; i++) {
      if (!onTable(p, i)) continue
      const vx = v[i * 2]
      const vy = v[i * 2 + 1]
      const sp = Math.hypot(vx, vy)
      if (sp < STOP) {
        v[i * 2] = 0
        v[i * 2 + 1] = 0
        continue
      }
      moving = true
      const slow = Math.min(sp, (ROLL + DRAG * sp) * DT)
      const k = (sp - slow) / sp
      v[i * 2] = vx * k
      v[i * 2 + 1] = vy * k
      let x = p[i * 2] + v[i * 2] * DT
      let y = p[i * 2 + 1] + v[i * 2 + 1] * DT
      // the cushions, except across a pocket's mouth
      const ix = v[i * 2]
      const iy = v[i * 2 + 1]
      if (!inMouth(x, y)) {
        let hit = 0
        if (x < R) (x = 2 * R - x), (v[i * 2] = -v[i * 2] * CUSHION_BOUNCE), (hit = Math.abs(v[i * 2]))
        else if (x > WIDTH - R) (x = 2 * (WIDTH - R) - x), (v[i * 2] = -v[i * 2] * CUSHION_BOUNCE), (hit = Math.abs(v[i * 2]))
        if (y < R) (y = 2 * R - y), (v[i * 2 + 1] = -v[i * 2 + 1] * CUSHION_BOUNCE), (hit = Math.abs(v[i * 2 + 1]))
        else if (y > LENGTH - R) (y = 2 * (LENGTH - R) - y), (v[i * 2 + 1] = -v[i * 2 + 1] * CUSHION_BOUNCE), (hit = Math.abs(v[i * 2 + 1]))
        if (hit) {
          events.push({ t, k: 'cushion', a: i, speed: hit })
          english(i, hit, ix, iy)
        }
      } else {
        // by a pocket: the jaws (and their rounded noses)
        for (const jw of JAWS) {
          const sx = jw.b.x - jw.a.x
          const sy = jw.b.y - jw.a.y
          const u = Math.max(0, Math.min(1, ((x - jw.a.x) * sx + (y - jw.a.y) * sy) / (sx * sx + sy * sy)))
          const cx = jw.a.x + sx * u
          const cy = jw.a.y + sy * u
          const d = Math.hypot(x - cx, y - cy)
          if (d >= R || d === 0) continue
          const nx = (x - cx) / d
          const ny = (y - cy) / d
          const vn = v[i * 2] * nx + v[i * 2 + 1] * ny
          x = cx + nx * R
          y = cy + ny * R
          if (vn >= 0) continue
          v[i * 2] -= (1 + CUSHION_BOUNCE) * vn * nx
          v[i * 2 + 1] -= (1 + CUSHION_BOUNCE) * vn * ny
          events.push({ t, k: 'cushion', a: i, speed: -vn })
          english(i, -vn, ix, iy)
        }
      }
      p[i * 2] = x
      p[i * 2 + 1] = y
      if (POCKETS.some((q) => Math.hypot(x - q.x, y - q.y) < q.r) || x < -R || x > WIDTH + R || y < -R || y > LENGTH + R) pot(i)
    }
    // balls meeting
    for (let i = 0; i < BALLS; i++) {
      if (!onTable(p, i)) continue
      for (let j = i + 1; j < BALLS; j++) {
        if (!onTable(p, j)) continue
        const dx = p[j * 2] - p[i * 2]
        const dy = p[j * 2 + 1] - p[i * 2 + 1]
        const d2 = dx * dx + dy * dy
        if (d2 >= 4 * R * R || d2 === 0) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        const vn = (v[i * 2] - v[j * 2]) * nx + (v[i * 2 + 1] - v[j * 2 + 1]) * ny
        // pull them apart so they only just touch
        const push = (2 * R - d) / 2
        p[i * 2] -= nx * push
        p[i * 2 + 1] -= ny * push
        p[j * 2] += nx * push
        p[j * 2 + 1] += ny * push
        if (vn <= 0) continue
        const cueBefore = i === 0 ? Math.hypot(v[0], v[1]) : 0
        const imp = ((1 + BALL_BOUNCE) / 2) * vn
        v[i * 2] -= imp * nx
        v[i * 2 + 1] -= imp * ny
        v[j * 2] += imp * nx
        v[j * 2 + 1] += imp * ny
        events.push({ t, k: 'ball', a: i, b: j, speed: vn })
        if (i === 0 && first === null) first = j
        // follow or draw: the spin on the cue ball takes over once it has hit something (a plain hit
        // rolls on a little, like a rolling ball does)
        if (i === 0 && !spun) {
          spun = true
          const kick = (0.15 + shot.spin * 0.55) * cueBefore
          v[0] += dir.x * kick
          v[1] += dir.y * kick
        }
        moving = true
      }
    }
    t += DT
    if (t >= nextFrame) {
      frames.push(Float32Array.from(p))
      nextFrame += FRAME_DT
    }
    if (!moving) break
  }
  frames.push(Float32Array.from(p))
  // the end position, rounded so it can be stored and sent as is
  const end = p.map((n) => (n === OFF ? OFF : Math.round(n * 1e5) / 1e5))
  return { frames, end, events, first, potted }
}

/* ── setting up ── */

/** solids 1–7, the 8, stripes 9–15 */
export const groupOf = (n: number): 'solid' | 'stripe' | 'eight' | 'cue' => (n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe')

/**
 * The rack: a triangle with its point on the foot spot, the 8 in the middle of the third row, a
 * solid and a stripe in the back corners and the rest shuffled. `rand` is 0…1.
 */
export function rack(rand: () => number = Math.random): Pos {
  const p: Pos = new Array(BALLS * 2).fill(OFF)
  p[0] = HEAD_SPOT.x
  p[1] = HEAD_SPOT.y
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  // a solid in one back corner, a stripe in the other
  const solid = rest.findIndex((n) => n < 8)
  const s = rest.splice(solid, 1)[0]
  const stripe = rest.findIndex((n) => n > 8)
  const st = rest.splice(stripe, 1)[0]
  const order: number[] = []
  // rows from the apex (row 0, nearest you) back to row 4; a whisker of room so nothing starts touching
  const gap = 2 * R + 0.0004
  const rowH = gap * Math.sqrt(3) / 2
  let k = 0
  for (let row = 0; row < 5; row++) {
    for (let c = 0; c <= row; c++) {
      let n: number
      if (row === 2 && c === 1) n = 8
      else if (row === 4 && c === 0) n = rand() < 0.5 ? s : st
      else if (row === 4 && c === 4) n = order.includes(s) ? st : s
      else n = rest[k++]
      order.push(n)
      p[n * 2] = FOOT_SPOT.x + (c - row / 2) * gap
      p[n * 2 + 1] = FOOT_SPOT.y - row * rowH
    }
  }
  return p
}

/** A free spot for a ball near (x, y): there, or the nearest place along the table that's clear. */
export function freeSpot(p: Pos, x: number, y: number, skip = -1): { x: number; y: number } {
  const clear = (cx: number, cy: number) => {
    for (let i = 0; i < BALLS; i++) if (i !== skip && onTable(p, i) && Math.hypot(p[i * 2] - cx, p[i * 2 + 1] - cy) < 2 * R + 0.001) return false
    return cx >= R && cx <= WIDTH - R && cy >= R && cy <= LENGTH - R
  }
  for (let d = 0; d < 1.5; d += R / 2) {
    if (clear(x, y + d)) return { x, y: y + d }
    if (clear(x, y - d)) return { x, y: y - d }
  }
  return { x, y }
}

/* ── the aiming line ── */

export interface Guide {
  /** where the cue ball goes first */
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** the ball it hits, where the cue ball is then (the ghost), and where each goes next */
  hit?: { ball: number; ghost: { x: number; y: number }; object: { x: number; y: number }; cue: { x: number; y: number } }
  /** or the cushion it bounces off, and on to where */
  bounce?: { x: number; y: number }
}

/** Where the cue ball would travel from `cue` along `angle` before it touches a ball or a cushion. */
function ray(p: Pos, cx: number, cy: number, dx: number, dy: number): { t: number; ball: number | null } {
  let best = Infinity
  let ball: number | null = null
  for (let i = 1; i < BALLS; i++) {
    if (!onTable(p, i)) continue
    const ox = p[i * 2] - cx
    const oy = p[i * 2 + 1] - cy
    const b = ox * dx + oy * dy
    if (b <= 0) continue
    const c = ox * ox + oy * oy - 4 * R * R
    const disc = b * b - c
    if (disc < 0) continue
    const t = b - Math.sqrt(disc)
    if (t > 0 && t < best) {
      best = t
      ball = i
    }
  }
  // the cushion lines the ball's centre can reach
  const wall = (pos: number, d: number, lo: number, hi: number) => (d > 0 ? (hi - pos) / d : d < 0 ? (lo - pos) / d : Infinity)
  const tw = Math.min(wall(cx, dx, R, WIDTH - R), wall(cy, dy, R, LENGTH - R))
  if (tw < best) return { t: Math.max(0, tw), ball: null }
  return { t: best, ball }
}

export function guide(p: Pos, angle: number): Guide {
  const cx = p[0]
  const cy = p[1]
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const r = ray(p, cx, cy, dx, dy)
  const to = { x: cx + dx * r.t, y: cy + dy * r.t }
  if (r.ball !== null) {
    const ox = p[r.ball * 2]
    const oy = p[r.ball * 2 + 1]
    const nx = (ox - to.x) / (2 * R)
    const ny = (oy - to.y) / (2 * R)
    const along = dx * nx + dy * ny
    // the object ball goes along the line of centres, the cue ball off at right angles to it
    const L = 0.12 + 0.28 * along
    let tx = dx - nx * along
    let ty = dy - ny * along
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const C = 0.08 + 0.2 * (1 - along)
    return { from: { x: cx, y: cy }, to, hit: { ball: r.ball, ghost: to, object: { x: ox + nx * L, y: oy + ny * L }, cue: { x: to.x + tx * C, y: to.y + ty * C } } }
  }
  // off the cushion: which wall, and on from there
  const ex = to.x <= R + 1e-6 || to.x >= WIDTH - R - 1e-6 ? -dx : dx
  const ey = to.y <= R + 1e-6 || to.y >= LENGTH - R - 1e-6 ? -dy : dy
  const r2 = ray(p, to.x, to.y, ex, ey)
  const len = Math.min(r2.t, 0.45)
  return { from: { x: cx, y: cy }, to, bounce: { x: to.x + ex * len, y: to.y + ey * len } }
}
