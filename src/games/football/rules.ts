import type { Seat } from '../../lobby/rooms'
import { BALL, LENGTH, kickoff, simulate, teamOf, type Flick, type Pos } from './physics'

/*
 * Flick football. One flick a turn, turn about. Put the ball in the other end and it's a goal; the
 * ball in your own end counts for the other side. After a goal everyone lines up again and the side
 * that let it in kicks off. First to the target wins.
 *
 * The match only changes when a flick is played. The flick (which disc, its angle and power, and
 * the position it was played from) is kept so every screen can replay it, then sits at `pos`.
 */

export const GOAL_MS = 1800

export interface PlayedFlick extends Flick {
  /** counts up through the match, so a screen knows a new flick has come in */
  n: number
  by: Seat
  from: Pos
}

export interface Goal {
  /** who it counts for */
  for: Seat
  /** who flicked it in (the other side, for an own goal) */
  by: Seat
  /** the score after it */
  score: [number, number]
  /** the ball was in the scorer's own half when it was flicked */
  long?: boolean
}

export interface Live {
  turn: Seat
  pos: Pos
  scores: { s0: number; s1: number }
  shot?: PlayedFlick | null
  /** who kicked off this match */
  first: Seat
  /** every goal so far (missing until the first: the database drops empty lists) */
  goals?: Goal[]
  result?: { winner: Seat } | null
}

export const other = (s: Seat) => (s === 0 ? 1 : 0) as Seat

export function freshLive(first: Seat): Live {
  return { turn: first, pos: kickoff(), scores: { s0: 0, s1: 0 }, shot: null, first, goals: [], result: null }
}

/** Is the ball in `seat`'s own half? (Seat 0 defends the bottom.) */
export const inOwnHalf = (pos: Pos, seat: Seat) => (seat === 0 ? pos[BALL * 2 + 1] > LENGTH / 2 : pos[BALL * 2 + 1] < LENGTH / 2)

/** `by` flicks. Returns the next state, or undefined when it isn't theirs to play. */
export function playFlick(l: Live, by: Seat, flick: Flick, target: number): Live | undefined {
  if (l.result || l.turn !== by || teamOf(flick.disc) !== by) return undefined
  const from = l.pos
  const out = simulate(from, flick)
  const shot: PlayedFlick = { ...flick, n: (l.shot?.n ?? 0) + 1, by, from }
  if (!out.goal) return { ...l, pos: out.end, shot, turn: other(by) }

  const scorer: Seat = out.goal === 'top' ? 0 : 1
  const scores = { ...l.scores, [`s${scorer}`]: l.scores[`s${scorer}`] + 1 } as Live['scores']
  const goal: Goal = { for: scorer, by, score: [scores.s0, scores.s1], ...(scorer === by && inOwnHalf(from, by) ? { long: true } : {}) }
  const won = scores[`s${scorer}`] >= target
  return {
    ...l,
    pos: won ? out.end : kickoff(),
    shot,
    scores,
    goals: [...(l.goals ?? []), goal],
    turn: other(scorer),
    result: won ? { winner: scorer } : null,
  }
}
