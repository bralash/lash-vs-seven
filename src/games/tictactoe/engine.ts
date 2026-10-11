import type { Seat } from '../../lobby/rooms'

/** Board as a 9-char string, row by row: '.' empty, '0' seat 0 (X), '1' seat 1 (O). */
export const EMPTY = '.........'
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
]
/** Pause on a finished game before the next board is dealt. */
export const RESULT_MS = 1800
export const MARK = ['X', 'O'] as const

export interface Result {
  /** -1 = draw */
  winner: Seat | -1
  line?: number[]
}

export interface Live {
  board: string
  turn: Seat
  /** who opened this game — alternates every game */
  starter: Seat
  game: number
  scores: { s0: number; s1: number }
  /** index of the last mark placed, -1 for none */
  last: number
  result?: Result
  /** games drawn in a row so far this series (absent = none; older rooms never had it) */
  draws?: number
  /** set once a series has had three draws in a row (Iron wall) */
  wall?: true
}

export function outcome(board: string): Result | null {
  for (const line of LINES) {
    const [a, b, c] = line
    if (board[a] !== '.' && board[a] === board[b] && board[a] === board[c]) return { winner: Number(board[a]) as Seat, line }
  }
  return board.includes('.') ? null : { winner: -1 }
}

export function freshLive(starter: Seat, game: number, scores = { s0: 0, s1: 0 }): Live {
  return { board: EMPTY, turn: starter, starter, game, scores, last: -1 }
}

/** The move as a pure function of the position — used inside the database transaction. */
export function play(live: Live, seat: Seat, cell: number): Live | undefined {
  if (live.result || live.turn !== seat || live.board[cell] !== '.') return undefined
  const board = live.board.slice(0, cell) + String(seat) + live.board.slice(cell + 1)
  const result = outcome(board)
  const scores = { ...live.scores }
  if (result && result.winner !== -1) scores[`s${result.winner}`]++
  const { draws: _d, ...rest } = live
  const out: Live = { ...rest, board, last: cell, turn: (1 - seat) as Seat, scores, ...(result ? { result } : {}) }
  // a draw extends the run of draws, a win ends it; a game still going leaves it as it was
  const draws = result ? (result.winner === -1 ? (live.draws ?? 0) + 1 : 0) : live.draws ?? 0
  if (draws) out.draws = draws
  if (draws >= 3) out.wall = true
  return out
}

/** Next game in the series: clear the board, other player opens. Only applies once per finished game. */
export function next(live: Live, finishedGame: number): Live | undefined {
  if (!live.result || live.game !== finishedGame) return undefined
  const starter = (1 - live.starter) as Seat
  // the draw run and Iron wall carry over from game to game within the series
  return { ...freshLive(starter, live.game + 1, live.scores), ...(live.draws ? { draws: live.draws } : {}), ...(live.wall ? { wall: true as const } : {}) }
}
