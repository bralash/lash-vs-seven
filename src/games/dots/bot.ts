import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { boxesOf, count, lineCount, play, sides, type Live } from './engine'
import type { DotsState } from './DotsMatch'

/**
 * Ops at Dots & Boxes. Before the endgame it takes any box on offer and otherwise draws a line that
 * gives nothing away. When every line gives something away, it hands over as little as it can, or,
 * with few enough lines left, works the rest of the game out exactly (which includes leaving the
 * last two boxes of a chain to keep control).
 */
const EXACT: Record<Level, number> = { easy: 0, medium: 12, hard: 17 }
/** Easy sometimes misses a box it could take, or draws a third side when it didn't have to. */
const MISS: Record<Level, number> = { easy: 0.35, medium: 0, hard: 0 }

const drawnSides = (n: number, lines: string, b: number) => sides(n, b).filter((s) => lines[s] !== '.').length

/** Boxes this line would close. */
const closes = (n: number, lines: string, i: number) => boxesOf(n, i).filter((b) => drawnSides(n, lines, b) === 3).length
/** True when this line hands a box over: it draws the third side of one without closing anything. */
const gives = (n: number, lines: string, i: number) => boxesOf(n, i).some((b) => drawnSides(n, lines, b) === 2)

const open = (lines: string) => [...lines].flatMap((v, i) => (v === '.' ? [i] : []))
const draw = (lines: string, i: number) => lines.slice(0, i) + '1' + lines.slice(i + 1)

/** Boxes the player to move can collect by taking every box on offer, one after another. */
function harvest(n: number, lines: string): { lines: string; got: number } {
  let got = 0
  for (;;) {
    const i = open(lines).find((k) => closes(n, lines, k) > 0)
    if (i === undefined) return { lines, got }
    got += closes(n, lines, i)
    lines = draw(lines, i)
  }
}

/**
 * Exact best box difference for the player to move, for every choice of line, from here to the end.
 * The open lines become bits of a number, so every position left is one slot in a table.
 */
function solveAll(n: number, free: number[]): number[] {
  const k = free.length
  const bit = new Map(free.map((line, b) => [line, b]))
  // per open line: the boxes beside it, each as (sides already drawn, mask of its open sides)
  const around = free.map((line) =>
    boxesOf(n, line).map((box) => {
      let fixed = 0
      let mask = 0
      for (const sd of sides(n, box)) {
        const b = bit.get(sd)
        if (b === undefined) fixed++
        else mask |= 1 << b
      }
      return { fixed, mask }
    }),
  )
  const ones = (x: number) => {
    let c = 0
    for (; x; x &= x - 1) c++
    return c
  }
  // how many boxes drawing open line b closes, when `drawn` holds the open lines drawn so far
  const gain = (b: number, drawn: number) => around[b].filter((x) => x.fixed + ones(drawn & x.mask) === 3).length
  const full = (1 << k) - 1
  const memo = new Int16Array(1 << k).fill(-32768)
  const value = (drawn: number): number => {
    if (drawn === full) return 0
    if (memo[drawn] !== -32768) return memo[drawn]
    let best = -Infinity
    for (let b = 0; b < k; b++) {
      if (drawn & (1 << b)) continue
      const got = gain(b, drawn)
      const rest = value(drawn | (1 << b))
      best = Math.max(best, got ? got + rest : -rest)
    }
    memo[drawn] = best
    return best
  }
  return free.map((_, b) => {
    const got = gain(b, 0)
    const rest = value(1 << b)
    return got ? got + rest : -rest
  })
}

export function chooseLine(n: number, lines: string, level: Level): number {
  const free = open(lines)
  const slip = Math.random() < MISS[level]

  if (free.length <= EXACT[level]) {
    const values = solveAll(n, free)
    const scored = free.map((i, b) => ({ i, s: values[b] }))
    const top = Math.max(...scored.map((x) => x.s))
    return pick(scored.filter((x) => x.s === top).map((x) => x.i))
  }

  const takes = free.filter((i) => closes(n, lines, i) > 0)
  if (takes.length && !slip) return pick(takes)
  const safe = free.filter((i) => !closes(n, lines, i) && !gives(n, lines, i))
  if (safe.length) return pick(safe)
  if (slip) return pick(free)
  // everything gives something away: give the fewest boxes
  const cost = free.map((i) => ({ i, c: harvest(n, draw(lines, i)).got }))
  const least = Math.min(...cost.map((x) => x.c))
  return pick(cost.filter((x) => x.c === least).map((x) => x.i))
}

export const dotsBrain: Brain = (state, level) => {
  const live = (state as unknown as DotsState).live
  if (!live || live.result || live.turn !== BOT_SEAT || live.lines.length !== lineCount(live.size)) return null
  const i = chooseLine(live.size, live.lines, level)
  return (cur: Live) => play(cur, BOT_SEAT, i)
}

/** How the game looks to Ops, for her reactions: boxes each side holds, against the boxes on the board. */
export const dotsSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as DotsState).live
    return !live || live.result ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as DotsState).live
    if (!live || live.result) return null
    return squash((3 * (count(live.boxes, BOT_SEAT) - count(live.boxes, 0))) / live.boxes.length, 0.8)
  },
  ended: (state) => {
    const r = (state as unknown as DotsState).live?.result
    return r ? { winner: r.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = (prev as unknown as DotsState).live
    const b = (next as unknown as DotsState).live
    // two or more boxes with one line
    if (!a || !b || !b.closed || b.closed.length < 2) return null
    return a.turn === BOT_SEAT ? 'took' : 'lost'
  },
}
