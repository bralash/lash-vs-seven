import type { Seat } from '../../lobby/rooms'
import { holeById, pickHoles } from './holes'
import { simulate, type Pt, type Shot } from './physics'

/*
 * Head-to-head mini golf over five holes. Both balls are on the course; you take turns shot by
 * shot, and once one ball is in, the other plays on alone. Six shots at most on a hole: still out
 * after six and it's picked up and scores 7. Water costs a shot and the ball goes back to where it
 * was struck from. The balls pass through each other. Fewest shots over the five wins; level goes to
 * one playoff hole, and level after that is a draw.
 *
 * The match only changes when a shot is played. The shot is kept so every screen can replay it.
 */

export const HOLES_PER_MATCH = 5
export const CAP = 6
/** what a ball picked up after CAP shots scores */
export const PICKED_UP = CAP + 1
export const HOLE_MS = 1500

export interface BallSt {
  x: number
  y: number
  /** shots on this hole so far, water included */
  n: number
  /** in the cup, or picked up */
  done?: true
}

export interface PlayedShot extends Shot {
  /** counts up through the match, so a screen knows a new shot has come in */
  n: number
  by: Seat
  /** which hole it was played on (index into `holes`) */
  at: number
  from: Pt
  holed?: true
  wet?: true
  /** six shots and still out */
  up?: true
}

export interface Live {
  /** the five holes and the spare for a playoff */
  holes: string[]
  /** the hole in play: 0–4, 5 is the playoff */
  at: number
  balls: [BallSt, BallSt]
  turn: Seat
  /** who teed off first on this hole */
  lead: Seat
  shot?: PlayedShot | null
  /** each player's scores, hole by hole (missing until the first: the database drops empty lists) */
  c0?: number[]
  c1?: number[]
  result?: { winner: Seat | -1 } | null
}

export const other = (s: Seat) => (s === 0 ? 1 : 0) as Seat
export const cardOf = (l: Live, s: Seat) => (s === 0 ? l.c0 : l.c1) ?? []
export const parOf = (l: Live, at: number) => holeById(l.holes[at]).par
/** a player's shots so far: finished holes and this one */
export const totalOf = (l: Live, s: Seat) => cardOf(l, s).slice(0, HOLES_PER_MATCH).reduce((a, b) => a + b, 0) + (l.at < HOLES_PER_MATCH && !l.result ? l.balls[s].n : 0)

const teed = (at: number, l: Pick<Live, 'holes'>): [BallSt, BallSt] => {
  const [x, y] = holeById(l.holes[at]).tee
  return [
    { x, y, n: 0 },
    { x, y, n: 0 },
  ]
}

export function freshLive(first: Seat, holes = pickHoles()): Live {
  return { holes, at: 0, balls: teed(0, { holes }), turn: first, lead: first, shot: null, result: null }
}

/** `by` plays a shot. Returns the next state, or undefined when it isn't theirs to play. */
export function playShot(l: Live, by: Seat, shot: Shot): Live | undefined {
  const mine = l.balls[by]
  if (l.result || l.turn !== by || mine.done) return undefined
  const from: Pt = [mine.x, mine.y]
  const hole = holeById(l.holes[l.at])
  const out = simulate(hole, from, shot, false)
  const n = mine.n + 1 + (out.wet ? 1 : 0)
  const up = !out.holed && n >= CAP
  const ball: BallSt = out.holed ? { x: hole.cup[0], y: hole.cup[1], n, done: true } : up ? { x: out.end[0], y: out.end[1], n: PICKED_UP, done: true } : { x: out.end[0], y: out.end[1], n }
  const played: PlayedShot = {
    angle: shot.angle,
    power: shot.power,
    phase: shot.phase,
    n: (l.shot?.n ?? 0) + 1,
    by,
    at: l.at,
    from,
    ...(out.holed ? { holed: true as const } : {}),
    ...(out.wet ? { wet: true as const } : {}),
    ...(up ? { up: true as const } : {}),
  }
  const balls = (by === 0 ? [ball, l.balls[1]] : [l.balls[0], ball]) as [BallSt, BallSt]
  const them = balls[other(by)]
  if (!them.done) return { ...l, balls, shot: played, turn: other(by) }
  if (!ball.done) return { ...l, balls, shot: played, turn: by }

  // the hole is over
  const c0 = [...cardOf(l, 0), balls[0].n]
  const c1 = [...cardOf(l, 1), balls[1].n]
  const next = { ...l, shot: played, c0, c1 }
  // the honour: fewer shots tees off first on the next hole
  const lead: Seat = balls[0].n < balls[1].n ? 0 : balls[1].n < balls[0].n ? 1 : l.lead
  const sum = (c: number[]) => c.slice(0, HOLES_PER_MATCH).reduce((a, b) => a + b, 0)
  let winner: Seat | -1 | null = null
  if (l.at === HOLES_PER_MATCH - 1) {
    const [a, b] = [sum(c0), sum(c1)]
    if (a !== b) winner = a < b ? 0 : 1
  } else if (l.at === HOLES_PER_MATCH) {
    const [a, b] = [c0[HOLES_PER_MATCH], c1[HOLES_PER_MATCH]]
    winner = a < b ? 0 : b < a ? 1 : -1
  }
  if (winner !== null) return { ...next, balls, result: { winner } }
  const at = l.at + 1
  return { ...next, at, balls: teed(at, l), turn: lead, lead }
}
