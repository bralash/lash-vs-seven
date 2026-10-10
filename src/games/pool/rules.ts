import type { Seat } from '../../lobby/rooms'
import { BALLS, FOOT_SPOT, HEAD_SPOT, HEAD_Y, LENGTH, OFF, R, WIDTH, freeSpot, groupOf, onTable, rack, simulate, type Pos, type Shot } from './physics'

/*
 * 8-ball, American style.
 *
 * The break is played from anywhere behind the head string. It has to pot a ball or send at least
 * four to a cushion, or the balls are racked again and the other player breaks. The table is open
 * after the break: the first shot that pots only solids (1–7) or only stripes (9–15) makes that group
 * the shooter's. Pot one of yours and you go again.
 *
 * A foul hands the other player ball in hand (they put the cue ball anywhere): potting the cue ball,
 * hitting nothing, hitting the wrong ball first (on an open table the 8 can't be first; after that it
 * must be one of yours, or the 8 once yours are gone), or nothing reaching a cushion after the cue
 * ball's first contact.
 *
 * Once your group is cleared you shoot at the 8 and call its pocket. Pot it there, cleanly, to win the
 * frame. Pot it in another pocket, with a foul, or before your group is cleared, and you lose it. On
 * the break the 8 just comes back up.
 *
 * The frame only changes when a shot is played. The shot itself (angle, power, spin, where the cue ball
 * was put, the call, and the position it was played from) is kept so every screen can replay it.
 */

export type Group = 'solid' | 'stripe'
export const RESULT_MS = 2400

export interface PlayedShot extends Shot {
  /** counts up through the frame, so a screen knows a new shot has come in */
  n: number
  by: Seat
  /** the position it was played from (with the cue ball where it was put, if it was in hand) */
  from: Pos
  /** the pocket called for the 8 */
  call?: number | null
}

export interface Live {
  frame: number
  /** who broke this frame */
  breaker: Seat
  turn: Seat
  pos: Pos
  /** has the break been played */
  broken: boolean
  /** the shooter may put the cue ball where they like first: behind the head string (the break) or anywhere (after a foul) */
  inHand?: 'kitchen' | 'anywhere' | null
  /** the group each seat has, once decided */
  groups?: [Group, Group] | null
  scores: { s0: number; s1: number }
  shot?: PlayedShot | null
  /** what the last shot did, for the status line */
  says?: string | null
  /** set when that shot was a foul */
  foul?: boolean | null
  result?: { winner: Seat; why: string } | null
  /** each finished frame: who took it and how */
  history?: { winner: Seat; why: string }[]
}

export function freshLive(breaker: Seat, frame = 1, scores = { s0: 0, s1: 0 }, history: Live['history'] = [], rand: () => number = Math.random): Live {
  return { frame, breaker, turn: breaker, pos: rack(rand), broken: false, inHand: 'kitchen', groups: null, scores, shot: null, says: null, foul: null, result: null, history }
}

export const other = (s: Seat) => (s === 0 ? 1 : 0) as Seat
const GROUP_BALLS: Record<Group, number[]> = { solid: [1, 2, 3, 4, 5, 6, 7], stripe: [9, 10, 11, 12, 13, 14, 15] }
/** how many of a group are still on the table */
export const left = (p: Pos, g: Group) => GROUP_BALLS[g].filter((n) => onTable(p, n)).length
export const groupName = (g: Group) => (g === 'solid' ? 'Solids' : 'Stripes')
/** is `by` shooting at the 8 (their group cleared)? */
export const onEight = (l: Live, by: Seat) => !!l.groups && left(l.pos, l.groups[by]) === 0

/** Can the cue ball go at (x, y)? On the cloth, clear of every other ball, and behind the head string for the break. */
export function canPlace(l: Live, x: number, y: number) {
  if (!l.inHand) return false
  if (x < R || x > WIDTH - R || y < R || y > LENGTH - R) return false
  if (l.inHand === 'kitchen' && y < HEAD_Y) return false
  for (let i = 1; i < BALLS; i++) if (onTable(l.pos, i) && Math.hypot(l.pos[i * 2] - x, l.pos[i * 2 + 1] - y) < 2 * R + 0.002) return false
  return true
}

export interface Play {
  /** where the cue ball was put, when it was in hand */
  cueAt?: { x: number; y: number } | null
  /** the pocket called for the 8 */
  call?: number | null
}

