/*
 * Dot Rush: a race on the same board of coloured dots. Join two or more neighbouring dots of one
 * colour (up, down, left, right) and they go; close the line into a loop and every dot of that colour
 * goes, and any dots the loop goes round turn into bombs that blow up the dots around them.
 *
 * Both players start from one seed, and new dots come from the same supply, so the board only
 * differs by what each of you does to it. A player's game is nothing but the seed and their moves,
 * so any phone can replay it.
 */

export const SIZE = 6
export const CELLS = SIZE * SIZE
export const COLOURS = 5
/** the dot colours, in order */
export const HUES = ['#e8483b', '#ffc21a', '#22a45d', '#2d5bff', '#9b3fd6']
export const HUE_NAMES = ['red', 'yellow', 'green', 'blue', 'purple']
export const COUNTDOWN_MS = 3_000
/** seconds on the clock per move you have */
export const MS_PER_MOVE = 4_000

export type Seat = 0 | 1

export interface Dot {
  c: number
  /** stays with the dot as it falls, so the screen can slide it down */
  id: number
}

export interface Board {
  dots: Dot[]
  /** the random supply's position (mulberry32 state) */
  r: number
  /** the next dot's id */
  next: number
}

export interface Play {
  board: Board
  score: number
  used: number
  /** most dots taken by one move */
  best: number
  loops: number
  bombs: number
}

export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
export const touching = (a: number, b: number) =>
  (rowOf(a) === rowOf(b) && Math.abs(colOf(a) - colOf(b)) === 1) || (colOf(a) === colOf(b) && Math.abs(rowOf(a) - rowOf(b)) === 1)

/** one step of mulberry32: the next state and a number in [0, 1) */
function step(r: number): [number, number] {
  const s = (r + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296]
}

function draw(b: Board): Dot {
  const [r, x] = step(b.r)
  b.r = r
  return { c: Math.floor(x * COLOURS), id: b.next++ }
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function freshBoard(seed: number): Board {
  const b: Board = { dots: [], r: seed >>> 0, next: 0 }
  for (let i = 0; i < CELLS; i++) b.dots.push(draw(b))
  if (!hasMove(b.dots)) shuffle(b)
  return b
}

/** any two touching dots of one colour */
export function hasMove(dots: Dot[]) {
  for (let i = 0; i < CELLS; i++) {
    if (colOf(i) < SIZE - 1 && dots[i].c === dots[i + 1].c) return true
    if (rowOf(i) < SIZE - 1 && dots[i].c === dots[i + SIZE].c) return true
  }
  return false
}

/** stuck: the same dots, mixed up from the supply until a move turns up */
function shuffle(b: Board) {
  for (let tries = 0; tries < 50 && !hasMove(b.dots); tries++) {
    for (let i = CELLS - 1; i > 0; i--) {
      const [r, x] = step(b.r)
      b.r = r
      const j = Math.floor(x * (i + 1))
      ;[b.dots[i], b.dots[j]] = [b.dots[j], b.dots[i]]
    }
  }
  // (five colours on 36 dots: in practice the first mix always works; if not, new dots do)
  while (!hasMove(b.dots)) b.dots[0] = { ...draw(b), id: b.dots[0].id }
}

/**
 * Where a line closes into a loop: the index in `path` of the dot it came back to, or -1. A path
 * that loops ends on a dot it has already been through.
 */
export function loopAt(path: number[]): number {
  if (path.length < 5) return -1
  const k = path.indexOf(path[path.length - 1])
  return k < path.length - 1 && path.length - 1 - k >= 4 ? k : -1
}

/** is this a line you can play: touching dots, one colour, none twice (except closing a loop at the end) */
export function valid(dots: Dot[], path: number[]) {
  if (path.length < 2) return false
  const c = dots[path[0]]?.c
  for (let i = 0; i < path.length; i++) {
    if (dots[path[i]]?.c !== c) return false
    if (i && !touching(path[i - 1], path[i])) return false
  }
  const ring = loopAt(path)
  const body = ring >= 0 ? path.slice(0, -1) : path
  return new Set(body).size === body.length
}

/** the dots a loop goes round (not on it): point-in-polygon on the dot centres */
export function inside(cycle: number[]): number[] {
  const on = new Set(cycle)
  const pts = cycle.map((i) => [colOf(i), rowOf(i)])
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (on.has(i)) continue
    const x = colOf(i)
    const y = rowOf(i)
    let into = false
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a]
      const [xb, yb] = pts[b]
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) into = !into
    }
    if (into) out.push(i)
  }
  return out
}

export interface Outcome {
  /** every dot that goes */
  gone: number[]
  /** the dots that turned into bombs */
  bombs: number[]
  loop: boolean
}

