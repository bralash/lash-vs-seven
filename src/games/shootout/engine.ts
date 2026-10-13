import type { Level } from '../../match/bot'
import { hashOf, newSalt } from '../../match/lockin'

export { newSalt }

/*
 * Shootout: a penalty shootout, two players. Kicks go in turns (one shoots, the other keeps), five
 * each, ending early once one side can't catch up; level after five each, it's sudden death.
 *
 * Every kick both choose in secret. The shooter aims at the goal (x from post to post, −1 to 1; y
 * from the grass to the bar, 0 to 1), with a sway on the aim that grows toward the woodwork: past
 * the frame it's wide or over, on it the post or the bar. The keeper picks one of six dives. The
 * goal is split into six spots too (left, middle, right; low, high): the keeper at the shot's spot
 * saves it, at the right side but the wrong height it's fingertips (a coin), anywhere else a goal.
 *
 * The fingertips coin comes from both salts, so neither player can rig it. Online (later), each pick
 * is a SHA-256 lock-in revealed at the strike, the Ampe way.
 */

export type Seat = 0 | 1
/** a spot in the goal: 0–2 low (left, middle, right), 3–5 high */
export type Spot = 0 | 1 | 2 | 3 | 4 | 5
export const colOf = (s: Spot) => ((s % 3) - 1) as -1 | 0 | 1
export const isHigh = (s: Spot) => s >= 3
export const spotAt = (col: -1 | 0 | 1, high: boolean) => (col + 1 + (high ? 3 : 0)) as Spot
/** a keeper who never picked stands still */
export const STAND: Spot = 1

export type Outcome = 'goal' | 'tipsIn' | 'saved' | 'tips' | 'post' | 'bar' | 'wide' | 'over'
export const scored = (o: Outcome) => o === 'goal' || o === 'tipsIn'

/** regulation kicks each */
export const KICKS = 5
/** from the whistle: the shooter's time to shoot (ms); out of time, they scuff it */
export const AIM_MS = 6000
/** the run-up, from letting go to the strike */
export const RUN_MS = 1100
/** the ball's flight from the spot to the goal line */
export const FLIGHT_MS = 650
/** after the flight: the result shows before the next whistle */
export const SHOW_MS = 2100
/** close calls play the end of the flight slowed: from this far along it, at this speed */
export const SLOWMO = { from: 0.55, speed: 0.35 }
/** how much longer a slowed flight takes */
export const SLOW_EXTRA_MS = Math.round(FLIGHT_MS * (1 - SLOWMO.from) * (1 / SLOWMO.speed - 1))

/** a close call, played in slow motion: fingertips, the woodwork, or a save at full stretch */
export function closeCall(k: { outcome: Outcome; dive: Spot }): boolean {
  return k.outcome === 'tips' || k.outcome === 'tipsIn' || k.outcome === 'post' || k.outcome === 'bar' || (k.outcome === 'saved' && colOf(k.dive) !== 0)
}

/** time since a kick's strike as the replay shows it: the same, but slowed through a close call's last stretch */
export function replayMs(k: { outcome: Outcome; dive: Spot }, dt: number): number {
  if (!closeCall(k)) return dt
  const a = FLIGHT_MS * SLOWMO.from
  const slowLen = (FLIGHT_MS - a) / SLOWMO.speed
  if (dt <= a) return dt
  if (dt <= a + slowLen) return a + (dt - a) * SLOWMO.speed
  return dt - SLOW_EXTRA_MS
}
/** a shooter out of time: a soft one down the middle, gathered by the keeper */
export const SCUFF = { x: 0, y: 0.12 }

/** online: past the strike with no pick shown from the other phone, it counts as nothing shown */
export const REVEAL_WAIT_MS = 3500
/** online: past the shooter's time with no shot, the other phone sets the scuff going this much later */
export const CLAIM_MS = 2500

/** per-seat entries are keyed s0 / s1: the database would turn 0 / 1 keys into a list */
export type SeatKey = 's0' | 's1'
export const key = (s: Seat): SeatKey => (s === 0 ? 's0' : 's1')
type BySeat<T> = Partial<Record<SeatKey, T>>

