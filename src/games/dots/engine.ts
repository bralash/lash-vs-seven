import type { Seat } from '../../lobby/rooms'

/**
 * A board of n×n boxes has (n+1)×(n+1) dots and 2·n·(n+1) lines.
 * Lines are one string: the horizontal ones row by row from the top, then the vertical ones.
 * '.' = not drawn, '0' / '1' = drawn by that seat. Boxes are an n×n string the same way.
 */
export const SIZES = [4, 5, 6] as const
/** Pause on the finished board before the results take over. */
export const RESULT_MS = 2200

export const lineCount = (n: number) => 2 * n * (n + 1)
export const hLine = (n: number, r: number, c: number) => r * n + c
export const vLine = (n: number, r: number, c: number) => n * (n + 1) + r * (n + 1) + c

export interface Segment {
  horizontal: boolean
  /** top-left dot of the line, in dot coordinates */
  r: number
  c: number
}

export function segment(n: number, i: number): Segment {
  const h = n * (n + 1)
  if (i < h) return { horizontal: true, r: Math.floor(i / n), c: i % n }
  const k = i - h
  return { horizontal: false, r: Math.floor(k / (n + 1)), c: k % (n + 1) }
}

/** The four lines around box b: top, right, bottom, left. */
export function sides(n: number, b: number): number[] {
  const r = Math.floor(b / n)
  const c = b % n
  return [hLine(n, r, c), vLine(n, r, c + 1), hLine(n, r + 1, c), vLine(n, r, c)]
}

/** Boxes on either side of a line (one or two). */
export function boxesOf(n: number, i: number): number[] {
  const { horizontal, r, c } = segment(n, i)
  const out: number[] = []
  if (horizontal) {
    if (r > 0) out.push((r - 1) * n + c)
    if (r < n) out.push(r * n + c)
  } else {
    if (c > 0) out.push(r * n + c - 1)
    if (c < n) out.push(r * n + c)
  }
  return out
}

export interface Live {
  size: number
  lines: string
  boxes: string
  turn: Seat
  starter: Seat
  /** last line drawn, -1 for none */
  last: number
  /** boxes the last line closed (absent when it closed none) */
  closed?: number[]
  /** game over: -1 = draw */
  result?: { winner: Seat | -1 }
}

export const count = (boxes: string, seat: Seat) => boxes.split('').filter((v) => v === String(seat)).length

export function freshLive(size: number, starter: Seat): Live {
  return { size, lines: '.'.repeat(lineCount(size)), boxes: '.'.repeat(size * size), turn: starter, starter, last: -1 }
}

/**
 * Draw a line — a pure function of the position, used inside the database transaction.
 * Closing a box claims it and earns another turn; otherwise the turn passes.
 */
export function play(live: Live, seat: Seat, i: number): Live | undefined {
  const n = live.size
  if (live.result || live.turn !== seat || i < 0 || i >= lineCount(n) || live.lines[i] !== '.') return undefined
  const lines = live.lines.slice(0, i) + String(seat) + live.lines.slice(i + 1)
  let boxes = live.boxes
  const closed: number[] = []
  for (const b of boxesOf(n, i)) {
    if (sides(n, b).every((s) => lines[s] !== '.')) {
      boxes = boxes.slice(0, b) + String(seat) + boxes.slice(b + 1)
      closed.push(b)
    }
  }
  const { closed: _drop, ...rest } = live
  const nextLive: Live = { ...rest, lines, boxes, last: i, turn: closed.length ? seat : ((1 - seat) as Seat) }
  if (closed.length) nextLive.closed = closed
  if (!boxes.includes('.')) {
    const a = count(boxes, 0)
    const b = count(boxes, 1)
    nextLive.result = { winner: a === b ? -1 : a > b ? 0 : 1 }
  }
  return nextLive
}
