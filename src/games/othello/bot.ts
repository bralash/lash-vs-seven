import { BOT_SEAT, pick, type Brain, type Level } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { N, count, flips, legalMoves, play, type Live } from './engine'
import type { OthelloState } from './OthelloMatch'

/** Moves Ops looks ahead; with this few empty squares left it plays the ending out exactly. */
const DEPTH: Record<Level, number> = { easy: 1, medium: 3, hard: 4 }
const EXACT: Record<Level, number> = { easy: 0, medium: 6, hard: 9 }
const SLIP: Record<Level, number> = { easy: 0.3, medium: 0.06, hard: 0 }

// how good each square is to own: corners can never be flipped back; the squares next to an empty
// corner hand it to the opponent
const W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]
// once a corner is taken, the squares beside it are no longer a liability
const NEAR: Record<number, number[]> = { 0: [1, 8, 9], 7: [6, 14, 15], 56: [48, 49, 57], 63: [54, 55, 62] }

function place(board: string, seat: Seat, i: number): string {
  const b = board.split('')
  b[i] = String(seat)
  for (const k of flips(board, seat, i)) b[k] = String(seat)
  return b.join('')
}

/** A feel for the position from `seat`'s side: square values, plus having more moves than them. */
function judge(board: string, seat: Seat): number {
  const me = String(seat)
  const other = (1 - seat) as Seat
  let s = 0
  for (let i = 0; i < N * N; i++) {
    if (board[i] === '.') continue
    let w = W[i]
    for (const [corner, near] of Object.entries(NEAR)) if (board[Number(corner)] !== '.' && near.includes(i)) w = 4
    s += board[i] === me ? w : -w
  }
  return s + 8 * (legalMoves(board, seat).length - legalMoves(board, other).length)
}

/** Value of the board for `seat` with `turn` to move (passes and the end handled like the real game). */
function search(board: string, turn: Seat, seat: Seat, depth: number, exact: boolean, alpha: number, beta: number): number {
  let moves = legalMoves(board, turn)
  if (!moves.length) {
    const other = (1 - turn) as Seat
    if (!legalMoves(board, other).length) {
      const d = count(board, seat) - count(board, (1 - seat) as Seat)
      return d * 1000 // a finished game outweighs any judgement
    }
    return search(board, other, seat, depth, exact, alpha, beta)
  }
  if (!exact && depth === 0) return judge(board, seat)
  // corners first, so the cut-offs come early
  moves = moves.sort((a, b) => W[b] - W[a])
  const maxing = turn === seat
  let best = maxing ? -Infinity : Infinity
  for (const i of moves) {
    const v = search(place(board, turn, i), (1 - turn) as Seat, seat, depth - 1, exact, alpha, beta)
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

export function bestSquares(board: string, seat: Seat, level: Level): number[] {
  const empty = board.split('').filter((v) => v === '.').length
  const exact = empty <= EXACT[level]
  const scored = legalMoves(board, seat).map((i) => ({
    i,
    s: search(place(board, seat, i), (1 - seat) as Seat, seat, DEPTH[level] - 1, exact, -Infinity, Infinity),
  }))
  const top = Math.max(...scored.map((x) => x.s))
  return scored.filter((x) => x.s === top).map((x) => x.i)
}

export const othelloBrain: Brain = (state, level) => {
  const live = (state as unknown as OthelloState).live
  if (!live || live.result || live.turn !== BOT_SEAT) return null
  const moves = legalMoves(live.board, BOT_SEAT)
  if (!moves.length) return null
  const i = Math.random() < SLIP[level] ? pick(moves) : pick(bestSquares(live.board, BOT_SEAT, level))
  return (cur: Live) => play(cur, BOT_SEAT, i)
}