/** a pick shown at the strike: the shooter's aim (x, y; none = out of time), the keeper's dive (none = stood still) */
export interface Reveal {
  x?: number
  y?: number
  spot?: Spot
  salt?: string
  /** nothing to show (the database drops an empty entry) */
  none?: true
  /** shown for a phone that went quiet, by the other phone */
  claimed?: true
}
/** no shot (out of time) or no dive (standing still) */
export const NONE: Reveal = { none: true }
/** a quiet phone's pick, filled in by the other: nothing (it doesn't count against its lock-in) */
export const CLAIMED: Reveal = { none: true, claimed: true }

export interface Kick {
  n: number
  shooter: Seat
  x: number
  y: number
  dive: Spot
  outcome: Outcome
  /** server time of the strike */
  strike: number
  commit?: BySeat<string>
  reveal?: BySeat<Reveal>
}

export interface ShootoutLive {
  /** kicks taken so far (the one in play is kick n, from 0) */
  n: number
  /** who shoots first */
  first: Seat
  /** every kick's outcome, in order */
  log?: Outcome[]
  /** server time of this kick's whistle (0 = not yet set) */
  start: number
  /** server time of the strike, set when the shooter lets go (0 = not yet) */
  strike?: number
  commit?: BySeat<string>
  reveal?: BySeat<Reveal>
  /** the kick just taken */
  last?: Kick | null
  /** who has scored a Panenka (for the feat) */
  panenka?: BySeat<true>
  result?: { winner: Seat; why?: 'foul' } | null
}

export function freshLive(first: Seat): ShootoutLive {
  return { n: 0, first, log: [], start: 0, strike: 0, commit: {}, reveal: {}, last: null, result: null }
}

export const shooterOf = (n: number, first: Seat) => (n % 2 === 0 ? first : ((1 - first) as Seat))

/** goals and kicks taken per seat */
export function tally(log: Outcome[], first: Seat): { goals: [number, number]; taken: [number, number]; kicks: [Outcome[], Outcome[]] } {
  const goals: [number, number] = [0, 0]
  const taken: [number, number] = [0, 0]
  const kicks: [Outcome[], Outcome[]] = [[], []]
  log.forEach((o, n) => {
    const s = shooterOf(n, first)
    taken[s]++
    kicks[s].push(o)
    if (scored(o)) goals[s]++
  })
  return { goals, taken, kicks }
}

/** the winner, once the shootout is settled: out of reach in the five, or ahead after an equal number in sudden death */
export function decided(log: Outcome[], first: Seat): Seat | null {
  const { goals, taken } = tally(log, first)
  if (taken[0] <= KICKS && taken[1] <= KICKS) {
    const left: [number, number] = [KICKS - taken[0], KICKS - taken[1]]
    if (goals[0] > goals[1] + left[1]) return 0
    if (goals[1] > goals[0] + left[0]) return 1
  }
  if (taken[0] === taken[1] && taken[0] >= KICKS && goals[0] !== goals[1]) return goals[0] > goals[1] ? 0 : 1
  return null
}

/** where an aim ends up: off target (wide, over, the woodwork) or one of the six spots */
export function landing(x: number, y: number): { spot: Spot; miss?: 'post' | 'bar' | 'wide' | 'over' } {
  const ax = Math.abs(x)
  const col = (x < -1 / 3 ? -1 : x > 1 / 3 ? 1 : 0) as -1 | 0 | 1
  const spot = spotAt(col, y >= 0.5)
  if (ax > 1.03) return { spot, miss: 'wide' }
  if (y > 1.04) return { spot, miss: 'over' }
  if (ax > 0.96) return { spot, miss: 'post' }
  if (y > 0.96) return { spot, miss: 'bar' }
  return { spot }
}

/** a kick's outcome; `heads` settles fingertips (the keeper gets it on heads) */
export function judge(x: number, y: number, dive: Spot, heads: boolean): Outcome {
  const { spot, miss } = landing(x, y)
  if (miss) return miss
  if (colOf(spot) !== colOf(dive)) return 'goal'
  if (isHigh(spot) === isHigh(dive)) return 'saved'
  return heads ? 'tips' : 'tipsIn'
}

