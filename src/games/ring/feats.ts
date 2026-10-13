import type { FeatDef } from '../../match/feats'
import type { RingLive, Seat } from './engine'

/** score this many in one game for Past fifty */
const FIFTY = 50
/** take this many squares in a row for Unbroken (three bonuses) */
const UNBROKEN = 24

export const RING_FEATS: FeatDef[] = [
  { id: 'ring:fifty', game: 'ring', name: 'Past fifty', blurb: `Scored ${FIFTY} or more in one game.` },
  { id: 'ring:unbroken', game: 'ring', name: 'Unbroken', blurb: `Took ${UNBROKEN} squares in a row without missing one.` },
]

/** The feats each seat earned in a finished match. */
export function ringFeats(live: RingLive): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  if (!live.result) return out
  for (const s of [0, 1] as Seat[]) {
    if ((live.top ?? [0, 0])[s] >= FIFTY) out[s].push('ring:fifty')
    if ((live.chain ?? [0, 0])[s] >= UNBROKEN) out[s].push('ring:unbroken')
  }
  return out
}
