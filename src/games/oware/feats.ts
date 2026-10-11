import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Live } from './engine'

/** Seeds taken with one sowing for Big haul. */
const HAUL = 12
/** Widest winning margin that still counts as a Nail-biter. */
const CLOSE = 2

export const OWARE_FEATS: FeatDef[] = [
  { id: 'oware:haul', game: 'oware', name: 'Big haul', blurb: `Captured ${HAUL} or more seeds with one sowing.` },
  { id: 'oware:nailbiter', game: 'oware', name: 'Nail-biter', blurb: `Won a game by ${CLOSE} seeds or fewer.` },
]

/** The feats each seat earned in a finished match (one game). */
export function owareFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const add = (s: Seat, id: string) => out[s].push(`oware:${id}`)
  for (const s of [0, 1] as Seat[]) if ((live.haul?.[s] ?? 0) >= HAUL) add(s, 'haul')
  const w = live.result?.winner
  if (w !== undefined && w !== -1 && live.captured[w] - live.captured[(1 - w) as Seat] <= CLOSE) add(w, 'nailbiter')
  return out
}
