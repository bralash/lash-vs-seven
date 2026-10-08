import type { Seat } from '../../lobby/rooms'

/**
 * Ludo, as the classic Lash vs Seven version played it.
 *
 * Positions per token: 0 = in the yard, 1–51 = round the outer track counted from that colour's exit
 * square, 52–56 = its home column, 57 = home. (Each colour skips the one track square just before
 * its own exit and turns into its home column instead.)
 *
 *  - Roll a 6 to bring a token out onto your exit square. Only an opponent's blockade there stops it.
 *  - Every 6 earns another roll. A roll with no legal move ends the turn — even a 6.
 *  - Two tokens of one colour on a track square are a blockade: nothing can pass or land on it,
 *    and it can't be captured.
 *  - Land on an opponent's lone token: it goes back to its yard.
 *  - Line kick: after landing, if an opponent's lone token sits on the square directly across the
 *    arm (the parallel lane), it goes back to its yard and your token jumps to its square.
 *  - Back kick: when going *backwards* by the roll would capture (directly or by line kick), you may
 *    choose that instead of moving forward.
 *  - A 6 only kicks (any of the three ways) if you have another token out on the board to use the
 *    bonus roll on. Otherwise the token just lands next to the opponent's and both stay there, so
 *    you can't kick a token just because it was in your way. (House rule, added 2026-10-08.)
 *  - The home column needs an exact roll. First to bring every token home wins.
 *  - Quick: one colour each (diagonal opposites). Full: two colours each, eight tokens.
 */
export type Color = 'red' | 'blue' | 'green' | 'yellow'
export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow']
export const OFFSET: Record<Color, number> = { red: 0, blue: 13, green: 26, yellow: 39 }
export const OPPOSITE: Record<Color, Color> = { red: 'green', green: 'red', blue: 'yellow', yellow: 'blue' }
export const HOME = 57
const COLUMN = 52

/* ── Board geometry: a 15×15 grid, [col, row] ───────────────────────── */

/** the 52 outer squares, clockwise from red's exit */
export const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
]

export const HOME_COL: Record<Color, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
}

/** top-left cell of each colour's 6×6 yard: red top-left, blue top-right, green bottom-right, yellow bottom-left */
export const YARD: Record<Color, [number, number]> = { red: [0, 0], blue: [9, 0], green: [9, 9], yellow: [0, 9] }

/** The square directly across the arm (the other outer lane, same distance out), or -1. */
const PARTNER: number[] = TRACK.map(([c, r]) => {
  const find = (cc: number, rr: number) => TRACK.findIndex(([x, y]) => x === cc && y === rr)
  if ((r === 6 || r === 8) && (c <= 5 || c >= 9)) return find(c, r === 6 ? 8 : 6)
  if ((c === 6 || c === 8) && (r <= 5 || r >= 9)) return find(c === 6 ? 8 : 6, r)
  return -1
})
export const partnerOf = (abs: number) => PARTNER[abs]

/** Where a token is, as a board cell (centre at +0.5); null in the yard or home (drawn specially). */
export function cellOf(color: Color, pos: number): [number, number] | null {
  if (pos <= 0 || pos >= HOME) return null
  if (pos >= COLUMN) return HOME_COL[color][pos - COLUMN]
  return TRACK[(pos - 1 + OFFSET[color]) % 52]
}

/* ── State ──────────────────────────────────────────────────────────── */

export interface Kick {
  c: Color
  i: number
  /** where the victim was, so the screen can show it there until the move lands */
  from: number
}

/** The last move, so both screens can animate it. */
export interface LastMove {
  n: number
  c: Color
  i: number
  /** each square the token passes through, in order (its own position numbers) */
  path: number[]
  back?: boolean
  kicks?: Kick[]
  /** a line kick moved the token on to the victim's square */
  jump?: number
}

export interface Live {
  mode: 'quick' | 'full'
  /** each seat's colours */
  colors: Color[][]
  tokens: Partial<Record<Color, number[]>>
  turn: Seat
  /** waiting for the player who rolled to move */
  rolled: boolean
  /** the die on show: value, who rolled it, a counter (so a repeat roll still animates), and whether it had no move */
  die?: { v: number; s: Seat; n: number; none?: boolean }
  last?: LastMove
  /** captures (direct + line kicks) by seat */
  caps: [number, number]
  winner?: Seat
}

export const other = (s: Seat) => (1 - s) as Seat

