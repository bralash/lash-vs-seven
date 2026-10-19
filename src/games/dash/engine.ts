import type { Level } from '../../match/bot'

/*
 * Flag Dash, a race to a flag. Your runner runs by itself; a tap jumps, and a second tap in the air
 * jumps again. Saws and falls send you back to the last post you passed. Stars along the way count
 * only when you both reach the flag at the very same moment.
 *
 * Both players run the same scene from the same moment, each on their own phone. A run is nothing but
 * the scene and the times of its taps, so either phone can replay either run: online, each tap is sent
 * as its time, and the other phone works the run out from them. Fixed 1/240s steps, so a replay is the
 * run exactly.
 */

export type Seat = 0 | 1

/* ── scenes ── */

export interface Plat {
  x1: number
  x2: number
  /** the top (y grows downwards) */
  y: number
}
export interface Saw {
  x: number
  y: number
  r: number
  /** goes up and down this far */
  bob?: number
}
/** a big ring turning on the path, spikes across its rim: go through it between them */
export interface Ring {
  x: number
  y: number
  r: number
  spikes: number
  /** turns this fast (radians a second; less than 0 the other way) */
  spin: number
}
/** sits on a platform facing you and fires balls back down it at a steady beat; the cannon itself is deadly too */
export interface Cannon {
  x: number
  /** the top of the platform it stands on */
  y: number
  /** a ball every this many seconds, the first at `phase` */
  every: number
  phase: number
  /** the balls go this far, then they're gone */
  range: number
}
export interface Scene {
  name: string
  /** paper, lines, the accent (portals, posts, flag), the saws, and the faint grain */
  theme: { bg: string; ink: string; accent: string; saw: string; grain: string }
  plats: Plat[]
  saws: Saw[]
  rings?: Ring[]
  cannons?: Cannon[]
  portals: { a: { x: number; y: number }; b: { x: number; y: number } }[]
  /** the posts: where a restart puts you (the first is the start) */
  checks: number[]
  stars: { x: number; y: number }[]
  flag: number
}

const PAPER = { bg: '#f3ead8', ink: '#121016', accent: '#ffd23f', saw: '#e8291c', grain: 'rgba(18,16,22,.08)' }

