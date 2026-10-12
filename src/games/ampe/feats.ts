import type { FeatDef } from '../../match/feats'
import type { AmpeLive, Seat } from './engine'

/** win this many exchanges in a row for On a roll */
const ROLL = 6

export const AMPE_FEATS: FeatDef[] = [
  { id: 'ampe:clean', game: 'ampe', name: 'Clean sheet', blurb: 'Won without the other player scoring.' },
  { id: 'ampe:roll', game: 'ampe', name: 'On a roll', blurb: `Won ${ROLL} exchanges in a row.` },
]

/** The feats each seat earned in a finished match. */
export function ampeFeats(live: AmpeLive): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const w = live.result?.winner
  if (w === undefined || live.result?.why === 'foul') return out
  if (live.points[1 - w] === 0) out[w].push('ampe:clean')
  const run = live.run ?? [0, 0]
  for (const s of [0, 1] as Seat[]) if (run[s] >= ROLL) out[s].push('ampe:roll')
  return out
}