/** `by` plays `shot`. Returns the next state, or undefined when it isn't theirs to play (or isn't allowed). */
export function playShot(l: Live, by: Seat, shot: Shot, name: (s: Seat) => string, play: Play = {}): Live | undefined {
  if (l.result || l.turn !== by) return undefined
  const start = l.pos.slice()
  if (play.cueAt) {
    if (!canPlace(l, play.cueAt.x, play.cueAt.y)) return undefined
    start[0] = play.cueAt.x
    start[1] = play.cueAt.y
  }
  if (!onTable(start, 0)) return undefined
  const eightUp = l.broken && onEight(l, by)
  if (eightUp && (play.call === undefined || play.call === null)) return undefined

  const out = simulate(start, shot)
  const pos = out.end.slice()
  const potted = out.potted
  const scratch = potted.includes(0)
  const eight = potted.includes(8)
  const objects = potted.filter((n) => n !== 0 && n !== 8)
  const who = name(by)
  const played: PlayedShot = { ...shot, n: (l.shot?.n ?? 0) + 1, by, from: start, call: eightUp ? play.call : null }
  const base = { ...l, shot: played, inHand: null, foul: null }

  const spot = (ball: number, at: { x: number; y: number }) => {
    const f = freeSpot(pos, at.x, at.y, ball)
    pos[ball * 2] = f.x
    pos[ball * 2 + 1] = f.y
  }
  // a pocketed cue ball waits on its spot until the next shooter puts it where they want
  if (scratch) spot(0, HEAD_SPOT)

  /* the break */
  if (!l.broken) {
    if (eight) spot(8, FOOT_SPOT)
    const railed = new Set(out.events.filter((e) => e.k === 'cushion' && e.a !== 0).map((e) => (e.k === 'cushion' ? e.a : 0))).size
    if (!scratch && !objects.length && !eight && railed < 4) {
      // too soft: rack them again, and the other player breaks
      // (the shot is kept, so every screen still plays it out before the balls go back in the rack)
      return { ...freshLive(other(by), l.frame, l.scores, l.history), shot: played, says: `${who}’s break was too soft (${railed} to a cushion): racked again, ${name(other(by))} breaks` }
    }
    if (scratch) return { ...base, pos, broken: true, turn: other(by), inHand: 'anywhere', foul: true, says: `${who} scratches on the break · ball in hand` }
    const again = objects.length > 0
    const says = objects.length ? `${who} pots ${objects.length === 1 ? 'one' : objects.length} on the break` : eight ? 'The 8 goes down on the break and comes back up' : 'Nothing down off the break'
    return { ...base, pos, broken: true, turn: again ? by : other(by), says }
  }

  /* fouls */
  let groups = l.groups ?? null
  const mine = groups?.[by]
  const firstTouch = out.events.find((e) => e.k === 'ball' && e.a === 0)
  const railAfter = !!firstTouch && (potted.some((n) => n !== 0) || out.events.some((e) => e.k === 'cushion' && e.t >= firstTouch.t))
  let foul: string | null = null
  if (scratch) foul = `${who} scratches`
  else if (out.first === null) foul = `${who} misses everything`
  else if (!eightUp && out.first === 8) foul = `${who} hits the 8 first`
  else if (groups && !eightUp && groupOf(out.first) !== mine) foul = `${who} hits ${groupName(groups[other(by)]).toLowerCase()} first`
  else if (eightUp && out.first !== 8) foul = `${who} misses the 8`
  else if (!railAfter) foul = `${who}: nothing reaches a cushion`

  /* the 8 */
  if (eight) {
    const pocket = out.events.find((e) => e.k === 'pot' && e.a === 8)
    const into = pocket && pocket.k === 'pot' ? pocket.pocket : -1
    let why: string
    let won = false
    if (!eightUp) why = `${who} pots the 8 too soon`
    else if (scratch) why = `${who} scratches on the 8`
    else if (foul) why = `${foul} and the 8 goes down`
    else if (into !== play.call) why = `${who} pots the 8 in the wrong pocket`
    else ((why = `${who} pots the 8`), (won = true))
    const winner = won ? by : other(by)
    const scores = { ...l.scores }
    scores[`s${winner}`]++
    return { ...base, pos, says: why, groups, scores, result: { winner, why }, history: [...(l.history ?? []), { winner, why }] }
  }

  if (foul) return { ...base, pos, groups, turn: other(by), inHand: 'anywhere', foul: true, says: `${foul} · ball in hand` }

  /* a clean shot: an open table goes to whoever pots only one kind */
  if (!groups && objects.length) {
    const kinds = new Set(objects.map((n) => groupOf(n)))
    if (kinds.size === 1) {
      const g = groupOf(objects[0]) as Group
      const otherG: Group = g === 'solid' ? 'stripe' : 'solid'
      groups = by === 0 ? [g, otherG] : [otherG, g]
    }
  }
  const nowMine = groups?.[by]
  const ownPotted = nowMine ? objects.filter((n) => groupOf(n) === nowMine).length : objects.length
  const again = ownPotted > 0
  let says: string
  if (!l.groups && groups) says = `${who} takes ${groupName(groups[by]).toLowerCase()}`
  else if (ownPotted) says = ownPotted === 1 ? `${who} pots one` : `${who} pots ${ownPotted}`
  else if (objects.length) says = `${who} pots one of theirs`
  else says = `${who} misses`
  return { ...base, pos, says, groups, turn: again ? by : other(by) }
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