/** what a line takes, before anything falls */
export function outcome(dots: Dot[], path: number[]): Outcome {
  const k = loopAt(path)
  if (k < 0) return { gone: [...new Set(path)], bombs: [], loop: false }
  const c = dots[path[0]].c
  const gone = new Set<number>()
  for (let i = 0; i < CELLS; i++) if (dots[i].c === c) gone.add(i)
  const bombs = inside(path.slice(k, -1)).filter((i) => dots[i].c !== c)
  for (const b of bombs) {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const r = rowOf(b) + dr
        const cc = colOf(b) + dc
        if (r >= 0 && r < SIZE && cc >= 0 && cc < SIZE) gone.add(r * SIZE + cc)
      }
  }
  return { gone: [...gone], bombs, loop: true }
}

/** play a line: the dots go, the rest fall, new ones drop in from the supply */
export function apply(b: Board, path: number[]): { board: Board; took: Outcome } {
  const took = outcome(b.dots, path)
  const gone = new Set(took.gone)
  const nb: Board = { dots: [...b.dots], r: b.r, next: b.next }
  for (let c = 0; c < SIZE; c++) {
    const kept: Dot[] = []
    for (let r = SIZE - 1; r >= 0; r--) if (!gone.has(r * SIZE + c)) kept.push(b.dots[r * SIZE + c])
    for (let r = SIZE - 1, k = 0; r >= 0; r--, k++) nb.dots[r * SIZE + c] = kept[k] ?? draw(nb)
  }
  if (!hasMove(nb.dots)) shuffle(nb)
  return { board: nb, took }
}

/** moves are kept as "3.4.10" (a loop ends on a dot it already passed) */
export const encode = (path: number[]) => path.join('.')
export const decode = (m: string) => m.split('.').map(Number)

/** replay a player's game from the seed */
export function replay(seed: number, moves: string[]): Play {
  const p: Play = { board: freshBoard(seed), score: 0, used: 0, best: 0, loops: 0, bombs: 0 }
  for (const m of moves) {
    const path = decode(m)
    if (!valid(p.board.dots, path)) continue
    const { board, took } = apply(p.board, path)
    p.board = board
    p.score += took.gone.length
    p.used++
    p.best = Math.max(p.best, took.gone.length)
    if (took.loop) p.loops++
    p.bombs += took.bombs.length
  }
  return p
}

/* ── finding lines, for Ops ── */

export interface Option {
  path: number[]
  take: number
}

/**
 * Lines worth looking at: from every dot, the walks through its colour (up to `cap` long), and
 * every loop found on the way. Enough for a fair choice without listing every path on the board.
 */
export function options(dots: Dot[], cap = 9, budget = 4000): Option[] {
  const out: Option[] = []
  const seen = new Set<string>()
  let work = 0
  const add = (path: number[]) => {
    const key = encode(path)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ path, take: outcome(dots, path).gone.length })
  }
  const walk = (path: number[]) => {
    if (++work > budget) return
    const last = path[path.length - 1]
    if (path.length >= 2) add(path)
    for (const n of [last - SIZE, last + SIZE, colOf(last) ? last - 1 : -1, colOf(last) < SIZE - 1 ? last + 1 : -1]) {
      if (n < 0 || n >= CELLS || dots[n].c !== dots[last].c) continue
      if (path.includes(n)) {
        const loop = [...path, n]
        if (loopAt(loop) >= 0) add(loop)
        continue
      }
      if (path.length < cap) walk([...path, n])
    }
  }
  for (let i = 0; i < CELLS; i++) walk([i])
  return out
}

/* ── the race ── */

/** after the clock runs out, this long for the last moves to land */
export const GRACE_MS = 1_500

export interface DotLive {
  seed: number
  /** moves each */
  moves: number
  /** when the countdown started (server time); 0 until the host sets it going */
  start: number
  /** each seat's moves so far */
  m?: { s0?: string[]; s1?: string[] }
  result?: { winner: Seat | -1; scores: [number, number] }
}

export const freshLive = (moves: number): DotLive => ({ seed: newSeed(), moves, start: 0 })
export const movesOf = (l: DotLive, s: Seat) => (s === 0 ? l.m?.s0 : l.m?.s1) ?? []
export const playFrom = (l: DotLive) => l.start + COUNTDOWN_MS
export const playTo = (l: DotLive) => playFrom(l) + l.moves * MS_PER_MOVE

/** both done, or time's up: the result (undefined while it's still on, or once it's settled) */
export function settle(cur: DotLive, now: number): DotLive | undefined {
  if (cur.result || !cur.start) return undefined
  const plays = ([0, 1] as Seat[]).map((s) => replay(cur.seed, movesOf(cur, s).slice(0, cur.moves)))
  const done = plays.every((p) => p.used >= cur.moves)
  if (!done && now < playTo(cur) + GRACE_MS) return undefined
  const scores: [number, number] = [plays[0].score, plays[1].score]
  const winner: Seat | -1 = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1
  return { ...cur, result: { winner, scores } }
}
