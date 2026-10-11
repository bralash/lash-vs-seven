import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Live } from './engine'

export const HANGMAN_FEATS: FeatDef[] = [
  { id: 'hangman:clean', game: 'hangman', name: 'Clean read', blurb: 'Guessed a word without a single wrong letter.' },
  { id: 'hangman:stumper', game: 'hangman', name: 'Stumper', blurb: 'Set a word that never got guessed.' },
]

/** The feats each seat earned in a finished match (only public round results: a forfeited round counts for neither). */
export function hangmanFeats(live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s].add(`hangman:${id}`)
  for (const r of live.rounds ?? []) {
    if (r.outcome === 'escaped' && r.wrong === 0) add((1 - r.setter) as Seat, 'clean')
    if (r.outcome === 'hanged') add(r.setter, 'stumper')
  }
  return [[...out[0]], [...out[1]]]
}
