import type { Level } from '../../match/bot'

/*
 * Ring Dash, a race on one ring. A dot runs round a ring, outside it to begin with; every tap dashes
 * it across to the other side. Walls stick out of the ring, inside or out: be on the other side as
 * you pass one, or your run's over. White squares sit on one side or the other: pass them on their
 * side to take them (a point each). Eight in a row without missing one is a bonus. It speeds up
 * every lap.
 *
 * Both players run the same course (one seed) from the same moment, each on their own phone. A run
 * is nothing but its seed and the times of its taps, so either phone can replay either run: online,
 * each tap is sent as its time, and the other phone works out the run from them.
 */

export type Seat = 0 | 1
/** which side of the ring the dot (or an item) is on */
export type Side = 'out' | 'in'

/* ── the course ── */

/** a lap's length at the start, how much quicker each lap is, and the quickest it gets (ms) */
const LAP_MS = 3400
const QUICKER = 0.955
const MIN_LAP = 1500
export const lapMs = (lap: number) => Math.max(MIN_LAP, LAP_MS * QUICKER ** lap)

/** the dash across takes this long; the dot counts as on the other side from halfway */
export const DASH_MS = 110
/** how near a wall (as a share of the lap) the dot touches it: the dot's own width */
const WALL_REACH = 0.011
/** how near a square the dot picks it up */
const SQUARE_REACH = 0.03
/** eight squares in a row without missing one: this many more points */
export const CHAIN = 8
export const CHAIN_BONUS = 5

export interface Item {
  id: string
  /** where on the lap, from 0 (the top) going clockwise to 1 */
  a: number
  side: Side
  kind: 'wall' | 'square'
}

/** a small seeded random (mulberry32) */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const laps = new Map<string, Item[]>()

/**
 * One lap's walls and squares, in order round the ring. The first lap starts gently; walls come
 * closer together as it goes (never closer than a quick dash and back). Squares sit between walls.
 */
export function lapItems(seed: number, lap: number): Item[] {
  const k = `${seed}:${lap}`
  const hit = laps.get(k)
  if (hit) return hit
  const r = rng(seed * 7919 + lap * 104729 + 1)
  const ms = lapMs(lap)
  // the time between walls, from relaxed to tight
  const gapMs = Math.max(400, 1100 - lap * 45)
  const gap = gapMs / ms
  const items: Item[] = []
  const walls: number[] = []
  let a = lap === 0 ? 0.42 : 0.06 + r() * 0.06
  while (a < 0.95) {
    walls.push(a)
    a += gap * (1 + r() * 0.9)
  }
  let prev = lap === 0 ? 0.12 : 0
  walls.forEach((w, j) => {
    // a square between the last wall and this one, when there's room for it
    if (w - prev > gap * 0.9 && r() < 0.7) items.push({ id: `${lap}:s${j}`, a: (prev + w) / 2, side: r() < 0.5 ? 'out' : 'in', kind: 'square' })
    items.push({ id: `${lap}:w${j}`, a: w, side: r() < 0.5 ? 'out' : 'in', kind: 'wall' })
    prev = w
  })
  if (laps.size > 4000) laps.clear()
  laps.set(k, items)
  return items
}

/** when each lap starts (ms into the run), filled in as needed */
const starts: number[] = [0]
export function lapStart(lap: number): number {
  while (starts.length <= lap) starts.push(starts[starts.length - 1] + lapMs(starts.length - 1))
  return starts[lap]
}
/** where the dot is at a moment of the run: which lap, and how far round it */
export function where(t: number): { lap: number; f: number } {
  let lap = 0
  while (lapStart(lap + 1) <= t) lap++
  return { lap, f: Math.max(0, (t - lapStart(lap)) / lapMs(lap)) }
}

/* ── a run ── */

/** which side the dot is on at a moment, from the taps (sorted, ms into the run) */
export function sideAt(taps: number[], t: number): Side {
  let n = 0
  for (const x of taps) {
    if (x + DASH_MS / 2 > t) break
    n++
  }
  return n % 2 ? 'in' : 'out'
}

export interface Run {
  score: number
  /** squares in a row right now, and the longest */
  chain: number
  best: number
  /** bonuses scored */
  bonuses: number
  /** ms into the run it hit a wall, if it did */
  crash: number | null
  /** the wall it hit */
  hit: string | null
  /** squares taken */
  taken: Set<string>
  /** the last pick-up, for a sound and a pop: when and what */
  last: { at: number; id: string; bonus: boolean } | null
}

/** A run replayed from its taps, up to `until` ms into it (or the wall it hits). */
export function simulate(seed: number, taps: number[], until: number): Run {
  const run: Run = { score: 0, chain: 0, best: 0, bonuses: 0, crash: null, hit: null, taken: new Set(), last: null }
  for (let lap = 0; ; lap++) {
    const t0 = lapStart(lap)
    if (t0 > until) return run
    const ms = lapMs(lap)
    for (const it of lapItems(seed, lap)) {
      const at = t0 + it.a * ms
      if (it.kind === 'wall') {
        // touching it anywhere across its width: on its side at either edge, or a dash in between
        const from = at - WALL_REACH * ms
        const to = at + WALL_REACH * ms
        if (from > until) return run
        const crossed = taps.some((x) => x + DASH_MS / 2 > from && x + DASH_MS / 2 <= to)
        if (crossed || sideAt(taps, from) === it.side || sideAt(taps, Math.min(to, until)) === it.side) {
          run.crash = Math.max(0, from)
          run.hit = it.id
          return run
        }
      } else {
        if (at > until) return run
        if (sideAt(taps, at) === it.side || (sideAt(taps, at - SQUARE_REACH * ms) === it.side && sideAt(taps, at + SQUARE_REACH * ms) === it.side)) {
          run.taken.add(it.id)
          run.score++
          run.chain++
          const bonus = run.chain % CHAIN === 0
          if (bonus) {
            run.score += CHAIN_BONUS
            run.bonuses++
          }
          run.best = Math.max(run.best, run.chain)
          run.last = { at, id: it.id, bonus }
        } else run.chain = 0
      }
    }
  }
}