export const SCENES: Scene[] = [
  {
    name: 'Paper',
    theme: PAPER,
    plats: [
      { x1: 0, x2: 520, y: 300 },
      { x1: 600, x2: 900, y: 300 },
      { x1: 960, x2: 1150, y: 240 },
      { x1: 1230, x2: 1500, y: 300 },
      { x1: 1580, x2: 1800, y: 240 },
      { x1: 2020, x2: 2300, y: 160 },
      { x1: 2380, x2: 2560, y: 260 },
      { x1: 2640, x2: 3100, y: 260 },
    ],
    saws: [
      { x: 1365, y: 284, r: 18 },
      { x: 2180, y: 144, r: 16 },
      { x: 2735, y: 244, r: 16 },
      { x: 2815, y: 244, r: 16, bob: 40 },
    ],
    portals: [{ a: { x: 1772, y: 220 }, b: { x: 2060, y: 130 } }],
    checks: [0, 960, 2020, 2640],
    rings: [{ x: 760, y: 290, r: 46, spikes: 4, spin: 1.6 }],
    cannons: [{ x: 2540, y: 260, every: 1.5, phase: 0.4, range: 420 }],
    stars: [
      { x: 760, y: 214 },
      { x: 1365, y: 200 },
      { x: 2470, y: 180 },
      { x: 2775, y: 170 },
    ],
    flag: 3000,
  },
  {
    name: 'Night',
    theme: { bg: '#1c1a24', ink: '#f3ead8', accent: '#ffd23f', saw: '#ff5a1f', grain: 'rgba(243,234,216,.07)' },
    plats: [
      { x1: 0, x2: 400, y: 300 },
      { x1: 560, x2: 760, y: 300 },
      { x1: 900, x2: 1000, y: 250 },
      { x1: 1140, x2: 1400, y: 250 },
      { x1: 1540, x2: 1640, y: 210 },
      { x1: 1780, x2: 1860, y: 160 },
      { x1: 2000, x2: 2300, y: 220 },
      { x1: 2460, x2: 2700, y: 300 },
      { x1: 2860, x2: 3000, y: 240 },
      { x1: 3100, x2: 3560, y: 240 },
    ],
    saws: [
      { x: 1270, y: 234, r: 16, bob: 70 },
      { x: 2100, y: 204, r: 16 },
      { x: 2180, y: 204, r: 16 },
      { x: 2580, y: 284, r: 18, bob: 50 },
      { x: 3250, y: 224, r: 18 },
    ],
    portals: [],
    checks: [0, 900, 2000, 3100],
    rings: [{ x: 660, y: 290, r: 44, spikes: 4, spin: -1.7 }],
    cannons: [{ x: 380, y: 300, every: 1.4, phase: 0.6, range: 300 }],
    stars: [
      { x: 480, y: 220 },
      { x: 1590, y: 140 },
      { x: 2140, y: 130 },
      { x: 2930, y: 170 },
    ],
    flag: 3460,
  },
  {
    name: 'Savanna',
    theme: { bg: '#f6d9b8', ink: '#3a1f12', accent: '#ffd23f', saw: '#c2361d', grain: 'rgba(58,31,18,.09)' },
    plats: [
      { x1: 0, x2: 450, y: 300 },
      { x1: 530, x2: 700, y: 250 },
      { x1: 780, x2: 950, y: 200 },
      { x1: 1030, x2: 1200, y: 150 },
      { x1: 1300, x2: 1700, y: 300 },
      { x1: 1800, x2: 2000, y: 240 },
      { x1: 2100, x2: 2250, y: 240 },
      { x1: 2350, x2: 2700, y: 300 },
      { x1: 2800, x2: 2950, y: 250 },
      { x1: 3050, x2: 3500, y: 250 },
    ],
    saws: [
      { x: 1450, y: 282, r: 18 },
      { x: 1600, y: 282, r: 18 },
      { x: 2205, y: 224, r: 16, bob: 60 },
      { x: 2520, y: 282, r: 18 },
      { x: 3200, y: 234, r: 16 },
    ],
    portals: [{ a: { x: 1672, y: 280 }, b: { x: 1850, y: 200 } }],
    checks: [0, 1300, 2100, 3050],
    rings: [{ x: 300, y: 290, r: 44, spikes: 3, spin: 1.8 }],
    cannons: [{ x: 3480, y: 250, every: 1.6, phase: 0.2, range: 320 }],
    stars: [
      { x: 1115, y: 80 },
      { x: 1525, y: 200 },
      { x: 2520, y: 210 },
      { x: 3000, y: 180 },
    ],
    flag: 3400,
  },
  {
    name: 'Lagoon',
    theme: { bg: '#cfe6f2', ink: '#10324a', accent: '#ffd23f', saw: '#e8291c', grain: 'rgba(16,50,74,.08)' },
    plats: [
      { x1: 0, x2: 400, y: 280 },
      { x1: 520, x2: 620, y: 280 },
      { x1: 740, x2: 840, y: 250 },
      { x1: 960, x2: 1060, y: 280 },
      { x1: 1180, x2: 1280, y: 230 },
      { x1: 1400, x2: 1700, y: 280 },
      { x1: 1820, x2: 1920, y: 240 },
      { x1: 2040, x2: 2140, y: 200 },
      { x1: 2260, x2: 2600, y: 260 },
      { x1: 2720, x2: 2820, y: 260 },
      { x1: 2940, x2: 3400, y: 260 },
    ],
    saws: [
      { x: 1550, y: 262, r: 18, bob: 60 },
      { x: 3100, y: 244, r: 16, bob: 50 },
    ],
    portals: [],
    checks: [0, 960, 2260, 2940],
    rings: [{ x: 2440, y: 250, r: 52, spikes: 4, spin: 1.5 }],
    cannons: [{ x: 3390, y: 260, every: 1.5, phase: 0.5, range: 300 }],
    stars: [
      { x: 680, y: 200 },
      { x: 1340, y: 160 },
      { x: 2200, y: 130 },
      { x: 2880, y: 190 },
    ],
    flag: 3300,
  },
  {
    name: 'Kente',
    theme: { bg: '#f4e2a1', ink: '#1b1410', accent: '#1f9d55', saw: '#c8102e', grain: 'rgba(27,20,16,.09)' },
    plats: [
      { x1: 0, x2: 380, y: 300 },
      { x1: 520, x2: 640, y: 240 },
      { x1: 780, x2: 860, y: 180 },
      { x1: 1000, x2: 1300, y: 260 },
      { x1: 1440, x2: 1520, y: 200 },
      { x1: 1660, x2: 1740, y: 150 },
      { x1: 1880, x2: 2200, y: 240 },
      { x1: 2380, x2: 2600, y: 150 },
      { x1: 2740, x2: 2900, y: 250 },
      { x1: 3040, x2: 3120, y: 190 },
      { x1: 3260, x2: 3740, y: 260 },
    ],
    saws: [
      { x: 1100, y: 244, r: 16 },
      { x: 1190, y: 244, r: 16, bob: 50 },
      { x: 2500, y: 134, r: 16 },
      { x: 3380, y: 244, r: 16 },
      { x: 3500, y: 244, r: 16, bob: 45 },
    ],
    portals: [{ a: { x: 2150, y: 220 }, b: { x: 2420, y: 120 } }],
    checks: [0, 1000, 1880, 2740, 3260],
    rings: [{ x: 2010, y: 230, r: 48, spikes: 4, spin: 2 }],
    cannons: [{ x: 3730, y: 260, every: 1.3, phase: 0.3, range: 400 }],
    stars: [
      { x: 820, y: 110 },
      { x: 1700, y: 80 },
      { x: 2500, y: 70 },
      { x: 3080, y: 120 },
    ],
    flag: 3660,
  },
]

