import type { Seat } from '../../lobby/rooms'

export const ROWS = 6
export const COLS = 7
/** Board as a 42-char string, row by row from the top: '.' empty, '0' seat 0, '1' seat 1. */
export const EMPTY = '.'.repeat(ROWS * COLS)
/** Pause on a finished game before the next board is dealt. */
export const RESULT_MS = 2200

export const idx = (r: number, c: number) => r * COLS + c

/** Every run of four cells on the board (69 of them), each listed in order along the line. */
export const LINES: number[][] = (() => {
  const out: number[][] = []
  const dirs = [
    [0, 1], // across
    [1, 0], // down
    [1, 1], // diagonal ↘
    [1, -1], // diagonal ↙
  ]
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of dirs) {
        const er = r + dr * 3
        const ec = c + dc * 3
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue
        out.push([0, 1, 2, 3].map((k) => idx(r + dr * k, c + dc * k)))
      }
  return out
})()

export interface Result {
  /** -1 = draw (board full) */
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
  /** index of the last disc dropped, -1 for none */
  last: number
  result?: Result
}

/** Lowest empty row in a column, or -1 if the column is full. */
export function dropRow(board: string, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (board[idx(r, col)] === '.') return r
  return -1
}

export function outcome(board: string): Result | null {
  for (const line of LINES) {
    const v = board[line[0]]
    if (v !== '.' && line.every((i) => board[i] === v)) return { winner: Number(v) as Seat, line }
  }
  return board.includes('.') ? null : { winner: -1 }
}

export function freshLive(starter: Seat, game: number, scores = { s0: 0, s1: 0 }): Live {
  return { board: EMPTY, turn: starter, starter, game, scores, last: -1 }
}

/** Drop a disc — a pure function of the position, used inside the database transaction. */
export function play(live: Live, seat: Seat, col: number): Live | undefined {
  if (live.result || live.turn !== seat || col < 0 || col >= COLS) return undefined
  const row = dropRow(live.board, col)
  if (row < 0) return undefined
  const cell = idx(row, col)
  const board = live.board.slice(0, cell) + String(seat) + live.board.slice(cell + 1)
  const result = outcome(board)
  const scores = { ...live.scores }
  if (result && result.winner !== -1) scores[`s${result.winner}`]++
  return { ...live, board, last: cell, turn: (1 - seat) as Seat, scores, ...(result ? { result } : {}) }
}

/** Next game in the series: clear the board, other player opens. Only applies once per finished game. */
export function next(live: Live, finishedGame: number): Live | undefined {
  if (!live.result || live.game !== finishedGame) return undefined
  return freshLive((1 - live.starter) as Seat, live.game + 1, live.scores)
}