export function freshLive(mode: 'quick' | 'full', p1: Color, starter: Seat): Live {
  const pair: Color[] = [p1, OPPOSITE[p1]]
  const colors: Color[][] = mode === 'full' ? [pair, COLORS.filter((c) => !pair.includes(c))] : [[p1], [OPPOSITE[p1]]]
  const tokens: Partial<Record<Color, number[]>> = {}
  for (const c of colors.flat()) tokens[c] = [0, 0, 0, 0]
  return { mode, colors, tokens, turn: starter, rolled: false, caps: [0, 0] }
}

const toks = (live: Live, c: Color) => live.tokens[c] ?? []
export const colorsOf = (live: Live, s: Seat) => live.colors[s] ?? []
export const seatOf = (live: Live, c: Color): Seat => (colorsOf(live, 0).includes(c) ? 0 : 1)
const active = (live: Live) => live.colors.flat()

/** absolute track square of a token, or -1 off the outer track */
export function absOf(color: Color, pos: number) {
  return pos >= 1 && pos < COLUMN ? (pos - 1 + OFFSET[color]) % 52 : -1
}
/** a colour's position number for an absolute track square (52 = the one square it never visits) */
const relOf = (color: Color, abs: number) => ((abs - OFFSET[color] + 52) % 52) + 1

function countAt(live: Live, color: Color, abs: number) {
  return toks(live, color).filter((p) => absOf(color, p) === abs).length
}
/** two of one colour on a square — any colour, yours included */
export function blockadeAt(live: Live, abs: number) {
  return active(live).some((c) => countAt(live, c, abs) >= 2)
}
function enemyBlockadeAt(live: Live, seat: Seat, abs: number) {
  return colorsOf(live, other(seat)).some((c) => countAt(live, c, abs) >= 2)
}

/** Can this token move forward by `roll`? */
export function canMove(live: Live, color: Color, i: number, roll: number): boolean {
  const pos = toks(live, color)[i]
  if (!roll || pos === undefined || pos === HOME) return false
  if (pos === 0) return roll === 6 && !enemyBlockadeAt(live, seatOf(live, color), OFFSET[color])
  if (pos >= COLUMN) return pos + roll <= HOME
  const end = Math.min(pos + roll, COLUMN - 1)
  for (let p = pos + 1; p <= end; p++) if (blockadeAt(live, absOf(color, p))) return false
  return true
}

/** The token's own colour is entering a square: which opponent tokens could it take there? */
function victimsAt(live: Live, seat: Seat, abs: number): { c: Color; i: number }[] {
  const out: { c: Color; i: number }[] = []
  if (abs < 0) return out
  for (const c of colorsOf(live, other(seat))) {
    if (countAt(live, c, abs) >= 2) continue // a blockade can't be taken
    toks(live, c).forEach((p, i) => absOf(c, p) === abs && out.push({ c, i }))
  }
  return out
}

/** A 6 can only kick if another of this player's tokens is out on the board (not in the yard or home). */
function mayKick(live: Live, color: Color, i: number, roll: number) {
  if (roll !== 6) return true
  return colorsOf(live, seatOf(live, color)).some((c) => toks(live, c).some((p, k) => (c !== color || k !== i) && p >= 1 && p < HOME))
}

/**
 * Back kick: going backwards by `roll` lands where it would capture — on an opponent or across the
 * arm from one. Returns the landing position, or null. (Like the classic game, a token near its exit
 * can go back past it onto the far end of its lap; it just can't land on the one square it skips.)
 */
export function backKick(live: Live, color: Color, i: number, roll: number): number | null {
  const pos = toks(live, color)[i]
  if (pos === undefined || pos < 1 || pos >= COLUMN || !mayKick(live, color, i, roll)) return null
  const start = absOf(color, pos)
  const land = (start - roll + 52) % 52
  if (relOf(color, land) === 52) return null
  for (let s = 1; s <= roll; s++) if (blockadeAt(live, (start - s + 52) % 52)) return null
  const seat = seatOf(live, color)
  const p = partnerOf(land)
  if (!victimsAt(live, seat, land).length && !(p >= 0 && victimsAt(live, seat, p).length)) return null
  return relOf(color, land)
}

/** Tokens of the player on turn that can move with the die showing. */
export function movable(live: Live): { c: Color; i: number }[] {
  if (!live.rolled || !live.die || live.winner !== undefined) return []
  const out: { c: Color; i: number }[] = []
  for (const c of colorsOf(live, live.turn)) toks(live, c).forEach((_, i) => canMove(live, c, i, live.die!.v) && out.push({ c, i }))
  return out
}

