import type { Seat } from '../../lobby/rooms'

/**
 * Quoridor on a 9×9 board. Orange (seat 0) starts in the middle of the bottom row and races for
 * the top row; blue starts at the top and races for the bottom. On your turn, either move your pawn
 * one square or place one of your 10 walls. A wall is two squares long, sits in the grooves
 * between squares, can't cross or overlap another, and may never cut a player off from their goal.
 *
 * Squares are numbered row by row (0 = top left). A wall is named by the square at its top-left
 * end (row and column 0–7) and which way it runs: a horizontal wall runs along the bottom of that
 * square and the one to its right; a vertical one down the right side of that square and the one
 * below it.
 */
export const N = 9
export const WALLS = 10
export const RESULT_MS = 2200

export const START: [number, number] = [8 * N + 4, 4]
const GOAL_ROW: [number, number] = [0, N - 1]

/** A placed wall: owner, which way it runs, and its anchor (0–63). Kept as one number for the database. */
export interface Wall {
  seat: Seat
  down: boolean
  at: number
}
export const wallCode = (w: Wall) => w.seat * 128 + (w.down ? 64 : 0) + w.at
export const wallOf = (code: number): Wall => ({ seat: (code >= 128 ? 1 : 0) as Seat, down: code % 128 >= 64, at: code % 64 })

export interface Live {
  starter: Seat
  turn: Seat
  /** each pawn's square, by seat */
  pos: [number, number]
  /** walls each player has left */
  left: [number, number]
  /** every wall on the board, as wallCode (the database drops empty arrays — read with `?? []`) */
  walls?: number[]
  /** pawn moves made, by seat */
  moves: [number, number]
  /** the last thing done, for the board to show */
  last?: { seat: Seat; from?: number; to?: number; wall?: number }
  result?: { winner: Seat }
}

export function freshLive(starter: Seat): Live {
  return { starter, turn: starter, pos: [...START], left: [WALLS, WALLS], moves: [0, 0] }
}

export const other = (s: Seat) => (1 - s) as Seat
export const rowOf = (i: number) => Math.floor(i / N)
export const colOf = (i: number) => i % N
export const goalRow = (s: Seat) => GOAL_ROW[s]

/* ── Walls ──────────────────────────────────────────────────────────── */

/**
 * Which moves the walls block, as two sets of squares: `south` holds square i when the step from i
 * down to i + N is blocked; `east` when the step from i right to i + 1 is.
 */
export interface Blocks {
  south: Uint8Array
  east: Uint8Array
}

export function blocksOf(walls: number[]): Blocks {
  const south = new Uint8Array(N * N)
  const east = new Uint8Array(N * N)
  for (const code of walls) addBlock({ south, east }, wallOf(code))
  return { south, east }
}

function addBlock(b: Blocks, w: Wall) {
  const r = Math.floor(w.at / 8)
  const c = w.at % 8
  const i = r * N + c
  if (w.down) {
    b.east[i] = 1
    b.east[i + N] = 1
  } else {
    b.south[i] = 1
    b.south[i + 1] = 1
  }
}

/** Is the step between two neighbouring squares blocked by a wall? */
export function blocked(b: Blocks, from: number, to: number): boolean {
  const d = to - from
  if (d === N) return !!b.south[from]
  if (d === -N) return !!b.south[to]
  if (d === 1) return !!b.east[from]
  if (d === -1) return !!b.east[to]
  return true
}

const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: N * N }, (_, i) => {
  const r = rowOf(i)
  const c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(i - N)
  if (r < N - 1) out.push(i + N)
  if (c > 0) out.push(i - 1)
  if (c < N - 1) out.push(i + 1)
  return out
})
/** The squares one step from i, inside the board. */
export const steps = (i: number): readonly number[] => NEIGHBOURS[i]

/** How many steps every square is from a goal row, walls counted, pawns ignored (-1: no way there). */
export function distances(b: Blocks, seat: Seat): Int16Array {
  const dist = new Int16Array(N * N).fill(-1)
  const queue = new Int16Array(N * N)
  let head = 0
  let tail = 0
  const g = goalRow(seat) * N
  for (let c = 0; c < N; c++) {
    dist[g + c] = 0
    queue[tail++] = g + c
  }
  while (head < tail) {
    const i = queue[head++]
    for (const j of steps(i)) {
      if (dist[j] !== -1 || blocked(b, i, j)) continue
      dist[j] = dist[i] + 1
      queue[tail++] = j
    }
  }
  return dist
}