/* ── the runner ── */

/** the runner's radius, its speed, its jump (and the second one in the air), gravity */
export const PR = 10
export const RUN = 260
const JUMP = 520
const JUMP2 = 0.85
const G = 1500
/** after a saw or a fall, this long before you're back at the post (ms) */
export const RESPAWN_MS = 650
const PORTAL_R = 20
const STAR_R = 14
/** fixed steps */
const STEP = 1 / 240
/** the race is called this long after the start (ms), whoever's furthest */
export const MAX_MS = 45000
/** the lowest platform, plus a bit: below this you've fallen */
const deadY = (s: Scene) => Math.max(...s.plats.map((p) => p.y)) + 50

export const sawAt = (s: Saw, t: number) => ({ x: s.x, y: s.y - (s.bob ? (Math.sin(t * 3) * 0.5 + 0.5) * s.bob : 0), r: s.r })

/** a ring's spikes: each reaches this far either side of the rim */
export const SPIKE = 12
/** a ring's spikes at time t, as the angle of each */
export const spikesAt = (g: Ring, t: number) => Array.from({ length: g.spikes }, (_, k) => t * g.spin + (k * Math.PI * 2) / g.spikes)
/** a cannon's size (half the width of its body) and its balls' */
export const CANNON = 11
export const BALL_R = 5
const BALL_SPEED = 230
/** where a cannon's balls are at time t */
export function ballsAt(c: Cannon, t: number) {
  const out: { x: number; y: number }[] = []
  for (let k = Math.max(0, Math.floor((t - c.phase - c.range / BALL_SPEED) / c.every)); ; k++) {
    const age = t - (c.phase + k * c.every)
    if (age < 0) break
    if (age * BALL_SPEED <= c.range) out.push({ x: c.x - CANNON - age * BALL_SPEED, y: c.y - PR })
  }
  return out
}

/** a point's distance from a line segment */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - u * dx, py - ay - u * dy)
}

