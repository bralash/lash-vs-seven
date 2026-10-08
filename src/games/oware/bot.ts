import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { legalMoves, play, sideOf, type Live } from './engine'
import type { OwareState } from './OwareMatch'

/** Moves Ops looks ahead, and how long Hard may think while it deepens. */
const DEPTH: Record<Level, number> = { easy: 1, medium: 4, hard: 12 }
const BUDGET_MS = 140
const SLIP: Record<Level, number> = { easy: 0.3, medium: 0.08, hard: 0 }

const WIN = 100000

/** A feel for the position from `seat`'s side: seeds captured, plus a little for seeds kept on your side (moves to come). */
function judge(live: Live, seat: Seat): number {
  const other = (1 - seat) as Seat
  const side = (s: Seat) => sideOf(s).reduce((n, i) => n + live.pits[i], 0)
  return 10 * (live.captured[seat] - live.captured[other]) + (side(seat) - side(other))
}

class OutOfTime extends Error {}

function search(live: Live, seat: Seat, depth: number, alpha: number, beta: number, deadline: number): number {
  if (live.result) {
    const w = live.result.winner
    return w === -1 ? 0 : w === seat ? WIN + depth : -WIN - depth
  }
  if (depth === 0) return judge(live, seat)
  if (performance.now() > deadline) throw new OutOfTime()
  const maxing = live.turn === seat
  let best = maxing ? -Infinity : Infinity
  for (const pit of legalMoves(live.pits, live.turn)) {
    const v = search(play(live, live.turn, pit)!, seat, depth - 1, alpha, beta, deadline)
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

/** Every pit tied for the best result, deepening while there's time (Hard) or to the level's depth. */
export function bestPits(live: Live, seat: Seat, level: Level): number[] {
  const moves = legalMoves(live.pits, seat)
  if (moves.length === 1) return moves
  const deadline = performance.now() + BUDGET_MS
  let best = moves
  for (let depth = 1; depth <= DEPTH[level]; depth++) {
    try {
      const scored = moves.map((pit) => ({ pit, v: search(play(live, seat, pit)!, seat, depth - 1, -Infinity, Infinity, deadline) }))
      const top = Math.max(...scored.map((x) => x.v))
      best = scored.filter((x) => x.v === top).map((x) => x.pit)
      if (Math.abs(top) >= WIN) break // the result is settled either way
    } catch (e) {
      if (e instanceof OutOfTime) break
      throw e
    }
  }
  return best
}

export const owareBrain: Brain = (state, level) => {
  const live = (state as unknown as OwareState).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const moves = legalMoves(live.pits, BOT_SEAT)
  if (!moves.length) return null
  const pit = Math.random() < SLIP[level] ? pick(moves) : pick(bestPits(live, BOT_SEAT, level))
  return (cur: Live) => play(cur, BOT_SEAT, pit)
}

/** How the game looks to Ops, for her reactions: seeds captured and seeds in play, and big captures. */
export const owareSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as OwareState).live
    return !live || live.result ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as OwareState).live
    return !live || live.result ? null : squash(judge(live, BOT_SEAT), 80)
  },
  ended: (state) => {
    const r = (state as unknown as OwareState).live?.result
    return r ? { winner: r.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = (prev as unknown as OwareState).live?.captured
    const b = (next as unknown as OwareState).live?.captured
    if (!a || !b) return null
    // a seed or two is everyday; three or more is worth a word
    if (b[BOT_SEAT] - a[BOT_SEAT] >= 3) return 'took'
    if (b[0] - a[0] >= 3) return 'lost'
    return null
  },
}