/** Why a wall can't go here, or null if it can. */
export function wallProblem(live: Live, seat: Seat, down: boolean, at: number): 'none left' | 'off' | 'overlap' | 'sealed' | null {
  if (live.left[seat] <= 0) return 'none left'
  if (!Number.isInteger(at) || at < 0 || at > 63) return 'off'
  const walls = live.walls ?? []
  if (overlaps(walls, down, at)) return 'overlap'
  const b = blocksOf(walls)
  addBlock(b, { seat, down, at })
  for (const s of [0, 1] as Seat[]) if (distances(b, s)[live.pos[s]] === -1) return 'sealed'
  return null
}

/** Would a wall here cross or overlap one already down? */
export function overlaps(walls: number[], down: boolean, at: number): boolean {
  for (const code of walls) {
    const w = wallOf(code)
    if (w.at === at) return true // the same spot either way, or crossing at the middle
    if (w.down === down) {
      // two squares long: the same line one square along overlaps too
      const r = Math.floor(at / 8)
      const c = at % 8
      const wr = Math.floor(w.at / 8)
      const wc = w.at % 8
      if (down ? wc === c && Math.abs(wr - r) === 1 : wr === r && Math.abs(wc - c) === 1) return true
    }
  }
  return false
}

/* ── Pawns ──────────────────────────────────────────────────────────── */

/**
 * Where the pawn on turn can go: one step any way a wall allows. Facing the other pawn, it jumps
 * straight over; if a wall or the edge stops that, it may go to either side of the other pawn.
 */
export function pawnMoves(pos: [number, number], seat: Seat, b: Blocks): number[] {
  const me = pos[seat]
  const them = pos[other(seat)]
  const out: number[] = []
  for (const j of steps(me)) {
    if (blocked(b, me, j)) continue
    if (j !== them) {
      out.push(j)
      continue
    }
    const d = j - me
    const beyond = j + d
    const straight = steps(j).includes(beyond) && !blocked(b, j, beyond)
    if (straight) out.push(beyond)
    else {
      for (const k of steps(j)) {
        if (k === me || k === beyond || blocked(b, j, k)) continue
        out.push(k)
      }
    }
  }
  return out
}

export const legalMoves = (live: Live) => pawnMoves(live.pos, live.turn, blocksOf(live.walls ?? []))

/* ── Moves ──────────────────────────────────────────────────────────── */

export function move(live: Live, seat: Seat, to: number): Live | undefined {
  if (live.result || live.turn !== seat || !legalMoves(live).includes(to)) return undefined
  const pos = [...live.pos] as [number, number]
  const from = pos[seat]
  pos[seat] = to
  const moves = [...(live.moves ?? [0, 0])] as [number, number]
  moves[seat]++
  const next: Live = { ...live, pos, moves, turn: other(seat), last: { seat, from, to } }
  if (rowOf(to) === goalRow(seat)) next.result = { winner: seat }
  return next
}

export function placeWall(live: Live, seat: Seat, down: boolean, at: number): Live | undefined {
  if (live.result || live.turn !== seat || wallProblem(live, seat, down, at)) return undefined
  const code = wallCode({ seat, down, at })
  const left = [...live.left] as [number, number]
  left[seat]--
  return { ...live, walls: [...(live.walls ?? []), code], left, turn: other(seat), last: { seat, wall: code } }
}

/** Steps a pawn still needs to reach its goal, walls counted. */
export function pathLeft(live: Live, seat: Seat): number {
  return distances(blocksOf(live.walls ?? []), seat)[live.pos[seat]]
}

/** The squares of one shortest way home for a pawn (not counting where it stands). */
export function pathOf(live: Live, seat: Seat): number[] {
  const b = blocksOf(live.walls ?? [])
  const dist = distances(b, seat)
  const out: number[] = []
  let i = live.pos[seat]
  while (dist[i] > 0) {
    const next = steps(i).find((j) => !blocked(b, i, j) && dist[j] === dist[i] - 1)
    if (next === undefined) break
    out.push(next)
    i = next
  }
  return out
}

export const wallsUsed = (live: Live, s: Seat) => WALLS - live.left[s]