/** does a runner at (x, y) touch anything deadly at time t */
function hurt(s: Scene, x: number, y: number, t: number) {
  for (const sw of s.saws) {
    const q = sawAt(sw, t)
    if (Math.hypot(x - q.x, y - q.y) < q.r + PR - 3) return true
  }
  for (const g of s.rings ?? []) {
    if (Math.abs(Math.hypot(x - g.x, y - g.y) - g.r) > SPIKE + PR) continue
    for (const a of spikesAt(g, t)) {
      const c = Math.cos(a)
      const n = Math.sin(a)
      if (segDist(x, y, g.x + c * (g.r - SPIKE), g.y + n * (g.r - SPIKE), g.x + c * (g.r + SPIKE), g.y + n * (g.r + SPIKE)) < PR + 1) return true
    }
  }
  for (const c of s.cannons ?? []) {
    if (Math.abs(x - c.x) < CANNON + PR - 3 && y > c.y - CANNON * 2 - PR + 3) return true
    for (const b of ballsAt(c, t)) if (Math.hypot(x - b.x, y - b.y) < BALL_R + PR - 2) return true
  }
  return false
}

export interface Run {
  x: number
  y: number
  vy: number
  ground: boolean
  jumps: number
  /** the last post passed */
  check: number
  /** ms until back at the post, while down */
  down: number
  /** where it went down (for the puff) */
  downAt: { x: number; y: number } | null
  /** reached the flag, ms into the run */
  finish: number | null
  restarts: number
  /** stars taken (bits) */
  stars: number
  /** a few recent spots in the air, oldest first (the dotted trail) */
  trail: { x: number; y: number }[]
}

export const fresh = (s: Scene): Run => ({ x: s.checks[0] + 40, y: s.plats[0].y - PR, vy: 0, ground: true, jumps: 0, check: 0, down: 0, downAt: null, finish: null, restarts: 0, stars: 0, trail: [] })
export const starCount = (r: Run) => {
  let n = 0
  for (let b = r.stars; b; b >>= 1) n += b & 1
  return n
}

/** a jump, if there's one left (the second in the air is a little lower) */
export function jump(r: Run) {
  if (r.down || r.finish !== null) return false
  if (r.ground) (r.vy = -JUMP), (r.ground = false), (r.jumps = 1)
  else if (r.jumps < 2) (r.vy = -JUMP * JUMP2), (r.jumps = 2)
  else return false
  return true
}

/** One step of `dt` seconds, at time t (seconds into the run). */
export function step(s: Scene, r: Run, dt: number, t: number): 'down' | 'flag' | null {
  if (r.finish !== null) return null
  if (r.down > 0) {
    r.down -= dt * 1000
    if (r.down <= 0) {
      const c = s.checks[r.check]
      const p = s.plats.find((q) => q.x1 <= c + 40 && q.x2 >= c + 40)!
      Object.assign(r, { x: c + 40, y: p.y - PR, vy: 0, ground: true, jumps: 0, down: 0, downAt: null, trail: [] })
    }
    return null
  }
  const prevY = r.y
  r.x += RUN * dt
  r.vy += G * dt
  r.y += r.vy * dt
  r.ground = false
  for (const p of s.plats)
    if (r.x >= p.x1 - PR * 0.5 && r.x <= p.x2 + PR * 0.5 && prevY + PR <= p.y + 0.5 && r.y + PR >= p.y && r.vy >= 0) {
      r.y = p.y - PR
      r.vy = 0
      r.ground = true
      r.jumps = 0
    }
  for (const q of s.portals)
    if (Math.hypot(r.x - q.a.x, r.y - q.a.y) < PORTAL_R + PR - 4) {
      r.x = q.b.x
      r.y = q.b.y
      r.vy = Math.min(r.vy, 0)
      r.trail = []
    }
  for (let k = s.checks.length - 1; k > r.check; k--) if (r.x >= s.checks[k] + 40) r.check = k
  s.stars.forEach((st, i) => {
    if (!(r.stars & (1 << i)) && Math.hypot(r.x - st.x, r.y - st.y) < STAR_R + PR) r.stars |= 1 << i
  })
  if (hurt(s, r.x, r.y, t) || r.y > deadY(s)) {
    r.down = RESPAWN_MS
    r.downAt = { x: r.x, y: Math.min(r.y, deadY(s) - 30) }
    r.restarts++
    return 'down'
  }
  if (!r.ground) {
    r.trail.push({ x: r.x, y: r.y })
    if (r.trail.length > 14) r.trail.shift()
  } else r.trail = []
  if (r.x >= s.flag) {
    r.finish = Math.round(t * 1000)
    return 'flag'
  }
  return null
}

