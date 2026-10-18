/*
 * Flick football from above. The pitch is 1 wide and LENGTH long; seat 0 starts at the bottom and
 * attacks the top goal (y < 0), seat 1 the other way. Ten discs (0–4 seat 0, 5–9 seat 1) and the ball
 * (10). A flick sends one disc off at a speed; everything slides, knocks into everything else and off
 * the walls, and slows to a stop. Discs can't go past the goal line; the ball can, between the posts.
 *
 * Fixed 1/240 s steps, so the same flick from the same spot plays out the same on every phone (and
 * the shooter's end position is kept anyway, so any drift between phones doesn't last).
 */

export const WIDTH = 1
export const LENGTH = 1.55
/** disc radius */
export const R = 0.062
/** ball radius */
export const BR = 0.034
/** goal mouth width, and how far the net goes back */
export const MOUTH = 0.3
export const DEPTH = 0.08
export const POST_R = 0.01
const POSTS = [0.5 - MOUTH / 2, 0.5 + MOUTH / 2]

export const DISCS = 10
export const BALL = 10
export const BODIES = 11
export const MAX_SPEED = 3.2
/** constant slowing (units/s²): discs drag on the grass, the ball rolls on */
const DRAG_DISC = 1.35
const DRAG_BALL = 1.05
const WALL_BOUNCE = 0.75
const KNOCK = 0.9
const MASS_BALL = 0.5

const STEP = 1 / 240
/** frames are kept at 60 a second for the screen */
export const FRAME_DT = 1 / 60
const STEPS_PER_FRAME = 4
const MAX_TIME = 10
/** after a goal, how long the play runs on before it stops */
const AFTER_GOAL = 0.6

/** x, y of every body in turn */
export type Pos = number[]

export interface Flick {
  /** which disc (0–9) */
  disc: number
  angle: number
  /** 0–1 */
  power: number
}

export type Ev =
  | { t: number; k: 'hit'; speed: number; ball: boolean }
  | { t: number; k: 'wall'; speed: number }
  | { t: number; k: 'post'; speed: number }
  | { t: number; k: 'goal'; end: 'top' | 'bottom' }

export interface Outcome {
  frames: Pos[]
  end: Pos
  events: Ev[]
  /** the end the ball went in, if it did */
  goal: 'top' | 'bottom' | null
}

export const teamOf = (i: number) => (i < 5 ? 0 : 1) as 0 | 1
export const speedOf = (power: number) => MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.2)

