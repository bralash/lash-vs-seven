import type { Seat } from '../../lobby/rooms'

/**
 * Checkers, with the legacy site's rules: 8×8, pieces on the dark squares, men step forward but
 * capture in all four directions, kings fly (any distance, capturing from afar), captures are
 * mandatory and chain, and crowning ends the turn.
 *
 * Board: 64-char string, row by row from the top. '.' empty · '0'/'1' a man of that seat ·
 * '2'/'3' a king of seat 0/1. Seat 0 (orange) starts at the bottom and moves up.
 */
export const N = 8
export const RESULT_MS = 2200
/** turns in a row with only kings moving and nothing captured before the game is a draw (25 each) */
export const QUIET_LIMIT = 50

export const START = (() => {
  const b: string[] = []
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) b.push((r + c) % 2 === 1 ? (r < 3 ? '1' : r > 4 ? '0' : '.') : '.')
  return b.join('')
})()

export const ownerOf = (v: string): Seat | null => (v === '.' ? null : ((Number(v) % 2) as Seat))
export const isKing = (v: string) => v === '2' || v === '3'
export const count = (board: string, seat: Seat) => board.split('').filter((v) => ownerOf(v) === seat).length
export const kings = (board: string, seat: Seat) => board.split('').filter((v) => isKing(v) && ownerOf(v) === seat).length

export interface Step {
  from: number
  to: number
  /** the square of the piece jumped, if this step captures */
  captured?: number
}

const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]
const at = (r: number, c: number) => (r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1)

/** Every step the piece on `from` can make, captures and plain moves alike. */
export function pieceSteps(board: string, from: number): Step[] {
  const v = board[from]
  const me = ownerOf(v)
  if (me === null) return []
  const r0 = Math.floor(from / N)
  const c0 = from % N
  const out: Step[] = []
  const forward = me === 0 ? -1 : 1
  for (const [dr, dc] of DIAG) {
    if (isKing(v)) {
      // flying king: slide over empties; after exactly one enemy piece, every empty square beyond is a landing
      let r = r0 + dr
      let c = c0 + dc
      let jumped = -1
      while (at(r, c) >= 0) {
        const i = at(r, c)
        const sq = board[i]
        if (sq === '.') out.push(jumped < 0 ? { from, to: i } : { from, to: i, captured: jumped })
        else if (ownerOf(sq) !== me && jumped < 0) jumped = i
        else break
        r += dr
        c += dc
      }
    } else {
      const i = at(r0 + dr, c0 + dc)
      if (i < 0) continue
      if (board[i] === '.') {
        if (dr === forward) out.push({ from, to: i })
      } else if (ownerOf(board[i]) !== me) {
        // men capture backwards too
        const j = at(r0 + 2 * dr, c0 + 2 * dc)
        if (j >= 0 && board[j] === '.') out.push({ from, to: j, captured: i })
      }
    }
  }
  return out
}

export interface Live {
  board: string
  turn: Seat
  starter: Seat
  /** the piece mid-way through a multi-jump: only it may move, and only by capturing */
  chain?: number
  /** the last step played, for highlighting and the slide animation */
  last?: Step
  /** turns in a row with only kings moving and nothing captured */
  quiet: number
  result?: { winner: Seat | -1 }
}

/** Legal steps for whoever's turn it is: the chain piece's captures, else all captures, else all moves. */
export function legalSteps(live: Pick<Live, 'board' | 'turn' | 'chain'>): Step[] {
  if (live.chain !== undefined) return pieceSteps(live.board, live.chain).filter((s) => s.captured !== undefined)
  const all: Step[] = []
  for (let i = 0; i < N * N; i++) if (ownerOf(live.board[i]) === live.turn) all.push(...pieceSteps(live.board, i))
  const captures = all.filter((s) => s.captured !== undefined)
  return captures.length ? captures : all
}

export function freshLive(starter: Seat): Live {
  return { board: START, turn: starter, starter, quiet: 0 }
}

/** Play one step — a pure function of the position, used inside the database transaction. */
export function play(live: Live, seat: Seat, from: number, to: number): Live | undefined {
  if (live.result || live.turn !== seat) return undefined
  const step = legalSteps(live).find((s) => s.from === from && s.to === to)
  if (!step) return undefined

  const b = live.board.split('')
  let piece = b[from]
  b[from] = '.'
  if (step.captured !== undefined) b[step.captured] = '.'
  const row = Math.floor(to / N)
  const crowned = !isKing(piece) && ((seat === 0 && row === 0) || (seat === 1 && row === N - 1))
  if (crowned) piece = String(seat + 2)
  b[to] = piece
  const board = b.join('')

  const { chain: _c, ...rest } = live
  const next: Live = { ...rest, board, last: step }
  const quiet = step.captured === undefined && isKing(live.board[from]) ? (live.chain === undefined ? live.quiet + 1 : live.quiet) : 0

  // keep jumping: same piece, same turn (crowning ends the turn, as in the classic game)
  if (step.captured !== undefined && !crowned && pieceSteps(board, to).some((s) => s.captured !== undefined)) {
    return { ...next, chain: to, quiet: 0 }
  }

  const other = (1 - seat) as Seat
  next.turn = other
  next.quiet = quiet
  if (count(board, other) === 0 || legalSteps({ board, turn: other }).length === 0) next.result = { winner: seat }
  else if (quiet >= QUIET_LIMIT) next.result = { winner: -1 }
  return next
}
