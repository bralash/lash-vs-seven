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
const FLIGHT_MS = 1150
const MIN_MS = 560
const SPEEDUP = 0.955
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

/** half the window around the ball's arrival you can hit it in (ms): a fifth of its flight, never under 95 */
export const windowOf = (f: Flight) => Math.max(95, (f.t1 - f.t0) * 0.2)
/** how late after its arrival it can still be hit, in windows */
export const LATE = 0.7
/** inside this much of the window either way, it's on time: a smash */
const ON_TIME = 0.2
/** past this much of the window, the shot is a gamble */
const EDGE = 0.8

/** timing: -1 (as early as it can be hit) … 0 (on time) … LATE; null when it can't be hit now */
export function timing(f: Flight, t: number): number | null {
  const d = (t - f.t1) / windowOf(f)
  return d >= -1 && d <= LATE ? d : null
}

/** what a hit at timing d from your spot does: early goes across, late down the line, on time is a smash */
export function returnOf(d: number, lane: Lane, rand: () => number = Math.random): { to: Lane; smash: boolean; fault?: 'net' | 'long' } {
  if (Math.abs(d) <= ON_TIME) return { to: (-lane) as Lane, smash: true }
  const to = (d < 0 ? -lane : lane) as Lane
  // snatched right at the start of the window, or scraped right at its end: it may not go over
  if (Math.abs(d) >= EDGE && rand() < 0.35) return { to, smash: false, fault: d < 0 ? 'net' : 'long' }
  return { to, smash: false }
}

/* ── Ops ── */

const SKILL: Record<Level, { keep: number; smash: number }> = {
  easy: { keep: 0.8, smash: 0.05 },
  medium: { keep: 0.88, smash: 0.11 },
  hard: { keep: 0.94, smash: 0.2 },
}

/**
 * Ops' answer to a ball coming at her, decided as it's hit: she gets to it and plays it at timing d,
 * swings and makes a mess of it, or doesn't reach it at all.
 */
export function opsPlan(level: Level, f: Flight, rand: () => number = Math.random): { d: number } | { swingFault: 'net' | 'long' } | 'miss' {
  const k = SKILL[level]
  const keep = k.keep - (f.smash ? 0.22 : 0) - Math.max(0, f.hits - 8) * 0.012
  if (rand() < keep) {
    if (rand() < k.smash) return { d: 0 }
    // early or late, never quite at the edges
    const sign = rand() < 0.5 ? -1 : 1
    return { d: sign * (0.3 + rand() * 0.4) }
  }
  return rand() < 0.3 ? { swingFault: rand() < 0.5 ? 'net' : 'long' } : 'miss'
}

/** Ops' serve: either side, after a moment */
export const opsServeLane = (rand: () => number = Math.random): Lane => (rand() < 0.5 ? -1 : 1)

