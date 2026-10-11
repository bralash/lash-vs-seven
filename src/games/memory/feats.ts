import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { other, pairOf, type Live } from './engine'

/** Pairs in a row (in one turn: a miss ends the turn) for Perfect recall. */
const RUN = 3

export const MEMORY_FEATS: FeatDef[] = [
  { id: 'memory:recall', game: 'memory', name: 'Perfect recall', blurb: `Found ${RUN} pairs in a row in one turn.` },
  { id: 'memory:shutout', game: 'memory', name: 'Shutout', blurb: 'Won with at least twice as many pairs as the other player.' },
]

/** The feats each seat earned in a finished game, read from the public flip log and scores. */
export function memoryFeats(live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s].add(`memory:${id}`)
  // every turn-over goes in the log, two to a try, so each try is a pair of entries
  const log = live.log ?? []
  let run = 0
  for (let k = 0; k + 1 < log.length; k += 2) {
    const [a, b] = [log[k], log[k + 1]]
    run = pairOf(a.c) === pairOf(b.c) ? run + 1 : 0
    if (run >= RUN) add(a.s, 'recall')
  }
  const r = live.result
  if (live.phase === 'done' && r && !r.forfeit && r.winner !== -1 && live.scores[r.winner] >= 2 * live.scores[other(r.winner)]) add(r.winner, 'shutout')
  return [[...out[0]], [...out[1]]]
}
