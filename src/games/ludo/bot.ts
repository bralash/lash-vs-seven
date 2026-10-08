import { BOT_SEAT, pick, type Brain, type Level } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { HOME, backKick, colorsOf, move, movable, other, roll, type Color, type Live } from './engine'
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
