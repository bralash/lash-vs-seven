import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { FLEET, matchWinner, type Live } from './engine'

/** Win in this many shots or fewer for Sharpshooter (a perfect game is 17). */
const SHARP = 40

export const BATTLESHIP_FEATS: FeatDef[] = [
  { id: 'battleship:untouched', game: 'battleship', name: 'Untouched', blurb: 'Won a battle without losing a single ship.' },
  { id: 'battleship:wire', game: 'battleship', name: 'Down to the wire', blurb: 'Won a battle with just one ship left afloat.' },
  { id: 'battleship:sharpshooter', game: 'battleship', name: 'Sharpshooter', blurb: `Sank the whole fleet in ${SHARP} shots or fewer.` },
  { id: 'battleship:chain', game: 'battleship', name: 'Chain reaction', blurb: 'Hit with five shots in a row.' },
  { id: 'battleship:comeback', game: 'battleship', name: 'Comeback', blurb: 'Lost the first battle of a best of 3, then took the match.' },
]

/** The feats each seat earned in a finished match (each counted once per match, however many battles it came up in). */
export function battleshipFeats(live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s].add(`battleship:${id}`)
  const played = live.played ?? []
  for (const g of played) {
    for (const s of [0, 1] as Seat[]) if (g.run[s] >= 5) add(s, 'chain')
    // a conceded battle wasn't won at sea
    if (g.forfeit) continue
    const w = g.winner
    const lost = g.sank?.[w === 0 ? 1 : 0]
    if (lost === 0) add(w, 'untouched')
    if (lost === FLEET.length - 1) add(w, 'wire')
    if (g.shots[w] <= SHARP) add(w, 'sharpshooter')
  }
  const winner = matchWinner(live)
  if (live.best === 3 && winner !== -1 && played[0] && played[0].winner !== winner) add(winner, 'comeback')
  return [[...out[0]], [...out[1]]]
}
