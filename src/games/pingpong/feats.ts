import type { FeatDef } from '../../match/feats'
import type { Live, Side } from './engine'

/** Win a rally this long (shots by both players, serve included) for Long rally. */
const LONG = 15

export const PINGPONG_FEATS: FeatDef[] = [
  { id: 'pingpong:love', game: 'pingpong', name: 'Love game', blurb: 'Won a game 11–0.' },
  { id: 'pingpong:rally', game: 'pingpong', name: 'Long rally', blurb: `Won a rally of ${LONG} or more hits.` },
]

/** The feats each seat earned in a finished match (each counted once per match). */
export function pingpongFeats(live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Side, id: string) => out[s].add(`pingpong:${id}`)
  for (const [a, b] of live.history ?? []) {
    if (Math.min(a, b) === 0) add(a > b ? 0 : 1, 'love')
  }
  // older rooms kept no rally lengths: nothing to go on
  const rally = live.rally ?? [0, 0]
  for (const s of [0, 1] as Side[]) if (rally[s] >= LONG) add(s, 'rally')
  return [[...out[0]], [...out[1]]]
}
