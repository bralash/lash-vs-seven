import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Live } from './rules'

export const POOL_FEATS: FeatDef[] = [
  { id: 'pool:run', game: 'pool', name: 'Break and run', blurb: 'Broke, then cleared your group and the 8 before the other player had a shot.' },
  { id: 'pool:clean', game: 'pool', name: 'Clean frame', blurb: 'Won a frame without a single foul.' },
]

/** The feats each seat earned in a finished match (each counted once, however many frames it came up in). */
export function poolFeats(live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s]?.add(`pool:${id}`)
  for (const f of live.history ?? []) {
    if (f.run) add(f.winner, 'run')
    if (f.clean) add(f.winner, 'clean')
  }
  return [[...out[0]], [...out[1]]]
}
