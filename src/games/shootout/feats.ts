import type { FeatDef } from '../../match/feats'
import { key, shooterOf, type Seat, type ShootoutLive } from './engine'

/** save this many in one shootout for The wall */
const WALL = 3

export const SHOOTOUT_FEATS: FeatDef[] = [
  { id: 'shootout:wall', game: 'shootout', name: 'The wall', blurb: `Saved ${WALL} in one shootout.` },
  { id: 'shootout:panenka', game: 'shootout', name: 'Panenka', blurb: 'Scored high down the middle while the keeper dived to a side.' },
]

/** The feats each seat earned in a finished shootout. */
export function shootoutFeats(live: ShootoutLive): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  if (!live.result || live.result.why === 'foul') return out
  const saves: [number, number] = [0, 0]
  ;(live.log ?? []).forEach((o, n) => {
    if (o === 'saved' || o === 'tips') saves[1 - shooterOf(n, live.first)]++
  })
  for (const s of [0, 1] as Seat[]) {
    if (saves[s] >= WALL) out[s].push('shootout:wall')
    if (live.panenka?.[key(s)]) out[s].push('shootout:panenka')
  }
  return out
}
