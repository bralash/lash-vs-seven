import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Live } from './rules'

export const FOOTBALL_FEATS: FeatDef[] = [
  { id: 'football:clean', game: 'football', name: 'Clean sheet', blurb: 'Won a match of two goals or more without letting one in.' },
  { id: 'football:long', game: 'football', name: 'From your own half', blurb: 'Scored with the ball starting in your own half.' },
]

/** The feats each seat earned in a finished match. */
export function footballFeats(live: Live, target: number): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s]?.add(`football:${id}`)
  for (const g of live.goals ?? []) if (g.long) add(g.for, 'long')
  const w = live.result?.winner
  if (w !== undefined && target >= 2 && live.scores[`s${w === 0 ? 1 : 0}`] === 0) add(w, 'clean')
  return [[...out[0]], [...out[1]]]
}