/**
 * A run up to `until` ms: the scene and the tap times are all it takes. A tap counts at the first step
 * at or after it. `events` gets each restart, star and the flag as they happen (for sounds).
 */
export function simulate(scene: number, taps: number[], until: number): Run {
  const s = SCENES[scene]
  const r = fresh(s)
  const end = Math.min(until, MAX_MS)
  let k = 0
  for (let i = 1; i * STEP * 1000 <= end; i++) {
    const t = i * STEP
    while (k < taps.length && taps[k] <= t * 1000) jump(r), k++
    if (step(s, r, STEP, t) === 'flag') break
  }
  return r
}

/** how far along a run is, 0…1 (for the bar) */
export const progress = (scene: number, r: Run) => (r.finish !== null ? 1 : Math.max(0, Math.min(1, (r.down ? (r.downAt?.x ?? r.x) : r.x) / SCENES[scene].flag)))

/**
 * Who's won the race, once it's sure (null while it isn't): the first to the flag; both there at the
 * same moment, the one with more stars; still level, a dead heat (-1). Each run is as far as this
 * phone can trust it (`t0`, `t1`: ms of it known).
 */
export function decide(a: Run, b: Run, t0: number, t1: number): Seat | -1 | null {
  if (a.finish !== null && b.finish !== null) {
    if (a.finish !== b.finish) return a.finish < b.finish ? 0 : 1
    const sa = starCount(a)
    const sb = starCount(b)
    return sa === sb ? -1 : sa > sb ? 0 : 1
  }
  // one's there, and the other's known past that moment without being there
  if (a.finish !== null && t1 > a.finish) return 0
  if (b.finish !== null && t0 > b.finish) return 1
  // out of time: whoever's furthest
  if (t0 >= MAX_MS && t1 >= MAX_MS) {
    const pa = a.x
    const pb = b.x
    return pa === pb ? -1 : pa > pb ? 0 : 1
  }
  return null
}

/* ── the match ── */

export interface DashLive {
  /** the race in play, from 1 */
  g: number
  /** which scene the first race was (the rest follow in order) */
  first: number
  /** server time the race starts (0 = not yet set) */
  start: number
  wins: [number, number]
  /** taps per race and seat: runs/g3/s1/k12 = ms into the run (written by each phone as it taps) */
  runs?: Record<string, Partial<Record<'s0' | 's1', Record<string, number>>>>
  /** the race just run */
  /** (times: ms to the flag, -1 for none: the database drops nulls) */
  last?: { g: number; scene: number; times: [number, number]; stars: [number, number]; winner: Seat | -1 } | null
  /** across the match, per seat: a race with no restarts, a race with every star (for feats) */
  clean?: [boolean, boolean]
  allStars?: [boolean, boolean]
  result?: { winner: Seat } | null
}

export const sceneOf = (l: DashLive, g = l.g) => (l.first + g - 1) % SCENES.length

/** between a race's end and the next start */
export const BREAK_MS = 3400
/** before the very first race */
export const FIRST_MS = 3000

export function freshLive(): DashLive {
  return { g: 1, first: Math.floor(Math.random() * SCENES.length), start: 0, wins: [0, 0], runs: {}, last: null, clean: [false, false], allStars: [false, false], result: null }
}

/** a seat's taps for a race, from the state */
export function tapsOf(l: DashLive, g: number, seat: Seat): number[] {
  const m = l.runs?.[`g${g}`]?.[seat ? 's1' : 's0']
  return m ? Object.values(m).sort((x, y) => x - y) : []
}

