import type { FeatDef } from '../../match/feats'
import { movesOf, replay, type DotLive, type Seat } from './engine'

/** take this many dots with one line for Sweep */
const SWEEP = 20

export const DOTRUSH_FEATS: FeatDef[] = [
  { id: 'dotrush:bomb', game: 'dotrush', name: 'Bomb squad', blurb: 'Closed a loop round other dots and set off a bomb.' },
  { id: 'dotrush:sweep', game: 'dotrush', name: 'Sweep', blurb: `Took ${SWEEP} or more dots with one line.` },
]

/** The feats each seat earned in a finished game. */
export function dotrushFeats(l: DotLive): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  if (!l.result) return out
  for (const s of [0, 1] as Seat[]) {
    const p = replay(l.seed, movesOf(l, s).slice(0, l.moves))
    if (p.bombs > 0) out[s].push('dotrush:bomb')
    if (p.best >= SWEEP) out[s].push('dotrush:sweep')
  }
  return out
}
