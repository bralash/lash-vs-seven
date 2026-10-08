import { BOT_SEAT, pick, type Brain, type Level, type OpsSense } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { COLS, LINES, dropRow, idx, outcome, play, type Live } from './engine'
import type { C4State } from './C4Match'

/** How many moves ahead Ops looks, and how often it just drops anywhere instead. */
const DEPTH: Record<Level, number> = { easy: 1, medium: 4, hard: 6 }
const SLIP: Record<Level, number> = { easy: 0.3, medium: 0.08, hard: 0 }
// centre columns first: better moves searched first means more of the tree gets cut
const ORDER = [3, 2, 4, 1, 5, 0, 6]
const WIN = 1_000_000

const drop = (board: string, col: number, seat: Seat) => {
  const r = dropRow(board, col)
  if (r < 0) return null
  const i = idx(r, col)
  return board.slice(0, i) + seat + board.slice(i + 1)
}

/** A rough feel for a position from `seat`'s side: open threes and twos, and the centre column. */
function judge(board: string, seat: Seat): number {
  const me = String(seat)
  const them = String(1 - seat)
  let score = 0
  for (const line of LINES) {
    let m = 0
    let t = 0
    for (const i of line) {
      if (board[i] === me) m++
      else if (board[i] === them) t++
    }
    if (m && t) continue
    if (m === 3) score += 50
    else if (m === 2) score += 8
    if (t === 3) score -= 60
    else if (t === 2) score -= 8
  }
  for (let r = 0; r < 6; r++) if (board[idx(r, 3)] === me) score += 6
  return score
}

/** Negamax with alpha-beta: the value of `board` for `turn`, who is about to move. */
function negamax(board: string, turn: Seat, depth: number, alpha: number, beta: number): number {
  const r = outcome(board)
  // the last mover won: bad for whoever is to move, and less bad the later it happens
  if (r) return r.winner === -1 ? 0 : -(WIN + depth)
  if (depth === 0) return judge(board, turn)
  let best = -Infinity
  for (const c of ORDER) {
    const next = drop(board, c, turn)
    if (!next) continue
    best = Math.max(best, -negamax(next, (1 - turn) as Seat, depth - 1, -beta, -alpha))
    alpha = Math.max(alpha, best)
    if (alpha >= beta) break
  }
  return best
}

/** The columns tied for the best value at this depth. */
export function bestColumns(board: string, seat: Seat, depth: number): number[] {
  const scored: { c: number; s: number }[] = []
  // only columns at least as good as the best so far need an exact value (one below keeps ties)
  let top = -Infinity
  for (const c of ORDER) {
    const next = drop(board, c, seat)
    if (!next) continue
    const s = -negamax(next, (1 - seat) as Seat, depth - 1, -Infinity, -(top - 1))
    scored.push({ c, s })
    top = Math.max(top, s)
  }
  return scored.filter((x) => x.s === top).map((x) => x.c)
}

export const c4Brain: Brain = (state, level) => {
  const live = (state as unknown as C4State).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(live.board, c) >= 0)
  const col = Math.random() < SLIP[level] ? pick(open) : pick(bestColumns(live.board, BOT_SEAT, DEPTH[level]))
  return (cur: Live) => play(cur, BOT_SEAT, col)
}

/** How the series looks to Ops, for her reactions: a 4-ply look at the board, squashed to −1…1. */
export const c4Sense: OpsSense = {
  key: (state) => {
    const st = state as unknown as C4State
    return `${st.match}:${st.live?.game}:${st.live?.board}`
  },
  turn: (state) => {
    const live = (state as unknown as C4State).live
    return !live || live.result ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as C4State).live
    if (!live || live.result) return null
    const v = negamax(live.board, live.turn, 4, -Infinity, Infinity)
    const mine = live.turn === BOT_SEAT ? v : -v
    return Math.abs(mine) >= WIN ? Math.sign(mine) : Math.tanh(mine / 150)
  },
  ended: (state) => {
    const st = state as unknown as C4State
    const r = st.live?.result
    if (!r) return null
    return { winner: r.winner, final: st.live.scores.s0 >= st.target || st.live.scores.s1 >= st.target }
  },
}
