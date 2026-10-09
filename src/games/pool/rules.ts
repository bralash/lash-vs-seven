import type { Seat } from '../../lobby/rooms'
import { BALLS, FOOT_SPOT, HEAD_SPOT, OFF, freeSpot, groupOf, onTable, rack, simulate, type Pos, type Shot } from './physics'

/*
 * 8-ball, American style, the basics for now: the break, then the first ball potted decides who has
 * solids (1–7) and who has stripes (9–15). Pot one of yours and you go again; miss, or pot the cue
 * ball (a scratch, and it goes back on its spot), and it's the other player's turn. Clear your group,
 * then the 8 wins the frame; the 8 before that loses it. Fouls with ball in hand, and calling the 8's
 * pocket, come next.
 *
 * The frame only changes when a shot is played: the shot itself (angle, power, spin, and the position
 * it was played from) is kept so every screen can replay it.
 */

export type Group = 'solid' | 'stripe'
export const RESULT_MS = 2400

export interface PlayedShot extends Shot {
  /** counts up through the frame, so a screen knows a new shot has come in */
  n: number
  by: Seat
  /** the position it was played from */
  from: Pos
}

export interface Live {
  frame: number
  /** who broke this frame */
  breaker: Seat
  turn: Seat
  pos: Pos
  /** has the break been played */
  broken: boolean
  /** the group each seat has, once decided */
  groups?: [Group, Group] | null
  scores: { s0: number; s1: number }
  shot?: PlayedShot | null
  /** what the last shot did, for the status line */
  says?: string | null
  result?: { winner: Seat; why: string } | null
  /** each finished frame: who took it and how */
  history?: { winner: Seat; why: string }[]
}

export function freshLive(breaker: Seat, frame = 1, scores = { s0: 0, s1: 0 }, history: Live['history'] = [], rand: () => number = Math.random): Live {
  return { frame, breaker, turn: breaker, pos: rack(rand), broken: false, groups: null, scores, shot: null, says: null, result: null, history }
}

export const other = (s: Seat) => (s === 0 ? 1 : 0) as Seat
const GROUP_BALLS: Record<Group, number[]> = { solid: [1, 2, 3, 4, 5, 6, 7], stripe: [9, 10, 11, 12, 13, 14, 15] }
/** how many of a group are still on the table */
export const left = (p: Pos, g: Group) => GROUP_BALLS[g].filter((n) => onTable(p, n)).length
export const groupName = (g: Group) => (g === 'solid' ? 'Solids' : 'Stripes')

/** `by` plays `shot`. Returns the next state, or undefined when it isn't their shot. */
export function playShot(l: Live, by: Seat, shot: Shot, name: (s: Seat) => string): Live | undefined {
  if (l.result || l.turn !== by) return undefined
  const out = simulate(l.pos, shot)
  const pos = out.end.slice()
  const potted = out.potted
  const scratch = potted.includes(0)
  const eight = potted.includes(8)
  const objects = potted.filter((n) => n !== 0 && n !== 8)
  const who = name(by)
  const played: PlayedShot = { ...shot, n: (l.shot?.n ?? 0) + 1, by, from: l.pos }
  let groups = l.groups ?? null
  let says: string

  const spot = (ball: number, at: { x: number; y: number }) => {
    const f = freeSpot(pos, at.x, at.y, ball)
    pos[ball * 2] = f.x
    pos[ball * 2 + 1] = f.y
  }
  if (scratch) spot(0, HEAD_SPOT)

  // the 8 decides the frame (except on the break, where it comes back up)
  if (eight && l.broken) {
    const mine = groups?.[by]
    const cleared = !!mine && left(l.pos, mine) === 0
    const won = cleared && !scratch
    const winner = won ? by : other(by)
    const why = won ? `${who} pots the 8` : scratch ? `${who} scratches on the 8` : `${who} pots the 8 too soon`
    const scores = { ...l.scores }
    scores[`s${winner}`]++
    return { ...l, pos, shot: played, says: why, groups, scores, result: { winner, why }, history: [...(l.history ?? []), { winner, why }] }
  }
  if (eight) spot(8, FOOT_SPOT)

  if (!l.broken) {
    // the break: pot anything (and not the cue ball) to go again; the table stays open
    const again = !scratch && objects.length > 0
    says = scratch ? `${who} scratches on the break` : objects.length ? `${who} pots ${objects.length === 1 ? 'one' : objects.length} on the break` : eight ? 'The 8 goes down on the break and comes back up' : `Nothing down off the break`
    return { ...l, pos, broken: true, shot: played, says, turn: again ? by : other(by) }
  }

  // an open table: the first ball potted gives the shooter that group
  if (!groups && objects.length && !scratch) {
    const g = groupOf(objects[0]) as Group
    groups = (by === 0 ? [g, g === 'solid' ? 'stripe' : 'solid'] : [g === 'solid' ? 'stripe' : 'solid', g]) as [Group, Group]
  }
  const mine = groups?.[by]
  const ownPotted = mine ? objects.filter((n) => groupOf(n) === mine).length : 0
  const again = !scratch && ownPotted > 0
  if (scratch) says = `${who} scratches`
  else if (!l.groups && groups) says = `${who} takes ${groupName(groups[by]).toLowerCase()}`
  else if (ownPotted) says = ownPotted === 1 ? `${who} pots one` : `${who} pots ${ownPotted}`
  else if (objects.length) says = `${who} pots the wrong colour`
  else if (out.first === null) says = `${who} misses everything`
  else says = `${who} misses`
  return { ...l, pos, shot: played, says, groups, turn: again ? by : other(by) }
}

/** The next frame after `finished`: the other player breaks. */
export function nextFrame(l: Live, finished: number): Live | undefined {
  if (!l.result || l.frame !== finished) return undefined
  return freshLive(other(l.breaker), l.frame + 1, l.scores, l.history)
}

/** balls on the table besides the cue ball */
export const ballsOn = (p: Pos) => {
  const out: number[] = []
  for (let i = 1; i < BALLS; i++) if (p[i * 2] !== OFF) out.push(i)
  return out
}
