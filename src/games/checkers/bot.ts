import { BOT_SEAT, pick, type Brain, type Level } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { N, isKing, legalSteps, ownerOf, play, type Live, type Step } from './engine'
import type { CheckersState } from './CheckersMatch'

/** Steps Ops looks ahead (a chain of jumps doesn't use any up), and how long Hard may think. */
const DEPTH: Record<Level, number> = { easy: 1, medium: 4, hard: 10 }
const BUDGET_MS = 140
const SLIP: Record<Level, number> = { easy: 0.3, medium: 0.08, hard: 0 }

const WIN = 100000

/** A feel for the board from `seat`'s side: pieces (kings fly, so they're worth a lot), men nearer crowning, the centre, a kept back row. */
function judge(board: string, seat: Seat): number {
  let s = 0
  for (let i = 0; i < N * N; i++) {
    const v = board[i]
    const who = ownerOf(v)
    if (who === null) continue
    const r = Math.floor(i / N)
    const c = i % N
    let w: number
    if (isKing(v)) w = 280
    else {
      const ahead = who === 0 ? N - 1 - r : r // rows travelled towards crowning
      w = 100 + ahead * 4 + ((who === 0 && r === N - 1) || (who === 1 && r === 0) ? 6 : 0)
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) w += 4
    s += who === seat ? w : -w
  }
  return s
}

class OutOfTime extends Error {}

/** Value of the position for `seat` (alpha-beta). The mover keeps the turn through a chain of jumps. */
function search(live: Live, seat: Seat, depth: number, alpha: number, beta: number, deadline: number): number {
  if (live.result) return live.result.winner === -1 ? 0 : live.result.winner === seat ? WIN + depth : -WIN - depth
  if (depth <= 0 && live.chain === undefined) return judge(live.board, seat)
  if (performance.now() > deadline) throw new OutOfTime()
  const steps = legalSteps(live)
  const maxing = live.turn === seat
  let best = maxing ? -Infinity : Infinity
  for (const s of order(steps)) {
    const next = play(live, live.turn, s.from, s.to)!
    // carrying on a chain is the same move, so it doesn't cost a step of look-ahead
    const v = search(next, seat, next.chain !== undefined ? depth : depth - 1, alpha, beta, deadline)
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

/** captures first, so the cut-offs come early */
const order = (steps: Step[]) => [...steps].sort((a, b) => Number(b.captured !== undefined) - Number(a.captured !== undefined))

/** Every step tied for the best result, deepening while there's time (Hard) or to the level's depth. */
export function bestSteps(live: Live, seat: Seat, level: Level): Step[] {
  const steps = legalSteps(live)
  if (steps.length === 1) return steps
  const deadline = performance.now() + BUDGET_MS
  let best = steps
  for (let depth = 1; depth <= DEPTH[level]; depth++) {
    try {
      const scored = steps.map((s) => {
        const next = play(live, seat, s.from, s.to)!
        return { s, v: search(next, seat, next.chain !== undefined ? depth : depth - 1, -Infinity, Infinity, deadline) }
      })
      const top = Math.max(...scored.map((x) => x.v))
      best = scored.filter((x) => x.v === top).map((x) => x.s)
      if (top >= WIN) break // a forced win: no need to look further
    } catch (e) {
      if (e instanceof OutOfTime) break
      throw e
    }
  }
  return best
}

export const checkersBrain: Brain = (state, level) => {
  const live = (state as unknown as CheckersState).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const steps = legalSteps(live)
  if (!steps.length) return null
  const s = Math.random() < SLIP[level] ? pick(steps) : pick(bestSteps(live, BOT_SEAT, level))
  return (cur: Live) => play(cur, BOT_SEAT, s.from, s.to)
}
