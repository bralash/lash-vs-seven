import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { CHAIN, count, type Live } from './engine'

export const DOTS_FEATS: FeatDef[] = [
  { id: 'dots:chain', game: 'dots', name: 'Chain gang', blurb: `Took ${CHAIN} or more boxes in one turn.` },
  { id: 'dots:landslide', game: 'dots', name: 'Landslide', blurb: 'Won with at least twice as many boxes.' },
]

/** The feats each seat earned in a finished game. */
export function dotsFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  for (const s of [0, 1] as Seat[]) if ((live.chain ?? '').includes(String(s))) out[s].push('dots:chain')
  const w = live.result?.winner
  if (w === 0 || w === 1) {
    if (count(live.boxes, w) >= 2 * count(live.boxes, w === 0 ? 1 : 0)) out[w].push('dots:landslide')
  }
  return out
}