/**
 * Who takes the game, if anyone yet. A run that has hit a wall is done; the other wins as soon as
 * it's ahead of it, or loses once it hits a wall too with less. Level at the end is a draw (-1):
 * the game's played again.
 */
export function decide(a: Run, b: Run): Seat | -1 | null {
  if (a.crash !== null && b.crash !== null) return a.score === b.score ? -1 : a.score > b.score ? 0 : 1
  if (a.crash !== null && b.score > a.score) return 1
  if (b.crash !== null && a.score > b.score) return 0
  return null
}

/* ── the match ── */

export interface RingLive {
  /** the game in play, from 1 */
  g: number
  seed: number
  /** server time the run starts (0 = not yet set) */
  start: number
  wins: [number, number]
  /** taps per game and seat: runs/g3/s1/k12 = ms into the run (written by each phone as it taps) */
  runs?: Record<string, Partial<Record<'s0' | 's1', Record<string, number>>>>
  /** the game just played */
  last?: { g: number; scores: [number, number]; winner: Seat | -1 } | null
  /** across the match: best score, longest run of squares, per seat (for feats and the card) */
  top?: [number, number]
  chain?: [number, number]
  result?: { winner: Seat } | null
}

/** between a game's end and the next start */
export const BREAK_MS = 3200
/** before the very first run */
export const FIRST_MS = 3000

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function freshLive(): RingLive {
  return { g: 1, seed: newSeed(), start: 0, wins: [0, 0], runs: {}, last: null, top: [0, 0], chain: [0, 0], result: null }
}

/** a seat's taps for a game, from the state */
export function tapsOf(l: RingLive, g: number, seat: Seat): number[] {
  const m = l.runs?.[`g${g}`]?.[seat ? 's1' : 's0']
  return m ? Object.values(m).sort((x, y) => x - y) : []
}

/** a game settled: the score, the next game (or the match) */
export function settle(l: RingLive, g: number, winner: Seat | -1, runs: [Run, Run], need: number, now: number): RingLive | undefined {
  if (l.result || l.g !== g) return undefined
  const wins: [number, number] = [...l.wins]
  if (winner !== -1) wins[winner]++
  const top = (l.top ?? [0, 0]).map((v, i) => Math.max(v, runs[i].score)) as [number, number]
  const chain = (l.chain ?? [0, 0]).map((v, i) => Math.max(v, runs[i].best)) as [number, number]
  const done = winner !== -1 && wins[winner] >= need
  return {
    g: g + 1,
    seed: newSeed(),
    start: done ? 0 : now + BREAK_MS,
    wins,
    runs: {},
    last: { g, scores: [runs[0].score, runs[1].score], winner },
    top,
    chain,
    result: done ? { winner: winner as Seat } : null,
  }
}

/* ── Ops ── */

/**
 * Ops' taps for a whole run, worked out at the start. She dashes to the safe side before each wall,
 * across for a square when she fancies it and there's time, and now and then she's late for a wall
 * (more often on easy, and more as it speeds up): that's her run over.
 */
export function opsTaps(seed: number, level: Level, rand: () => number = Math.random): number[] {
  const slip = level === 'hard' ? 0.01 : level === 'medium' ? 0.022 : 0.045
  const greed = level === 'hard' ? 0.95 : level === 'medium' ? 0.75 : 0.45
  const taps: number[] = []
  let side: Side = 'out'
  let prevAt = 0
  for (let lap = 0; lap < 120; lap++) {
    const t0 = lapStart(lap)
    const ms = lapMs(lap)
    const items = lapItems(seed, lap)
    for (let j = 0; j < items.length; j++) {
      const it = items[j]
      const at = t0 + it.a * ms
      let want: Side | null = null
      if (it.kind === 'wall') {
        want = it.side === 'out' ? 'in' : 'out'
        // late for it: she stays put and hits it (quicker laps catch her out more)
        if (want !== side && rand() < slip * (LAP_MS / ms)) return taps
      } else if (it.side !== side && rand() < greed) {
        // only if she'll get back in time for the next wall
        const next = items[j + 1]
        const nextAt = next ? t0 + next.a * ms : at + 1000
        const back = next && next.kind === 'wall' && next.side === it.side
        if (!back || nextAt - at > 260) want = it.side
      }
      if (want && want !== side) {
        // her tap lands between the last thing she passed and this one, a touch early
        const room = at - prevAt
        const lead = Math.min(room * 0.55, 90 + rand() * 160)
        taps.push(Math.round(at - lead - DASH_MS / 2))
        side = want
      }
      prevAt = at
    }
  }
  return taps
}
