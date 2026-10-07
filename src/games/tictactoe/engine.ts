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
  return { ...live, board, last: cell, turn: (1 - seat) as Seat, scores, ...(result ? { result } : {}) }
}

/** Next game in the series: clear the board, other player opens. Only applies once per finished game. */
export function next(live: Live, finishedGame: number): Live | undefined {
  if (!live.result || live.game !== finishedGame) return undefined
  const starter = (1 - live.starter) as Seat
  return freshLive(starter, live.game + 1, live.scores)
}