/** a race settled: the score, the next race (or the match) */
export function settle(l: DashLive, g: number, winner: Seat | -1, runs: [Run, Run], need: number, now: number): DashLive | undefined {
  if (l.result || l.g !== g) return undefined
  const wins: [number, number] = [...l.wins]
  if (winner !== -1) wins[winner]++
  const scene = sceneOf(l, g)
  const all = SCENES[scene].stars.length
  const clean = (l.clean ?? [false, false]).map((v, i) => v || (runs[i].finish !== null && runs[i].restarts === 0)) as [boolean, boolean]
  const allStars = (l.allStars ?? [false, false]).map((v, i) => v || (runs[i].finish !== null && starCount(runs[i]) === all)) as [boolean, boolean]
  const done = winner !== -1 && wins[winner] >= need
  return {
    g: g + 1,
    first: l.first,
    start: done ? 0 : now + BREAK_MS,
    wins,
    runs: {},
    last: { g, scene, times: [runs[0].finish ?? -1, runs[1].finish ?? -1], stars: [starCount(runs[0]), starCount(runs[1])], winner },
    clean,
    allStars,
    result: done ? { winner: winner as Seat } : null,
  }
}

/* ── Ops ── */

/**
 * A route from where a runner is: the spots to jump at, found by trying the options every 0.025s (run
 * on first, then jump) and backing up from any that end in a saw or a fall. Null if there's none.
 */
export function route(scene: number, r0: Run, t0: number): number[] | null {
  const s = SCENES[scene]
  const TICK = 6
  const jumps: number[] = []
  let budget = 30000
  const go = (r: Run, t: number): boolean => {
    if (--budget < 0) return false
    for (const leap of [false, true]) {
      const c: Run = { ...r, trail: [] }
      if (leap && !jump(c)) continue
      let tt = t
      let res: ReturnType<typeof step> = null
      for (let k = 0; k < TICK && !res; k++) res = step(s, c, STEP, (tt += STEP))
      if (res === 'down') continue
      if (leap) jumps.push(r.x)
      if (res === 'flag' || go(c, tt)) return true
      if (leap) jumps.pop()
    }
    return false
  }
  return go({ ...r0, trail: [] }, t0) ? jumps : null
}

/** per jump: the chance she mistimes it (a real mistake, up to MISTIME either way) */
const MISS: Record<Level, number> = { easy: 0.2, medium: 0.09, hard: 0.035 }
const MISTIME = 30
/** how early (at most) she goes for a jump, inside the window that works */
const EARLY = 26

/**
 * Ops' taps for a whole race, worked out when it starts. She plans a route (each jump at the last spot
 * that works), then goes a little early for each one if that still works, as a person would; now and
 * then she mistimes one outright. After every jump, and every restart, she looks again.
 */
export function opsTaps(scene: number, level: Level, rand: () => number = Math.random): number[] {
  const s = SCENES[scene]
  const r = fresh(s)
  const taps: number[] = []
  let plan: number[] | null = null
  /** the next jump: where she means to go, whether she'll check it, and the last spot that works */
  let next: { at: number; latest: number; slip: boolean } | null = null
  for (let i = 1; i * STEP * 1000 <= MAX_MS; i++) {
    const t = i * STEP
    if (!r.down) {
      plan ??= route(scene, r, t) ?? []
      if (!next && plan.length) {
        const slip = rand() < MISS[level]
        next = { at: slip ? plan[0] + (rand() * 2 - 1) * MISTIME : plan[0] - rand() * EARLY, latest: plan[0], slip }
      }
      if (next && r.x >= next.at) {
        let go = next.slip || r.x >= next.latest
        if (!go) {
          const c: Run = { ...r, trail: [] }
          go = jump(c) && route(scene, c, t) !== null
          if (!go) next.at = next.latest
        }
        // a tap at this step: written as the ms it falls in, so a replay takes it at this same step
        if (go && jump(r)) {
          taps.push(Math.floor(t * 1000))
          next = null
          plan = null
        }
      }
    }
    const res = step(s, r, STEP, t)
    if (res === 'flag') break
    if (res === 'down') (plan = null), (next = null)
  }
  return taps
}
