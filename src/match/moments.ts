import type { Live as ShipsLive } from '../games/battleship/engine'
import type { Live as C4Live } from '../games/connect4/engine'
import type { Live as LudoLive } from '../games/ludo/engine'
import type { Live as PingLive } from '../games/pingpong/engine'
import type { Live as PoolLive } from '../games/pool/rules'
import { kindOf, type Live as UnoLive } from '../games/uno/engine'

/*
 * Game moments for the weekly missions: what each seat did in a finished match, read from the
 * match's final state (so it's counted once, with the match, when it pays). Each game's results
 * pass these to useRivalry / useRivalryMulti; missions.ts says which ones count for what.
 */

/** by seat: moment name → how many times */
export type Moments = Record<string, number>[]

const seats = (n: number) => Array.from({ length: n }, (): Record<string, number> => ({}))

/** Ludo: tokens kicked back to base. */
export function ludoMoments(live: LudoLive): Moments {
  return [0, 1, 2, 3].map((s) => ({ kick: live.caps?.[s] ?? 0 }))
}

/** Uno: draw cards played (+2 and +4), and going out on a Wild or a +4. */
export function unoMoments(g: UnoLive): Moments {
  const out = seats(4)
  for (const p of g.plays ?? []) {
    const k = kindOf(p.c)
    if (k === 'draw2' || k === 'wild4') out[p.s].draws = (out[p.s].draws ?? 0) + 1
  }
  const top = g.discard?.at(-1)
  if (g.winner !== undefined && g.winner >= 0 && top !== undefined && top >= 100) out[g.winner].wildOut = 1
  return out
}

/** Connect Four: the deciding game won on a diagonal, or with 7 discs or fewer. */
export function c4Moments(live: C4Live): Moments {
  const out = seats(2)
  const r = live.result
  if (!r || r.winner === -1 || !r.line) return out
  const step = r.line[1] - r.line[0]
  if (step === 6 || step === 8) out[r.winner].diagonal = 1
  const mine = [...live.board].filter((c) => c === String(r.winner)).length
  if (mine <= 7) out[r.winner].quick = 1
  return out
}

/** Battleship: ships sunk, and five hits in a row (each battle of the match). */
export function shipsMoments(live: ShipsLive): Moments {
  const out = seats(2)
  for (const g of live.played ?? [])
    for (const s of [0, 1] as const) {
      out[s].sunk = (out[s].sunk ?? 0) + (g.sank?.[s] ?? 0)
      if (g.run[s] >= 5) out[s].chain = (out[s].chain ?? 0) + 1
    }
  return out
}

/** Pool: frames won by potting the 8 (not on the other player's foul). */
export function poolMoments(live: PoolLive): Moments {
  const out = seats(2)
  for (const f of live.history ?? []) if (f.why.endsWith(' pots the 8')) out[f.winner].eight = (out[f.winner].eight ?? 0) + 1
  return out
}

/** Table Tennis: games won past 11–10, and games won by 7 or more. */
export function pingMoments(live: PingLive): Moments {
  const out = seats(2)
  for (const [a, b] of live.history ?? []) {
    const w = a > b ? 0 : 1
    if (Math.max(a, b) > 11) out[w].deuce = (out[w].deuce ?? 0) + 1
    if (Math.abs(a - b) >= 7) out[w].thrash = (out[w].thrash ?? 0) + 1
  }
  return out
}
