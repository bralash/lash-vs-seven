import { BOT_SEAT, pick, squash, type Brain, type Level, type Moment, type OpsSense, type Said } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { HOME, backKick, colorsOf, homeCount, move, movable, other, roll, type Color, type Live } from './engine'
import type { LudoState } from './LudoMatch'

/** How often Ops just moves any token; whether she looks at what you could hit next. */
const SLIP: Record<Level, number> = { easy: 0.45, medium: 0.1, hard: 0 }
const CAREFUL: Record<Level, boolean> = { easy: false, medium: false, hard: true }

/** home column starts here (as in the engine): nobody can touch a token past it */
const COLUMN = 52

/** How far along `seat` is, in squares, plus extra for each token out of the yard (in self-play, getting
 * tokens out mattered most), safe in the column, or home. */
function worth(live: Live, seat: Seat): number {
  let n = 0
  for (const c of colorsOf(live, seat))
    for (const p of live.tokens[c] ?? []) n += p + (p === HOME ? 12 : p >= COLUMN ? 6 : p > 0 ? 15 : 0)
  return n
}
/** the race from `seat`'s side: their lead over the other player */
const standing = (live: Live, seat: Seat) => worth(live, seat) - worth(live, other(seat))

interface Option {
  c: Color
  i: number
  dir: 'forward' | 'back'
}

function options(live: Live): Option[] {
  const v = live.die?.v ?? 0
  return movable(live).flatMap(({ c, i }) => [
    { c, i, dir: 'forward' as const },
    ...(backKick(live, c, i, v) !== null ? [{ c, i, dir: 'back' as const }] : []),
  ])
}

/**
 * What the other player could take off `seat` on their next roll, on average: for each die value,
 * their best move (by how much of ours it sends home). Line kicks and back kicks included, since this
 * plays their moves with the real engine.
 */
function exposure(live: Live, seat: Seat): number {
  const them = other(seat)
  const base = worth(live, seat)
  let total = 0
  for (let v = 1; v <= 6; v++) {
    const rolled: Live = { ...live, turn: them, rolled: true, die: { v, s: them, n: 0 } }
    let worst = 0
    for (const o of options(rolled)) {
      const after = move(rolled, them, o.c, o.i, o.dir)
      if (after) worst = Math.max(worst, base - worth(after, seat))
    }
    total += worst
  }
  return total / 6
}

/** The moves tied for best with the die showing. */
export function bestMoves(live: Live, seat: Seat, level: Level): Option[] {
  const scored = options(live).map((o) => {
    const after = move(live, seat, o.c, o.i, o.dir)!
    let s = standing(after, seat)
    // a six means she goes again, so danger only counts once the turn passes
    if (CAREFUL[level] && after.turn !== seat && after.winner === undefined) s -= 1.5 * exposure(after, seat)
    return { o, s }
  })
  const top = Math.max(...scored.map((x) => x.s))
  return scored.filter((x) => x.s >= top - 1e-9).map((x) => x.o)
}

export const ludoBrain: Brain = (state, level) => {
  const live = (state as unknown as LudoState).live
  if (!live || live.winner !== undefined || live.turn !== BOT_SEAT) return null
  if (!live.rolled) {
    const v = 1 + Math.floor(Math.random() * 6)
    return (cur: Live) => roll(cur, BOT_SEAT, v)
  }
  const opts = options(live)
  if (!opts.length) return null
  const o = Math.random() < SLIP[level] ? pick(opts) : pick(bestMoves(live, BOT_SEAT, level))
  return (cur: Live) => move(cur, BOT_SEAT, o.c, o.i, o.dir)
}

/** How the race looks to Ops, for her reactions: the race standing she plays by, knocks home, and her rolls. */
export const ludoSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as LudoState).live
    return !live || live.winner !== undefined ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as LudoState).live
    return !live || live.winner !== undefined ? null : squash(standing(live, BOT_SEAT), 60)
  },
  ended: (state) => {
    const w = (state as unknown as LudoState).live?.winner
    return w === undefined ? null : { winner: w, final: true }
  },
  moment: (prev, next) => {
    const a = (prev as unknown as LudoState).live
    const b = (next as unknown as LudoState).live
    if (!a || !b) return null
    if (b.caps[BOT_SEAT] > a.caps[BOT_SEAT]) return 'took'
    if (b.caps[0] > a.caps[0]) return 'lost'
    const die = b.die
    if (!die || die.n === a.die?.n) return null
    return rollMoment(a, die.s, die.v, !!die.none, die.n)
  },
}

/** What `seat`'s best move with a roll of `v` would do from `before` (a position waiting for their roll). */
function rollOutcome(before: Live, seat: Seat, v: number): { value: number; hit: boolean; home: boolean } {
  const rolled: Live = { ...before, turn: seat, rolled: true, die: { v, s: seat, n: 0 } }
  let best = { value: standing(before, seat), hit: false, home: false }
  let first = true
  for (const o of options(rolled)) {
    const after = move(rolled, seat, o.c, o.i, o.dir)
    if (!after) continue
    const value = standing(after, seat)
    if (first || value > best.value)
      best = { value, hit: after.caps[seat] > before.caps[seat], home: homeCount(after, seat) > homeCount(before, seat) }
    first = false
  }
  return best
}

/** how far a roll must beat (or fall short of) an average roll, in race squares, to be worth a word */
const LUCK = 30
/** rolls so far (both players') when still being stuck in the yard at the start starts to sting: she says so once, around then */
const STUCK_ROLLS = [12, 17]

/**
 * Whether a roll is worth a word. A roll is lucky or unlucky against the average of all six: what the
 * best move with it does to the race, next to what the other numbers would have done. Small
 * differences are just Ludo; a roll that's a hit or a token home when most numbers aren't (or the
 * other way round) gets a reaction. Your lucky rolls get one too: "Rigged".
 */
function rollMoment(before: Live, seat: Seat, v: number, none: boolean, n: number): Moment | Said | null {
  const all = [1, 2, 3, 4, 5, 6].map((w) => rollOutcome(before, seat, w))
  const mean = all.reduce((t, o) => t + o.value, 0) / 6
  const got = all[v - 1]
  const luck = got.value - mean
  if (seat !== BOT_SEAT) return luck >= LUCK ? 'unlucky' : null

  const yard = colorsOf(before, BOT_SEAT).every((c) => (before.tokens[c] ?? []).every((p) => p === 0))
  if (yard) {
    if (v === 6 && !none) return { moment: 'lucky', said: 'Finally!' }
    return none && n >= STUCK_ROLLS[0] && n <= STUCK_ROLLS[1] ? { moment: 'unlucky', said: 'Six, please' } : null
  }
  if (luck >= LUCK) return { moment: 'lucky', said: got.hit ? `Ooh, a ${v}` : got.home ? 'Home time' : 'Yes!' }
  if (luck <= -LUCK) {
    // the number that would have done best, when it would have landed a hit
    const top = all.reduce((b, o, i) => (o.value > all[b].value ? i : b), 0)
    return { moment: 'unlucky', said: all[top].hit ? `Needed a ${top + 1}` : 'Rigged' }
  }
  return null
}
