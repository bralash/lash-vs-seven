import type { Seat } from '../../lobby/rooms'

export const N = 8
/** Pause on the finished board before the results take over. */
export const RESULT_MS = 2400

/** Board as a 64-char string, row by row from the top: '.' empty, '0' / '1' that seat's disc. */
export const START = (() => {
  const b = '.'.repeat(N * N).split('')
  b[27] = '1'
  b[36] = '1'
  b[28] = '0'
  b[35] = '0'
  return b.join('')
})()

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
]

/** Discs a move at i would flip for seat (empty if the move is illegal). Ordered outward, line by line. */
export function flips(board: string, seat: Seat, i: number): number[] {
  if (board[i] !== '.') return []
  const me = String(seat)
  const r0 = Math.floor(i / N)
  const c0 = i % N
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const run: number[] = []
    let r = r0 + dr
    let c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] !== '.' && board[r * N + c] !== me) {
      run.push(r * N + c)
      r += dr
      c += dc
    }
    if (run.length && r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === me) out.push(...run)
  }
  return out
}

export function legalMoves(board: string, seat: Seat): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) if (flips(board, seat, i).length) out.push(i)
  return out
}

export const count = (board: string, seat: Seat) => board.split('').filter((v) => v === String(seat)).length

export interface Live {
  board: string
  turn: Seat
  starter: Seat
  /** last disc placed, -1 for none */
  last: number
  /** discs the last move flipped */
  flipped?: number[]
  /** set when a player had no move and was skipped — that seat */
  passed?: Seat
  result?: { winner: Seat | -1 }
}

export function freshLive(starter: Seat): Live {
  // whoever starts plays the side that moves first from the standard position
  const board = starter === 0 ? START : START.replace(/[01]/g, (v) => (v === '0' ? '1' : '0'))
  return { board, turn: starter, starter, last: -1 }
}

/**
 * Place a disc — a pure function of the position, used inside the database transaction.
 * If the other player then has no move they're skipped; if neither can move the game ends.
 */
export function play(live: Live, seat: Seat, i: number): Live | undefined {
  if (live.result || live.turn !== seat) return undefined
  const f = flips(live.board, seat, i)
  if (!f.length) return undefined
  const b = live.board.split('')
  b[i] = String(seat)
  for (const k of f) b[k] = String(seat)
  const board = b.join('')
  const other = (1 - seat) as Seat

  const { passed: _p, flipped: _f, ...rest } = live
  const next: Live = { ...rest, board, last: i, flipped: f, turn: other }
  if (!legalMoves(board, other).length) {
    if (legalMoves(board, seat).length) {
      next.turn = seat
      next.passed = other
    } else {
      const a = count(board, 0)
      const z = count(board, 1)
      next.result = { winner: a === z ? -1 : a > z ? 0 : 1 }
    }
  }
  return next
}
