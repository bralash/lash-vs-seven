import type { FeatDef } from '../../match/feats'
import type { DashLive, Seat } from './engine'

export const DASH_FEATS: FeatDef[] = [
  { id: 'dash:clean', game: 'dash', name: 'Clean run', blurb: 'Reached the flag without a single restart.' },
  { id: 'dash:stars', game: 'dash', name: 'Star collector', blurb: 'Took every star in a race and reached the flag.' },
]

/** The feats each seat earned in a finished match. */
export function dashFeats(live: DashLive): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  if (!live.result) return out
  for (const s of [0, 1] as Seat[]) {
    if (live.clean?.[s]) out[s].push('dash:clean')
    if (live.allStars?.[s]) out[s].push('dash:stars')
  }
  return out
}
