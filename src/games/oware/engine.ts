import type { Seat } from '../../lobby/rooms'

/**
 * Oware (Abapa rules). 12 pits, 4 seeds each. Seat 0 owns pits 0–5, seat 1 owns 6–11; sowing runs
 * up the indices (counter-clockwise round the board), so 5 → 6 crosses to seat 1's side.
 */
export const PITS = 12
export const SEEDS = 48
export const TO_WIN = 25
/** Moves in a row (both players) with nothing captured before the game is called — each keeps their own side. */
export const STALL = 100

export const owner = (pit: number): Seat => (pit < 6 ? 0 : 1)
export const sideOf = (seat: Seat) => [0, 1, 2, 3, 4, 5].map((k) => k + seat * 6)
const sum = (pits: number[], seat: Seat) => sideOf(seat).reduce((n, i) => n + pits[i], 0)

export interface Live {
  pits: number[]
  /** seeds each seat has captured */
  captured: [number, number]
  turn: Seat
  starter: Seat
  moves: number
  /** moves since the last capture (for calling a stalled game) */
  quiet: number
  /** the last move, so both screens can replay the sowing */
  /** (the database drops empty arrays, so read `took` as `took ?? []`) */
  last?: { pit: number; seat: Seat; before: number[]; took?: number[] }
  /** why the game ended: someone reached 25, the mover couldn't feed, or it stalled */
  result?: { winner: Seat | -1; reason: 'score' | 'starved' | 'stall' }
}

export function freshLive(starter: Seat): Live {
  return { pits: Array(PITS).fill(4), captured: [0, 0], turn: starter, starter, moves: 0, quiet: 0 }
}

/** The pits seeds drop into, in order. A pit of 12+ laps the board and skips the pit it came from. */
export function sowPath(pit: number, count: number): number[] {
  const out: number[] = []
  let slot = pit
  while (out.length < count) {
    slot = (slot + 1) % PITS
    if (slot !== pit) out.push(slot)
  }
  return out
}

/** Sow from a pit, then work out the capture. Pure; doesn't check whose turn it is. */
export function sow(pits: number[], pit: number, seat: Seat): { pits: number[]; took: number[]; seeds: number } {
  const p = [...pits]
  const path = sowPath(pit, p[pit])
  p[pit] = 0
  for (const s of path) p[s]++

  // capture backwards from the last seed through the opponent's pits holding 2 or 3
  const took: number[] = []
  let slot = path[path.length - 1]
  while (owner(slot) !== seat && (p[slot] === 2 || p[slot] === 3)) {
    took.push(slot)
    slot = (slot + PITS - 1) % PITS
  }
  // grand slam: a capture that would take every seed the opponent has is forfeited
  const other = (1 - seat) as Seat
  const left = sum(p, other) - took.reduce((n, s) => n + p[s], 0)
  if (took.length && left === 0) return { pits: p, took: [], seeds: 0 }
  let seeds = 0
  for (const s of took) {
    seeds += p[s]
    p[s] = 0
  }
  return { pits: p, took, seeds }
}

/**
 * Pits this seat may sow from. If the opponent has no seeds you must give them some — moves that
 * don't are off the table (if none can, the game ends; see play()).
 */
export function legalMoves(pits: number[], seat: Seat): number[] {
  const mine = sideOf(seat).filter((i) => pits[i] > 0)
  const other = (1 - seat) as Seat
  if (sum(pits, other) > 0) return mine
  return mine.filter((i) => sum(sow(pits, i, seat).pits, other) > 0)
}

/** One move — a pure function of the position, used inside the database transaction. */
export function play(live: Live, seat: Seat, pit: number): Live | undefined {
  if (live.result || live.turn !== seat || !legalMoves(live.pits, seat).includes(pit)) return undefined
  const { pits, took, seeds } = sow(live.pits, pit, seat)
  const captured: [number, number] = [...live.captured]
  captured[seat] += seeds
  const other = (1 - seat) as Seat
  const next: Live = {
    ...live,
    pits,
    captured,
    turn: other,
    moves: live.moves + 1,
    quiet: seeds ? 0 : live.quiet + 1,
    last: { pit, seat, before: live.pits, took },
  }
  delete next.result

  const winner = (): Seat | -1 => (captured[0] === captured[1] ? -1 : captured[0] > captured[1] ? 0 : 1)
  if (captured[seat] >= TO_WIN) {
    next.result = { winner: seat, reason: 'score' }
  } else if (!legalMoves(pits, other).length || next.quiet >= STALL) {
    // the next player can't move (or nobody can make progress): each side keeps the seeds on it.
    // The seeds stay drawn in their pits so the final board still shows where they were.
    const stalled = next.quiet >= STALL && legalMoves(pits, other).length > 0
    for (const s of [0, 1] as Seat[]) captured[s] += sum(pits, s)
    next.result = { winner: winner(), reason: stalled ? 'stall' : 'starved' }
  }
  return next
}