/** Where each side lines up for a kick-off: the ball on the spot, seat 0 at the bottom. */
export function kickoff(): Pos {
  const spots = [
    [0.5, 0.935],
    [0.24, 0.8],
    [0.76, 0.8],
    [0.36, 0.63],
    [0.64, 0.63],
  ]
  const p: Pos = []
  for (const t of [0, 1])
    for (const [x, y] of spots) p.push(t === 0 ? x : 1 - x, t === 0 ? y * LENGTH : (1 - y) * LENGTH)
  p.push(0.5, LENGTH / 2)
  return p
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

/** Play a flick out from `start`. */
export function simulate(start: Pos, flick: Flick): Outcome {
  const p = start.slice()
  const v = new Array(BODIES * 2).fill(0)
  const sp = speedOf(flick.power)
  v[flick.disc * 2] = Math.cos(flick.angle) * sp
  v[flick.disc * 2 + 1] = Math.sin(flick.angle) * sp
  const frames: Pos[] = [p.slice()]
  const events: Ev[] = []
  let goal: Outcome['goal'] = null
  let goalAt = 0
  let t = 0
  let n = 0
  const radius = (i: number) => (i === BALL ? BR : R)
  const mass = (i: number) => (i === BALL ? MASS_BALL : 1)

  while (t < MAX_TIME) {
    t += STEP
    n++
    let moving = false
    for (let i = 0; i < BODIES; i++) {
      let vx = v[i * 2]
      let vy = v[i * 2 + 1]
      const s = Math.hypot(vx, vy)
      if (s === 0) continue
      const ns = Math.max(0, s - (i === BALL ? DRAG_BALL : DRAG_DISC) * STEP)
      vx *= ns / s
      vy *= ns / s
      if (ns > 0) moving = true
      let x = p[i * 2] + vx * STEP
      let y = p[i * 2 + 1] + vy * STEP
      const r = radius(i)
      // the touchlines
      if (x < r) (events.push({ t, k: 'wall', speed: Math.abs(vx) }), (x = r), (vx = Math.abs(vx) * WALL_BOUNCE))
      if (x > WIDTH - r) (events.push({ t, k: 'wall', speed: Math.abs(vx) }), (x = WIDTH - r), (vx = -Math.abs(vx) * WALL_BOUNCE))
      // the goal lines: open between the posts, for the ball only
      const mouth = i === BALL && x > POSTS[0] && x < POSTS[1]
      if (!mouth) {
        if (y < r && (i !== BALL || p[i * 2 + 1] >= 0)) (events.push({ t, k: 'wall', speed: Math.abs(vy) }), (y = r), (vy = Math.abs(vy) * WALL_BOUNCE))
        if (y > LENGTH - r && (i !== BALL || p[i * 2 + 1] <= LENGTH)) (events.push({ t, k: 'wall', speed: Math.abs(vy) }), (y = LENGTH - r), (vy = -Math.abs(vy) * WALL_BOUNCE))
      }
      if (i === BALL && (y < 0 || y > LENGTH)) {
        // in the net: its sides and back
        const lo = POSTS[0] + r
        const hi = POSTS[1] - r
        if (x < lo) (x = lo), (vx = Math.abs(vx) * 0.3)
        if (x > hi) (x = hi), (vx = -Math.abs(vx) * 0.3)
        if (y < -DEPTH + r) (y = -DEPTH + r), (vy = Math.abs(vy) * 0.2)
        if (y > LENGTH + DEPTH - r) (y = LENGTH + DEPTH - r), (vy = -Math.abs(vy) * 0.2)
        if (!goal && (y < -r || y > LENGTH + r)) {
          goal = y < 0 ? 'top' : 'bottom'
          goalAt = t
          events.push({ t, k: 'goal', end: goal })
        }
      }
      // the posts
      for (const px of POSTS)
        for (const py of [0, LENGTH]) {
          const dx = x - px
          const dy = y - py
          const d = Math.hypot(dx, dy)
          const min = r + POST_R
          if (d >= min || d === 0) continue
          const nx = dx / d
          const ny = dy / d
          x = px + nx * min
          y = py + ny * min
          const into = vx * nx + vy * ny
          if (into < 0) {
            events.push({ t, k: 'post', speed: -into })
            vx -= (1 + WALL_BOUNCE) * into * nx
            vy -= (1 + WALL_BOUNCE) * into * ny
          }
        }
      p[i * 2] = x
      p[i * 2 + 1] = y
      v[i * 2] = vx
      v[i * 2 + 1] = vy
    }
    // knocks
    for (let i = 0; i < BODIES; i++)
      for (let j = i + 1; j < BODIES; j++) {
        const dx = p[j * 2] - p[i * 2]
        const dy = p[j * 2 + 1] - p[i * 2 + 1]
        const min = radius(i) + radius(j)
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue
        const d = Math.hypot(dx, dy)
        if (d >= min || d === 0) continue
        const nx = dx / d
        const ny = dy / d
        const mi = mass(i)
        const mj = mass(j)
        const push = (min - d) / (mi + mj)
        p[i * 2] -= nx * push * mj
        p[i * 2 + 1] -= ny * push * mj
        p[j * 2] += nx * push * mi
        p[j * 2 + 1] += ny * push * mi
        const rel = (v[i * 2] - v[j * 2]) * nx + (v[i * 2 + 1] - v[j * 2 + 1]) * ny
        if (rel <= 0) continue
        const imp = ((1 + KNOCK) * rel) / (mi + mj)
        v[i * 2] -= imp * mj * nx
        v[i * 2 + 1] -= imp * mj * ny
        v[j * 2] += imp * mi * nx
        v[j * 2 + 1] += imp * mi * ny
        events.push({ t, k: 'hit', speed: rel, ball: i === BALL || j === BALL })
        moving = true
      }
    if (n % STEPS_PER_FRAME === 0) frames.push(p.slice())
    if (!moving || (goal && t - goalAt > AFTER_GOAL)) break
  }
  frames.push(p.slice())
  return { frames, end: p.map(round), events, goal }
}
