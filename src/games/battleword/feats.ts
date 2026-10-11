import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { MAX_GUESSES, SOLVED, cracked, other, triesOf, type Live } from './engine'

/** Crack the word in this many guesses or fewer for Mind reader. */
const QUICK = 2

export const BATTLEWORD_FEATS: FeatDef[] = [
  { id: 'battleword:mindreader', game: 'battleword', name: 'Mind reader', blurb: `Cracked the other word in ${QUICK} guesses or fewer.` },
  { id: 'battleword:unbreakable', game: 'battleword', name: 'Unbreakable', blurb: 'Hid a word that lasted all six guesses without being cracked.' },
]

/** The feats each seat earned in a finished game (from the public guesses and colours only). */
export function battlewordFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  if (live.phase !== 'done') return out
  for (const s of [0, 1] as Seat[]) {
    const solvedAt = triesOf(live, s).findIndex((g) => g.p === SOLVED)
    if (solvedAt !== -1 && solvedAt < QUICK) out[s].push('battleword:mindreader')
    const theirs = triesOf(live, other(s))
    if (live.result?.reason !== 'forfeit' && theirs.length >= MAX_GUESSES && !cracked(theirs)) out[s].push('battleword:unbreakable')
  }
  return out
}