/** the fingertips coin, from both salts (FNV-1a): fixed once both picks are in, known to nobody before */
export function coin(shooterSalt = '', keeperSalt = ''): boolean {
  let h = 0x811c9dc5
  for (const c of `${shooterSalt}|${keeperSalt}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  return (h & 1) === 1
}

/** the sway on the shooter's aim at time t (ms): bigger the nearer the aim is to the woodwork */
export function sway(x: number, y: number, t: number): { x: number; y: number } {
  const edge = Math.min(1.2, Math.max(Math.abs(x), y))
  const a = 0.025 + 0.2 * edge ** 3
  return { x: x + a * Math.sin((t / 900) * 2 * Math.PI), y: y + 0.6 * a * Math.sin((t / 1300) * 2 * Math.PI + 1) }
}

export const round = (v: number) => Math.round(v * 1000) / 1000

/** the shooter lets go: the strike is set (and, online, their lock-in goes with it) */
export function shoot(l: ShootoutLive, n: number, strike: number, commit?: string): ShootoutLive | undefined {
  if (l.result || l.n !== n || l.strike) return undefined
  const s = shooterOf(n, l.first)
  // (never an undefined field: the database refuses the whole write)
  return { ...l, strike, commit: commit ? { ...l.commit, [key(s)]: commit } : (l.commit ?? {}) }
}

/** the keeper's lock-in for this kick (they can change it), refused once anyone has revealed */
export function lockIn(l: ShootoutLive, n: number, seat: Seat, commit: string): ShootoutLive | undefined {
  if (l.result || l.n !== n || Object.keys(l.reveal ?? {}).length) return undefined
  return { ...l, commit: { ...l.commit, [key(seat)]: commit } }
}

/** a kick's outcome from the two picks shown */
export function settle(shot: Reveal, keep: Reveal): { x: number; y: number; dive: Spot; outcome: Outcome } {
  const x = round(shot.x ?? SCUFF.x)
  const y = round(shot.y ?? SCUFF.y)
  const dive = keep.spot ?? STAND
  // a scuff (out of time) rolls gently to the keeper, wherever they went
  const outcome = shot.x === undefined ? 'saved' : judge(x, y, dive, coin(shot.salt, keep.salt))
  return { x, y, dive, outcome }
}

/**
 * A reveal at the strike (or picks given for Ops, or for a phone that never answered). With both in,
 * the kick is settled: the outcome, the log, the next whistle, and the winner once it's decided.
 */
export function revealIn(l: ShootoutLive, n: number, given: BySeat<Reveal>): ShootoutLive | undefined {
  if (l.result || l.n !== n || !l.strike) return undefined
  const reveal = { ...l.reveal }
  for (const k of ['s0', 's1'] as SeatKey[]) if (given[k] && !reveal[k]) reveal[k] = given[k]
  if (!reveal.s0 || !reveal.s1) return { ...l, reveal }
  const shooter = shooterOf(n, l.first)
  const { x, y, dive, outcome } = settle(reveal[key(shooter)]!, reveal[key((1 - shooter) as Seat)]!)
  // the Panenka: a goal chipped high down the middle while the keeper dives to a side
  const panenka = outcome === 'goal' && landing(x, y).spot === 4 && colOf(dive) !== 0
  const log = [...(l.log ?? []), outcome]
  const winner = decided(log, l.first)
  return {
    n: n + 1,
    first: l.first,
    log,
    start: l.strike + FLIGHT_MS + SHOW_MS + (closeCall({ outcome, dive }) ? SLOW_EXTRA_MS : 0),
    strike: 0,
    commit: {},
    reveal: {},
    last: { n, shooter, x, y, dive, outcome, strike: l.strike, commit: l.commit ?? {}, reveal },
    result: winner === null ? null : { winner },
    // (left out until someone scores one: the database refuses an undefined field)
    ...(panenka || l.panenka ? { panenka: { ...l.panenka, ...(panenka ? { [key(shooter)]: true } : {}) } } : {}),
  }
}

/* ── Ops ── */

const pickOf = <T,>(xs: T[], rand: () => number) => xs[Math.floor(rand() * xs.length) % xs.length]

/** the column someone goes to most (the latest breaking ties), or null with too little to go on */
function favourite(cols: number[]): -1 | 0 | 1 | null {
  if (cols.length < 2) return null
  const count = new Map<number, number>()
  cols.forEach((c) => count.set(c, (count.get(c) ?? 0) + 1))
  let best: number | null = null
  for (let i = cols.length - 1; i >= 0; i--) if (best === null || count.get(cols[i])! > count.get(best)!) best = cols[i]
  return best as -1 | 0 | 1
}

/**
 * Ops in goal reads where you've shot. On easy she guesses; on medium she follows your favourite
 * side half the time; on hard most of the time, and your favourite height too.
 */
export function opsDive(level: Level, yourShots: Spot[], rand: () => number = Math.random): Spot {
  const trust = level === 'hard' ? 0.7 : level === 'medium' ? 0.45 : 0
  const guess = () => pickOf<Spot>([0, 0, 2, 2, 1, 3, 5, 3, 5, 4], rand)
  const fav = favourite(yourShots.map(colOf))
  if (fav === null || rand() >= trust) return guess()
  const high = level === 'hard' ? yourShots.filter(isHigh).length * 2 > yourShots.length : rand() < 0.4
  return spotAt(fav, high)
}

/**
 * Ops shooting goes away from where you've dived most. On easy she aims safe, well inside the
 * posts; on hard she goes for the corners, and now and then hits the woodwork.
 */
export function opsShot(level: Level, yourDives: Spot[], rand: () => number = Math.random): { x: number; y: number } {
  const fav = level === 'easy' ? null : favourite(yourDives.map(colOf))
  const cols: (-1 | 0 | 1)[] = [-1, 0, 1].filter((c) => c !== fav) as (-1 | 0 | 1)[]
  // the middle is a gamble: she goes there less
  const col = rand() < 0.2 && cols.includes(0) ? 0 : pickOf(cols.filter((c) => c !== 0).length ? cols.filter((c) => c !== 0) : cols, rand)
  const high = rand() < (level === 'hard' ? 0.55 : level === 'medium' ? 0.4 : 0.25)
  const reach = level === 'hard' ? 0.8 : level === 'medium' ? 0.7 : 0.6
  const noise = level === 'hard' ? 0.13 : 0.1
  const wobble = () => (rand() + rand() + rand() - 1.5) * noise
  return { x: round(col * reach + wobble()), y: round(Math.max(0.05, (high ? 0.74 : 0.22) + wobble())) }
}

/** when Ops lets go, from the whistle (ms) */
export const opsWait = (rand: () => number = Math.random) => 1300 + rand() * 2000

/* ── online: lock-ins and checks ── */

export const shotCommit = (n: number, x: number, y: number, salt: string) => hashOf(`${n}:shot:${x}:${y}:${salt}`)
export const diveCommit = (n: number, spot: Spot, salt: string) => hashOf(`${n}:dive:${spot}:${salt}`)

/**
 * Does a kick hold up? The seat's pick shown at the strike is the one it locked in (no lock-in, no
 * pick: a scuff or standing still), and the outcome follows from both picks.
 */
export async function honest(k: Kick, seat: Seat): Promise<boolean> {
  const r = k.reveal?.[key(seat)]
  const c = k.commit?.[key(seat)]
  if (!r) return false
  const shown = seat === k.shooter ? r.x !== undefined : r.spot !== undefined
  if (!shown) {
    // a phone that went quiet (filled in by the other) isn't a cheat; one hiding its lock-in is
    if (c && !r.claimed) return false
  } else {
    if (!c || !r.salt) return false
    const want = seat === k.shooter ? await shotCommit(k.n, r.x!, r.y ?? 0, r.salt) : await diveCommit(k.n, r.spot!, r.salt)
    if (want !== c) return false
  }
  const shooter = k.reveal?.[key(k.shooter)]
  const keeper = k.reveal?.[key((1 - k.shooter) as Seat)]
  return !!shooter && !!keeper && settle(shooter, keeper).outcome === k.outcome
}
