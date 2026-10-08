import { BOT_SEAT, pick, type Brain, type Level } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { N, blocked, blocksOf, distances, legalMoves, move, other, overlaps, pawnMoves, placeWall, steps, type Live } from './engine'
import type { QuoridorState } from './QuoridorMatch'

/**
 * Ops at Quoridor. Everything turns on one number: how many steps each pawn still needs, walls
 * counted. She likes positions where yours is long and hers is short, and keeps a few walls in hand.
 * The walls she considers are the ones that would cut across your shortest way home (on her own
 * side of the search, yours across hers), so she isn't weighing all 128 spots every time.
 *
 * Hard looks ahead with alpha-beta, deepening while it has time (140ms). Medium looks two moves
 * ahead (her move and your answer). Easy only looks at her own move, and slips now and then.
 */
const DEPTH: Record<Level, number> = { easy: 1, medium: 2, hard: 6 }
const SLIP: Record<Level, number> = { easy: 0.25, medium: 0.05, hard: 0 }
const BUDGET_MS = 140
const WIN = 10000

type Action = { to: number } | { down: boolean; at: number }

function apply(live: Live, a: Action): Live | undefined {
  return 'to' in a ? move(live, live.turn, a.to) : placeWall(live, live.turn, a.down, a.at)
}

/** How good the board is for `seat`: the other's steps left minus mine, plus a little for walls in hand. */
function judge(live: Live, seat: Seat): number {
  const b = blocksOf(live.walls ?? [])
  const mine = distances(b, seat)[live.pos[seat]]
  const theirs = distances(b, other(seat))[live.pos[other(seat)]]
  // it's worth about half a step to be the one moving
  const tempo = live.turn === seat ? 0.5 : -0.5
  return (theirs - mine + tempo) * 10 + (live.left[seat] - live.left[other(seat)]) * 1.5
}

/** The anchors of walls that would block a step from `a` to its neighbour `b`. */
function wallsAcross(a: number, b: number): { down: boolean; at: number }[] {
  const lo = Math.min(a, b)
  const r = Math.floor(lo / N)
  const c = lo % N
  const out: { down: boolean; at: number }[] = []
  if (Math.abs(a - b) === N) {
    // a step up or down: a horizontal wall under row r, covering column c (anchored at c or c-1)
    for (const cc of [c - 1, c]) if (cc >= 0 && cc <= 7 && r <= 7) out.push({ down: false, at: r * 8 + cc })
  } else {
    // a step sideways: a vertical wall right of column c, covering row r
    for (const rr of [r - 1, r]) if (rr >= 0 && rr <= 7 && c <= 7) out.push({ down: true, at: rr * 8 + c })
  }
  return out
}

/** What the player on turn might do: pawn moves first, then walls across the other's shortest ways home. */
function actions(live: Live): Action[] {
  const seat = live.turn
  const walls = live.walls ?? []
  const b = blocksOf(walls)
  // pawn steps first, the ones heading home before the rest
  const home = distances(b, seat)
  const out: Action[] = pawnMoves(live.pos, seat, b)
    .sort((x, y) => home[x] - home[y])
    .map((to) => ({ to }))
  if (live.left[seat] <= 0) return out
  const foe = other(seat)
  const dist = distances(b, foe)
  // every step on any shortest way home, from where their pawn stands
  const seen = new Set<string>()
  const frontier = [live.pos[foe]]
  const visited = new Set(frontier)
  while (frontier.length) {
    const i = frontier.shift()!
    for (const j of steps(i)) {
      if (blocked(b, i, j) || dist[j] !== dist[i] - 1) continue
      for (const w of wallsAcross(i, j)) {
        const k = `${w.down}:${w.at}`
        if (seen.has(k)) continue
        seen.add(k)
        // (one that would seal someone in is weeded out when it's tried)
        if (!overlaps(walls, w.down, w.at)) out.push(w)
      }
      if (!visited.has(j)) {
        visited.add(j)
        frontier.push(j)
      }
    }
  }
  return out
}

class OutOfTime extends Error {}

function search(live: Live, seat: Seat, depth: number, alpha: number, beta: number, deadline: number): number {
  if (live.result) return live.result.winner === seat ? WIN + depth : -WIN - depth
  if (depth <= 0) return judge(live, seat)
  if (performance.now() > deadline) throw new OutOfTime()
  const maxing = live.turn === seat
  let best = maxing ? -Infinity : Infinity
  for (const a of actions(live)) {
    const next = apply(live, a)
    if (!next) continue
    const v = search(next, seat, depth - 1, alpha, beta, deadline)
    if (maxing) {
      best = Math.max(best, v)
      alpha = Math.max(alpha, v)
    } else {
      best = Math.min(best, v)
      beta = Math.min(beta, v)
    }
    if (alpha >= beta) break
  }
  return best
}

/** The actions that score best for the player on turn, looking `depth` moves ahead. */
function bestAt(live: Live, depth: number, deadline: number): Action[] {
  const seat = live.turn
  let top = -Infinity
  let best: Action[] = []
  for (const a of actions(live)) {
    const next = apply(live, a)
    if (!next) continue
    const v = search(next, seat, depth - 1, -Infinity, Infinity, deadline)
    if (v > top) {
      top = v
      best = [a]
    } else if (v === top) best.push(a)
  }
  return best
}

export function choose(live: Live, level: Level): Action {
  const moves = legalMoves(live)
  if (Math.random() < SLIP[level]) {
    // a slip: any step at all
    return { to: pick(moves) }
  }
  // one step from home: take it
  const home = moves.find((to) => Math.floor(to / N) === (live.turn === 0 ? 0 : N - 1))
  if (home !== undefined) return { to: home }
  if (level !== 'hard') return pick(bestAt(live, DEPTH[level], Infinity))
  const deadline = performance.now() + BUDGET_MS
  let best = bestAt(live, 1, Infinity)
  for (let d = 2; d <= DEPTH.hard; d++) {
    try {
      best = bestAt(live, d, deadline)
    } catch (e) {
      if (e instanceof OutOfTime) break
      throw e
    }
  }
  // among equals, a pawn step beats spending a wall
  const steps = best.filter((a) => 'to' in a)
  return pick(steps.length ? steps : best)
}

export const quoridorBrain: Brain = (state, level) => {
  const live = (state as unknown as QuoridorState).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const a = choose(live, level)
  return (cur: Live) => apply(cur, a)
}

