import type { Level } from '../../match/bot'

/*
 * Ampe, two players. Every exchange both jump, clap and kick a foot out, left or right. The leader
 * scores when the feet match (both to the same side), the other player when they don't. The lead
 * stays with the leader until they lose an exchange, then it passes. First to the target wins.
 * The beat gets quicker as the match goes on.
 *
 * Online, a pick is secret until the kick: you lock in SHA-256("n:foot:salt") the moment you tap,
 * and reveal foot and salt on the kick; the other phone checks it. No lock-in may land once anyone
 * has revealed, so nobody can see the other's foot and then choose.
 */

export type Seat = 0 | 1
/** -1 left, 1 right (of the screen, the same on both phones); 0 = no pick in time */
export type Foot = -1 | 0 | 1

/** from the start of an exchange to the kick: the time to pick (ms) */
const BEAT_MS = 1700
const MIN_BEAT = 850
const QUICKER = 0.965
export const beatOf = (n: number) => Math.round(Math.max(MIN_BEAT, BEAT_MS * QUICKER ** (n - 1)))
/** after the kick: the feet stay out and the point shows before the next exchange (ms) */
export const SHOW_MS = 1500
/** past the kick with no reveal from the other phone: it counts as no pick */
export const REVEAL_WAIT_MS = 3500

export type Why = 'match' | 'apart' | 'slow' | 'foul'

/** per-seat entries are keyed s0 / s1: the database would turn 0 / 1 keys into a list */
export type SeatKey = 's0' | 's1'
export const key = (s: Seat): SeatKey => (s === 0 ? 's0' : 's1')
type BySeat<T> = Partial<Record<SeatKey, T>>

export interface Reveal {
  foot: Foot
  salt?: string
}

export interface AmpeLive {
  /** the exchange in play, from 1 */
  n: number
  leader: Seat
  points: [number, number]
  /** server time this exchange starts (0 = not yet set) */
  start: number
  /** lock-ins and reveals for exchange n, by seat */
  commit?: BySeat<string>
  reveal?: BySeat<Reveal>
  /** the exchange just played */
  last?: { n: number; feet: [Foot, Foot]; leader: Seat; winner: Seat | -1; why: Why; commit?: BySeat<string>; reveal?: BySeat<Reveal> } | null
  /** longest run of exchanges won in a row, per seat (for feats) */
  run?: [number, number]
  streak?: { seat: Seat; len: number } | null
  result?: { winner: Seat; why?: 'foul' } | null
}

export function freshLive(leader: Seat): AmpeLive {
  return { n: 1, leader, points: [0, 0], start: 0, commit: {}, reveal: {}, last: null, run: [0, 0], streak: null, result: null }
}

/** who takes exchange: the leader on matching feet, the other on different ones; no pick loses, two no-picks replay */
export function judge(feet: [Foot, Foot], leader: Seat): { winner: Seat | null; why: Why } {
  const [a, b] = feet
  if (!a && !b) return { winner: null, why: 'slow' }
  if (!a) return { winner: 1, why: 'slow' }
  if (!b) return { winner: 0, why: 'slow' }
  return a === b ? { winner: leader, why: 'match' } : { winner: (1 - leader) as Seat, why: 'apart' }
}

/** a lock-in for this exchange, refused once anyone has revealed */
export function lockIn(l: AmpeLive, n: number, seat: Seat, commit: string): AmpeLive | undefined {
  if (l.result || l.n !== n || Object.keys(l.reveal ?? {}).length) return undefined
  return { ...l, commit: { ...l.commit, [key(seat)]: commit } }
}

/**
 * A reveal (or, for Ops and a phone that never answered, a pick given for them). With both in, the
 * exchange is settled: the point, the lead, the next start.
 */
export function revealIn(l: AmpeLive, n: number, given: BySeat<Reveal>, target: number, now: number): AmpeLive | undefined {
  if (l.result || l.n !== n) return undefined
  const reveal = { ...l.reveal }
  for (const k of ['s0', 's1'] as SeatKey[]) if (given[k] && !reveal[k]) reveal[k] = given[k]
  if (!reveal.s0 || !reveal.s1) return { ...l, reveal }
  const feet: [Foot, Foot] = [reveal.s0.foot, reveal.s1.foot]
  const { winner, why } = judge(feet, l.leader)
  const points: [number, number] = [...l.points]
  const run: [number, number] = [...(l.run ?? [0, 0])]
  let streak = l.streak ?? null
  if (winner !== null) {
    points[winner]++
    streak = streak?.seat === winner ? { seat: winner, len: streak.len + 1 } : { seat: winner, len: 1 }
    run[winner] = Math.max(run[winner], streak.len)
  }
  // the lead passes when the leader loses
  const leader = winner !== null && winner !== l.leader ? winner : l.leader
  const won = winner !== null && points[winner] >= target
  return {
    n: l.n + 1,
    leader,
    points,
    start: now + SHOW_MS,
    commit: {},
    reveal: {},
    // (the database drops nulls: no winner is stored as -1)
    last: { n: l.n, feet, leader: l.leader, winner: winner ?? -1, why, commit: l.commit ?? {}, reveal },
    run,
    streak,
    result: won ? { winner: winner as Seat } : null,
  }
}

export async function commitOf(n: number, foot: Foot, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${n}:${foot}:${salt}`))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** does a settled exchange hold up: each foot shown was locked in before, and the point is right? */
export async function honest(last: NonNullable<AmpeLive['last']>, seat: Seat): Promise<boolean> {
  const r = last.reveal?.[key(seat)]
  const c = last.commit?.[key(seat)]
  if (!r) return false
  if (r.foot !== 0 && (!c || !r.salt || (await commitOf(last.n, r.foot, r.salt)) !== c)) return false
  const j = judge(last.feet, last.leader)
  return (j.winner ?? -1) === last.winner
}

/* ── Ops ── */

/**
 * Ops reads your habits: what you did after each foot you've picked. On easy she guesses, on medium
 * she follows the pattern half the time, on hard most of the time. As leader she plays the foot she
 * expects from you (to match it); otherwise the other one.
 */
export function opsFoot(level: Level, history: Foot[], leader: boolean, rand: () => number = Math.random): Foot {
  const coin = (): Foot => (rand() < 0.5 ? -1 : 1)
  const trust = level === 'hard' ? 0.8 : level === 'medium' ? 0.5 : 0
  const picks = history.filter((f) => f !== 0)
  if (picks.length < 3 || rand() >= trust) return coin()
  const lastFoot = picks[picks.length - 1]
  let same = 0
  let swap = 0
  for (let i = 1; i < picks.length; i++) {
    if (picks[i - 1] !== lastFoot) continue
    if (picks[i] === lastFoot) same++
    else swap++
  }
  if (same === swap) return coin()
  const expect = (same > swap ? lastFoot : -lastFoot) as Foot
  return leader ? expect : ((-expect) as Foot)
}
