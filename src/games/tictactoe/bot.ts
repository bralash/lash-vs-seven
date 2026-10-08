import { BOT_SEAT, pick, type Brain, type Level, type OpsSense } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { EMPTY, outcome, play, type Live } from './engine'
import type { TttState } from './TttMatch'

/** How often Ops ignores its best move and plays anywhere. Hard never slips, so it can't be beaten. */
const SLIP: Record<Level, number> = { easy: 0.55, medium: 0.2, hard: 0 }

const free = (board: string) => [...board].flatMap((v, i) => (v === '.' ? [i] : []))

/** Score of the board for `seat`, with `turn` to move: +win (sooner is better), 0 draw, −loss. */
function search(board: string, turn: Seat, seat: Seat, depth: number): number {
  const r = outcome(board)
  if (r) return r.winner === -1 ? 0 : r.winner === seat ? 10 - depth : depth - 10
  const scores = free(board).map((i) => search(board.slice(0, i) + turn + board.slice(i + 1), (1 - turn) as Seat, seat, depth + 1))
  return turn === seat ? Math.max(...scores) : Math.min(...scores)
}

/** Every square tied for the best result (so Ops doesn't play the same game every time). */
export function bestMoves(board: string, seat: Seat): number[] {
  const scored = free(board).map((i) => ({ i, s: search(board.slice(0, i) + seat + board.slice(i + 1), (1 - seat) as Seat, seat, 1) }))
  const top = Math.max(...scored.map((x) => x.s))
  return scored.filter((x) => x.s === top).map((x) => x.i)
}

export const tttBrain: Brain = (state, level) => {
  const live = (state as unknown as TttState).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const cell = Math.random() < SLIP[level] ? pick(free(live.board)) : pick(bestMoves(live.board, BOT_SEAT))
  return (cur: Live) => play(cur, BOT_SEAT, cell)
}

/** How the series looks to Ops, for her reactions. With perfect play every game is a draw, so the standing is just won, drawn or lost. */
export const tttSense: OpsSense = {
  key: (state) => {
    const st = state as unknown as TttState
    return `${st.match}:${st.live?.game}:${st.live?.board}`
  },
  turn: (state) => {
    const live = (state as unknown as TttState).live
    return !live || live.result ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as TttState).live
    if (!live || live.result || live.board === EMPTY) return live && !live.result ? 0 : null
    return Math.sign(search(live.board, live.turn, BOT_SEAT, 0))
  },
  ended: (state) => {
    const st = state as unknown as TttState
    const r = st.live?.result
    if (!r) return null
    return { winner: r.winner, final: st.live.scores.s0 >= st.target || st.live.scores.s1 >= st.target }
  },
}
