import type { Level } from '../../match/bot'
import type { Side } from '../pingpong/engine'

/*
 * Ping Pong: the minimal one. Each end has two spots, left and right of the screen; a shot goes
 * from the hitter's spot to one of the other end's. You tap the side it's coming to, and when you
 * tap aims your return: early goes across, late goes down the line, right on time is a smash.
 * The scoring (games to 11, the house serve and calls) is Table Tennis's: see ../pingpong/engine.
 */

/** a side of the screen: -1 left, 1 right */
export type Lane = -1 | 1

export interface Flight {
  by: Side
  from: Lane
  to: Lane
  /** leaves the bat, lands on the table, reaches the other bat (ms on the rally clock) */
  t0: number
  tb: number
  t1: number
  smash: boolean
  serve: boolean
  /** a bad shot: it dies in the net or sails off the end, and the point goes as soon as it does */
  fault?: 'net' | 'long'
  /** shots this point, this one included */
  hits: number
}

/** a fresh rally's ball crosses in this long; every shot after is a little quicker, down to MIN_MS */
const FLIGHT_MS = 1400
const MIN_MS = 650
const SPEEDUP = 0.965
/** a smash crosses this much quicker */
const SMASH_K = 0.62

export function flightMs(hits: number, smash: boolean) {
  const base = Math.max(MIN_MS, FLIGHT_MS * SPEEDUP ** Math.max(0, hits - 1))
  return smash ? Math.max(400, base * SMASH_K) : base
}

export function plan(by: Side, from: Lane, to: Lane, t0: number, hits: number, opts: { smash?: boolean; serve?: boolean; fault?: 'net' | 'long' } = {}): Flight {
  const ms = flightMs(hits, !!opts.smash) * (opts.serve ? 1.08 : 1)
  // a ball into the net stops there; one that goes long never comes down on the table
  const tb = t0 + ms * (opts.fault === 'net' ? 0.42 : 0.7)
  return { by, from, to, t0, tb, t1: t0 + ms, smash: !!opts.smash, serve: !!opts.serve, hits, ...(opts.fault ? { fault: opts.fault } : {}) }
}

/** the ball can be hit from its bounce on your side until a little after it reaches your bat: the bounce-to-bat time is the unit (ms) */
export const windowOf = (f: Flight) => f.t1 - f.tb
/** how late after its arrival it can still be hit, in windows */
export const LATE = 0.6
/** inside this much of the window either way, it's on time: a smash */
export const ON_TIME = 0.15
/** this near either end of the window, the shot is a gamble */
const EDGE_EARLY = 0.85
const EDGE_LATE = 0.45

/** timing: -1 (just off the bounce) … 0 (on time, as it reaches the bat) … LATE; null when it can't be hit now */
export function timing(f: Flight, t: number): number | null {
  const d = (t - f.t1) / windowOf(f)
  return d >= -1 && d <= LATE ? d : null
}

/** what a hit at timing d from your spot does: early goes across, late down the line, on time is a smash */
export function returnOf(d: number, lane: Lane, rand: () => number = Math.random): { to: Lane; smash: boolean; fault?: 'net' | 'long' } {
  if (Math.abs(d) <= ON_TIME) return { to: (-lane) as Lane, smash: true }
  const to = (d < 0 ? -lane : lane) as Lane
  // snatched right at the start of the window, or scraped right at its end: it may not go over
  if ((d <= -EDGE_EARLY || d >= EDGE_LATE) && rand() < 0.25) return { to, smash: false, fault: d < 0 ? 'net' : 'long' }
  return { to, smash: false }
}

/* ── Ops ── */

const SKILL: Record<Level, { keep: number; smash: number; vsSmash: number; wrongFoot: number }> = {
  easy: { keep: 0.8, smash: 0.05, vsSmash: 0.22, wrongFoot: 0 },
  medium: { keep: 0.88, smash: 0.11, vsSmash: 0.22, wrongFoot: 0 },
  // hard gets almost everything back (your smashes too), and plays it away from you
  hard: { keep: 0.97, smash: 0.2, vsSmash: 0.1, wrongFoot: 0.85 },
}

/**
 * Ops' answer to a ball coming at her, decided as it's hit: she gets to it and plays it at timing d,
 * swings and makes a mess of it, or doesn't reach it at all. On hard she aims for the side you're
 * not on (you're where you hit it from): across if you went down the line, down the line if you
 * went across, and when across is the way, she often smashes it.
 */
export function opsPlan(level: Level, f: Flight, rand: () => number = Math.random): { d: number } | { swingFault: 'net' | 'long' } | 'miss' {
  const k = SKILL[level]
  const keep = k.keep - (f.smash ? k.vsSmash : 0) - Math.max(0, f.hits - 8) * (level === 'hard' ? 0.006 : 0.012)
  if (rand() < keep) {
    if (rand() < k.wrongFoot) {
      // her early hits go across (to the side opposite her), her late ones down the line
      const across = f.from === f.to
      if (across) return rand() < 0.45 ? { d: 0 } : { d: -(0.25 + rand() * 0.15) }
      return { d: 0.2 + rand() * 0.15 }
    }
    if (rand() < k.smash) return { d: 0 }
    // early or late, never quite at the edges
    const sign = rand() < 0.5 ? -1 : 1
    return { d: sign * (0.2 + rand() * 0.2) }
  }
  return rand() < 0.3 ? { swingFault: rand() < 0.5 ? 'net' : 'long' } : 'miss'
}

/** Ops' serve: either side, after a moment */
export const opsServeLane = (rand: () => number = Math.random): Lane => (rand() < 0.5 ? -1 : 1)


/* ── online: one message per shot ── */

export interface ShotMsg {
  id: string
  /** the seat that hit it */
  by: Side
  /** server time of the hit */
  at: number
  /** which point it belongs to, so a stray shot from the last rally is never played */
  pt: string
  /** the flight in seat 0's view (seat 0 at the near end), its times counted from the hit */
  f: Flight
}

/** the other end's view of a flight: left and right swap, and so do the ends */
export const mirror = (f: Flight): Flight => ({ ...f, by: (1 - f.by) as Side, from: (-f.from) as Lane, to: (-f.to) as Lane })

/**
 * A shot from the other phone, starting here now, `late` ms after it was hit there: the flight to the
 * bounce is cut short by the lag (never under 140ms) so the bounce and the arrival stay on schedule.
 */
export function rebase(f: Flight, now: number, late: number): Flight {
  const pre = Math.max(140, f.tb - f.t0 - late)
  return { ...f, t0: now, tb: now + pre, t1: now + pre + (f.t1 - f.tb) }
}