function anyMove(live: Live, seat: Seat, roll: number) {
  return colorsOf(live, seat).some((c) => toks(live, c).some((_, i) => canMove(live, c, i, roll)))
}

/** A yard token can't come out on a 6 because an opponent's blockade sits on the exit. */
export function exitBlocked(live: Live, seat: Seat): boolean {
  return colorsOf(live, seat).some((c) => toks(live, c).includes(0) && enemyBlockadeAt(live, seat, OFFSET[c]))
}

/* ── Moves ──────────────────────────────────────────────────────────── */

export function roll(live: Live, seat: Seat, v: number): Live | undefined {
  if (live.winner !== undefined || live.turn !== seat || live.rolled || !(v >= 1 && v <= 6)) return undefined
  const n = (live.die?.n ?? 0) + 1
  if (!anyMove(live, seat, v)) return { ...live, die: { v, s: seat, n, none: true }, rolled: false, turn: other(seat) }
  return { ...live, die: { v, s: seat, n }, rolled: true }
}

export function move(live: Live, seat: Seat, color: Color, i: number, dir: 'forward' | 'back' = 'forward'): Live | undefined {
  const r = live.die?.v ?? 0
  if (!live.rolled || live.turn !== seat || live.winner !== undefined || !colorsOf(live, seat).includes(color)) return undefined
  // a token has to be able to go forward to be picked at all; back is an option on top of that
  if (!canMove(live, color, i, r)) return undefined
  const from = toks(live, color)[i]
  let to: number
  let path: number[]
  if (dir === 'back') {
    const b = backKick(live, color, i, r)
    if (b === null) return undefined
    to = b
    path = []
    const start = absOf(color, from)
    for (let s = 1; s <= r; s++) {
      const rel = relOf(color, (start - s + 52) % 52)
      if (rel <= 51) path.push(rel)
    }
  } else if (from === 0) {
    to = 1
    path = [1]
  } else {
    to = from + r
    path = Array.from({ length: r }, (_, k) => from + k + 1)
  }

  const tokens = { ...live.tokens }
  for (const c of active(live)) tokens[c] = [...toks(live, c)]
  const next: Live = { ...live, tokens }
  tokens[color]![i] = to
  const kicking = mayKick(live, color, i, r)

  // capture where it lands, then a line kick from there
  const kicks: Kick[] = []
  const abs = kicking ? absOf(color, to) : -1
  for (const v of victimsAt(next, seat, abs)) {
    kicks.push({ ...v, from: tokens[v.c]![v.i] })
    tokens[v.c]![v.i] = 0
  }
  let jump: number | undefined
  const p = abs >= 0 ? partnerOf(abs) : -1
  if (p >= 0) {
    for (const v of victimsAt(next, seat, p)) {
      kicks.push({ ...v, from: tokens[v.c]![v.i] })
      tokens[v.c]![v.i] = 0
      // the mover jumps across to the victim's square (52 — straight into its home column — if that's
      // the one square this colour never visits)
      jump = relOf(color, p)
      tokens[color]![i] = jump
    }
  }

  const caps = [...live.caps] as [number, number]
  caps[seat] += kicks.length
  const last: LastMove = { n: (live.last?.n ?? 0) + 1, c: color, i, path }
  if (dir === 'back') last.back = true
  if (kicks.length) last.kicks = kicks
  if (jump !== undefined) last.jump = jump

  const won = colorsOf(live, seat).every((c) => tokens[c]!.every((q) => q === HOME))
  const bonus = r === 6
  return {
    ...next,
    caps,
    last,
    rolled: false,
    turn: won || bonus ? seat : other(seat),
    ...(won ? { winner: seat } : {}),
  }
}

/* ── Read-outs ──────────────────────────────────────────────────────── */

export function homeCount(live: Live, seat: Seat) {
  return colorsOf(live, seat).reduce((n, c) => n + toks(live, c).filter((p) => p === HOME).length, 0)
}
export const tokenTotal = (live: Live, seat: Seat) => colorsOf(live, seat).length * 4

/** How far along a seat is overall (0–1), for the HUD and results. */
export function progress(live: Live, seat: Seat) {
  const all = colorsOf(live, seat).flatMap((c) => toks(live, c))
  return all.reduce((n, p) => n + p, 0) / (all.length * HOME || 1)
}
